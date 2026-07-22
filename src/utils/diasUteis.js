import { obterTodosOsFeriadosParaAno } from '../vendor/feriados/feriadosCalculo.js';

/**
 * Lógica pura do rateio de Meta do Indicador por dias úteis. Fonte de
 * verdade do CALENDÁRIO COMERCIAL (o que conta como dia útil pra ratear
 * meta) é a base real (dias-uteis.csv, um ledger de dias JÁ OCORRIDOS —
 * não um calendário pré-computado pro ano inteiro). Pra dias que a base
 * ainda não cobre (sempre o futuro, e o "hoje" de cada atualização),
 * este módulo PROJETA o peso por calendário (ver construirEstimadorPorCalendario)
 * — usando o motor de feriados que o sistema já tem só pra saber QUAIS
 * datas futuras são feriado nacional/estadual, nunca pra substituir dado
 * real já existente na base (ver diasUteisNoIntervalo: base real sempre
 * tem prioridade).
 *
 * Isso é DIFERENTE de reconciliar o passado com o motor de feriados —
 * já vimos que divergem em datas conhecidas (19/03 e 25/03 no CE, por
 * exemplo). Aqui o motor só preenche uma lacuna que a base de verdade
 * estruturalmente não pode ter ainda; assim que o dia real chega na
 * base (próxima atualização do arquivo), ele substitui a estimativa
 * automaticamente — nenhum código precisa mudar.
 */

const DOMINGO = 0;
const SABADO = 6;

/** Índice: Map<"UF|AAAA-MM-DD", peso>. Peso é o "dias_trabalhado" da
 * base (0, 0.5 ou 1; sábado = 0.5 em geral, 0 em PE — única exceção
 * observada na base). */
export function indexarDiasUteis(linhas) {
  const indice = new Map();
  for (const linha of linhas) {
    const chave = `${linha.UF}|${linha.data}`;
    indice.set(chave, Number(linha.dias_trabalhado) || 0);
  }
  return indice;
}

function dataIso(ano, mesIndice, dia) {
  return `${ano}-${String(mesIndice + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Monta um estimador de peso de dia útil por CALENDÁRIO, pra uma UF+ano:
 * seg-sex=1, sábado=0.5 (0 em PE), domingo=0, feriado nacional/estadual=0
 * (via obterTodosOsFeriadosParaAno — mesma fonte que já popula
 * FeriadosMes.jsx). Cacheia a lista de feriados do ano (1 chamada ao
 * motor por UF+ano, não por dia).
 *
 * Feriado MUNICIPAL não entra aqui (o estimador não recebe cidade, só
 * UF) — simplificação aceitável só pra estimar dias futuros; o dado
 * real, quando chegar, corrige qualquer diferença.
 *
 * Datas construídas com `new Date(ano, mes, dia)` (local) e comparadas
 * por Y/M/D locais, nunca `toISOString()` — evita o bug de fuso horário
 * que deslocaria o dia (mesmo cuidado de formatarDataFeriado em
 * FeriadosMes.jsx).
 */
export function construirEstimadorPorCalendario(ano, uf) {
  const feriados = new Set(
    obterTodosOsFeriadosParaAno(ano, uf, null, false).map((f) => dataIso(f.data.getFullYear(), f.data.getMonth(), f.data.getDate())),
  );

  return function pesoEstimado(mesIndice, dia) {
    if (feriados.has(dataIso(ano, mesIndice, dia))) return 0;
    const diaSemana = new Date(ano, mesIndice, dia).getDay();
    if (diaSemana === DOMINGO) return 0;
    if (diaSemana === SABADO) return uf === 'PE' ? 0 : 0.5;
    return 1;
  };
}

/**
 * Soma o peso de dias úteis de um intervalo [diaInicio, diaFim] (inclusive,
 * dias do mês) pra uma UF. Base real (`indice`) tem prioridade sempre;
 * dia ausente dela usa `estimarPeso(mesIndice, dia)` se fornecido (ver
 * construirEstimadorPorCalendario), senão conta como 0 (mesmo
 * comportamento de antes, usado nos testes que não passam estimador).
 *
 * Devolve também `temDiaProjetado`: true se PELO MENOS 1 dia do
 * intervalo veio do estimador (não da base real) — usado pra marcar a
 * semana como "projeção" na interface (ver TabelaIndicadores.jsx).
 */
export function diasUteisNoIntervalo(indice, uf, ano, mesIndice, diaInicio, diaFim, estimarPeso = null) {
  let soma = 0;
  let temDiaProjetado = false;
  for (let dia = diaInicio; dia <= diaFim; dia += 1) {
    const chave = `${uf}|${dataIso(ano, mesIndice, dia)}`;
    if (indice.has(chave)) {
      soma += indice.get(chave);
    } else if (estimarPeso) {
      soma += estimarPeso(mesIndice, dia);
      temDiaProjetado = true;
    }
    // dia ausente sem estimador: soma += 0 (nada a fazer)
  }
  return { soma, temDiaProjetado };
}

/**
 * Rateia `metaTotal` (mensal, já um número real — nunca null) pelas
 * `semanas` do mês (mesmo formato de semanasDoMes: {numero, diaInicio,
 * diaFim}), proporcional ao peso de dias úteis de cada semana. Mesmo
 * princípio de fechamento exato usado em distribuirValorPorSemanas
 * (mockHelpers.js): a última semana absorve o resto da divisão, então a
 * soma das semanas bate exatamente com `metaTotal`.
 *
 * Cada semana do retorno tem `projecao: true` quando pelo menos 1 dia
 * dela foi estimado por calendário (ainda não confirmado pela base
 * real) — a interface usa isso pra avisar o usuário, nunca escondendo
 * que é uma estimativa.
 *
 * Devolve `null` (nunca um rateio inventado) quando o peso total do mês
 * é 0 — só acontece sem `estimarPeso` (UF sem estimador de calendário
 * disponível) e sem nenhum dado real pro mês inteiro.
 */
export function ratearMetaPorSemanas(metaTotal, semanas, uf, ano, mesIndice, indice, estimarPeso = null) {
  if (metaTotal === null || metaTotal === undefined || !uf) return null;

  const porSemana = semanas.map((semana) =>
    diasUteisNoIntervalo(indice, uf, ano, mesIndice, semana.diaInicio, semana.diaFim, estimarPeso),
  );
  const pesoTotal = porSemana.reduce((acc, s) => acc + s.soma, 0);
  if (pesoTotal === 0) return null;

  let acumulado = 0;
  return semanas.map((semana, i) => {
    const ehUltima = i === semanas.length - 1;
    const valor = ehUltima
      ? Math.round((metaTotal - acumulado) * 100) / 100
      : Math.round(((metaTotal * porSemana[i].soma) / pesoTotal) * 100) / 100;
    acumulado += valor;
    return { ...semana, valor, projecao: porSemana[i].temDiaProjetado };
  });
}