/**
 * Lógica pura do rateio de Meta do Indicador por dias úteis. Fonte de
 * verdade do CALENDÁRIO COMERCIAL (o que conta como dia útil pra ratear
 * meta), DISTINTA do motor de feriados em vendor/feriados — aquele é
 * usado só pra EXIBIR feriados na tabela (FeriadosMes.jsx) e diverge
 * deste em datas reais: por exemplo, em 2026 o motor de feriados marca
 * 19/03 (São José) e 25/03 (Abolição da Escravidão no CE) como feriado
 * estadual, mas a base comercial trata os dois como dia útil normal — e
 * o motor de feriados NÃO tem 16/02 (segunda de Carnaval), que a base
 * comercial marca como não-útil. São calendários diferentes de
 * propósito (feriado público x dia útil comercial); não reconciliar.
 *
 * IO (fetch/cache do CSV) fica em services/diasUteisService.js — este
 * arquivo não importa nada, pra rodar sob `node --test` sem precisar de
 * Vite (mesmo raciocínio de utils/semanas.js e utils/textoBusca.js).
 */

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
 * Soma o peso de dias úteis de um intervalo [diaInicio, diaFim] (inclusive,
 * dias do mês) pra uma UF. Dia sem linha na base = peso 0 — decisão
 * explícita (SE e AL têm dias de semana normais sem linha na base atual;
 * tratados como não-útil até a base completa chegar). Nunca lança erro,
 * nunca inventa 1.0.
 */
export function diasUteisNoIntervalo(indice, uf, ano, mesIndice, diaInicio, diaFim) {
  let soma = 0;
  for (let dia = diaInicio; dia <= diaFim; dia += 1) {
    soma += indice.get(`${uf}|${dataIso(ano, mesIndice, dia)}`) ?? 0;
  }
  return soma;
}

/**
 * Rateia `metaTotal` (mensal, já um número real — nunca null) pelas
 * `semanas` do mês (mesmo formato de semanasDoMes: {numero, diaInicio,
 * diaFim}), proporcional ao peso de dias úteis de cada semana. Mesmo
 * princípio de fechamento exato usado em distribuirValorPorSemanas
 * (mockHelpers.js): a última semana absorve o resto da divisão, então a
 * soma das semanas bate exatamente com `metaTotal`.
 *
 * Devolve `null` (nunca um rateio inventado) quando o peso total do mês
 * é 0 — cobre tanto "mês inteiro fora da base ainda" (ex.: mai-dez/2026
 * até a base completa chegar) quanto uma UF sem nenhum dado. É o mesmo
 * "—" que a tabela já mostra hoje pra Meta do Indicador sem fonte.
 */
export function ratearMetaPorSemanas(metaTotal, semanas, uf, ano, mesIndice, indice) {
  if (metaTotal === null || metaTotal === undefined || !uf) return null;

  const pesos = semanas.map((semana) => diasUteisNoIntervalo(indice, uf, ano, mesIndice, semana.diaInicio, semana.diaFim));
  const pesoTotal = pesos.reduce((acc, p) => acc + p, 0);
  if (pesoTotal === 0) return null;

  let acumulado = 0;
  return semanas.map((semana, i) => {
    const ehUltima = i === semanas.length - 1;
    const valor = ehUltima ? Math.round((metaTotal - acumulado) * 100) / 100 : Math.round(((metaTotal * pesos[i]) / pesoTotal) * 100) / 100;
    acumulado += valor;
    return { ...semana, valor };
  });
}