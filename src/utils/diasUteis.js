import { obterTodosOsFeriadosParaAno } from '../vendor/feriados/feriadosCalculo.js';

/**
 * Lógica pura do rateio de Meta do Indicador por dias úteis. Fonte de
 * verdade do CALENDÁRIO COMERCIAL (o que conta como dia útil pra ratear
 * meta) é a base real (dias-uteis.csv, um ledger de dias JÁ OCORRIDOS —
 * não um calendário pré-computado pro ano inteiro). Pra dias FUTUROS
 * (depois da última data que a base já tem), este módulo PROJETA o peso
 * por calendário (ver construirEstimadorPorCalendario) — usando o motor
 * de feriados que o sistema já tem só pra saber QUAIS datas futuras são
 * feriado nacional/estadual, nunca pra substituir dado real já existente
 * na base (base real sempre tem prioridade — ver diasUteisNoIntervalo).
 *
 * IMPORTANTE: "dia ausente da base" e "dia futuro" NÃO são a mesma
 * coisa. A base tem buracos no PASSADO também (algumas UFs — ex.: SE,
 * AL — têm dias de semana comuns sem registro, mesmo já tendo
 * acontecido; ver auditoria da base). Esses buracos contam como 0 e
 * NUNCA são marcados como "projeção" — não existe "quando a base
 * atualizar" pra um dia que já passou e nunca foi registrado; marcar
 * como projeção ali seria prometer uma correção que não vai acontecer.
 * Só dia estritamente APÓS a última data presente na base (`ultimaData`)
 * é candidato a projeção.
 *
 * Isso é DIFERENTE de reconciliar o passado com o motor de feriados —
 * já vimos que divergem em datas conhecidas (19/03 e 25/03 no CE, por
 * exemplo). Aqui o motor só preenche uma lacuna que a base de verdade
 * estruturalmente não pode ter ainda (o futuro); assim que o dia real
 * chega na base (próxima atualização do arquivo), ele substitui a
 * estimativa automaticamente — nenhum código precisa mudar.
 */

const DOMINGO = 0;
const SABADO = 6;

function dataIso(ano, mesIndice, dia) {
  return `${ano}-${String(mesIndice + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Índice: Map<"UF|AAAA-MM-DD", peso>. Peso é o "dias_trabalhado" da
 * base (0, 0.5 ou 1; sábado = 0.5 em geral, 0 em PE — única exceção
 * observada na base). `ultimaData` é a maior data presente em QUALQUER
 * linha da base (string AAAA-MM-DD, comparável lexicograficamente) —
 * usada por diasUteisNoIntervalo pra saber o que é "futuro" de fato,
 * distinto de um buraco no passado. */
export function indexarDiasUteis(linhas) {
  const indice = new Map();
  let ultimaData = null;
  for (const linha of linhas) {
    const chave = `${linha.UF}|${linha.data}`;
    indice.set(chave, Number(linha.dias_trabalhado) || 0);
    if (ultimaData === null || linha.data > ultimaData) ultimaData = linha.data;
  }
  return { indice, ultimaData };
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
 * dias do mês) pra uma UF. Ordem de prioridade por dia:
 *
 * 1. Base real (`indice`) — sempre que existir, usa ela.
 * 2. Dia estritamente APÓS `ultimaData` (futuro de verdade) — usa
 *    `estimarPeso`, se fornecido, e marca `temDiaProjetado`.
 * 3. Dia ausente mas ≤ `ultimaData` (buraco no passado, ex.: SE/AL) —
 *    conta como 0, NUNCA marca projeção (não existe "vai chegar" pra
 *    dia que já passou e não foi registrado).
 *
 * Sem `ultimaData` (compatibilidade/teste), todo dia ausente é tratado
 * como (2) — comportamento antigo.
 */
export function diasUteisNoIntervalo(indice, uf, ano, mesIndice, diaInicio, diaFim, estimarPeso = null, ultimaData = null) {
  let soma = 0;
  let temDiaProjetado = false;
  for (let dia = diaInicio; dia <= diaFim; dia += 1) {
    const iso = dataIso(ano, mesIndice, dia);
    const chave = `${uf}|${iso}`;
    if (indice.has(chave)) {
      soma += indice.get(chave);
    } else if (estimarPeso && (ultimaData === null || iso > ultimaData)) {
      soma += estimarPeso(mesIndice, dia);
      temDiaProjetado = true;
    }
    // ausente e (tem ultimaData e iso <= ultimaData): buraco no passado, soma += 0, sem flag.
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
 * dela é FUTURO (depois de `ultimaData`) e foi estimado por calendário
 * — nunca por causa de um buraco no passado (ver diasUteisNoIntervalo).
 *
 * Devolve `null` (nunca um rateio inventado) quando o peso total do mês
 * é 0 — mês inteiro sem base real e sem estimador (ou totalmente no
 * passado com buracos em todos os dias).
 */
export function ratearMetaPorSemanas(metaTotal, semanas, uf, ano, mesIndice, indice, estimarPeso = null, ultimaData = null) {
  if (metaTotal === null || metaTotal === undefined || !uf) return null;

  const porSemana = semanas.map((semana) =>
    diasUteisNoIntervalo(indice, uf, ano, mesIndice, semana.diaInicio, semana.diaFim, estimarPeso, ultimaData),
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