/**
 * Regras de classificação de status por cidade/indicador.
 * Verde  : atingimento >= 90%
 * Amarelo: atingimento entre 75% e 89,99%
 * Vermelho: atingimento < 75%
 */
const STATUS = {
  VERDE: 'verde',
  AMARELO: 'amarelo',
  VERMELHO: 'vermelho',
};

const STATUS_LIMITES = { verde: 90, amarelo: 75 };

/** Classes Tailwind de cor de texto por status, usadas em tabelas e cards. */
export const STATUS_COR_TEXTO = {
  verde: 'text-emerald-700',
  amarelo: 'text-amber-700',
  vermelho: 'text-red-700',
};

export function classificarAtingimento(percentual) {
  if (percentual >= STATUS_LIMITES.verde) return STATUS.VERDE;
  if (percentual >= STATUS_LIMITES.amarelo) return STATUS.AMARELO;
  return STATUS.VERMELHO;
}

/** Razão realizado/meta (ou invertida, se "menor é melhor"), limitada a 150%. */
function razaoAtingimento(melhorQuandoMaior, realizado, meta) {
  const razao = melhorQuandoMaior ? realizado / meta : meta / Math.max(realizado, 0.0001);
  return Math.min(razao * 100, 150);
}

/**
 * Atingimento acumulado de um indicador (apenas meses com realizado informado).
 * Para indicadores onde "menor é melhor" (ex.: churn), o atingimento é invertido:
 * meta/realizado, limitado a 150% para não distorcer a média.
 *
 * `campoMeta` decide QUAL meta usar: `'meta'` (padrão, Meta Geral da Cidade —
 * usada em scoreCidade/Ranking) ou `'metaIndicador'` (Meta do Indicador,
 * usada na tabela da cidade — ver TabelaIndicadores.jsx). Enquanto
 * `metaIndicador` não tem fonte cadastrada (sempre `null`), a soma dá 0 e
 * isso devolve `null` — atingimento só aparece na tabela quando a meta do
 * indicador aparecer.
 */
export function atingimentoIndicador(indicador, campoMeta = 'meta') {
  const meses = indicador.meses.filter((m) => m.realizado !== null);
  if (meses.length === 0) return null;

  const meta = meses.reduce((acc, m) => acc + (m[campoMeta] ?? 0), 0);
  const realizado = meses.reduce((acc, m) => acc + m.realizado, 0);
  if (meta === 0) return null;

  return razaoAtingimento(indicador.melhorQuandoMaior, realizado, meta);
}

/**
 * Score da cidade: média simples dos atingimentos válidos dos indicadores.
 * `null` quando NENHUM indicador tem meta+realizado pra calcular — não é
 * "0%" (que seria "meta batida em 0%", ou seja, uma nota péssima real).
 * Cidades sem meta cadastrada (ex.: só existem na base real, nunca foram
 * cadastradas — ver cidadeService.js) caem aqui; distinguir isso de
 * "score baixo de verdade" é o que `statusCidade` usa pra não rotular uma
 * cidade sem meta como "Crítico".
 */
export function scoreCidade(cidade) {
  const valores = cidade.indicadores
    .map((ind) => atingimentoIndicador(ind))
    .filter((v) => v !== null);
  if (valores.length === 0) return null;
  return valores.reduce((acc, v) => acc + v, 0) / valores.length;
}

export function statusCidade(cidade) {
  const score = scoreCidade(cidade);
  return score === null ? 'sem-dado' : classificarAtingimento(score);
}

/** Último mês com realizado apurado de um indicador, ou null se nenhum. */
export function ultimoMesApurado(indicador) {
  const apurados = indicador.meses.filter((m) => m.realizado !== null);
  return apurados.length > 0 ? apurados[apurados.length - 1] : null;
}

/**
 * Atingimento (%) de um único mês do indicador, ou null se não apurado.
 * Mesmo `campoMeta` de atingimentoIndicador — padrão `'meta'` (Meta Geral).
 */
export function atingimentoMes(indicador, mes, campoMeta = 'meta') {
  const metaValor = mes[campoMeta];
  if (mes.realizado === null || !metaValor) return null;
  return razaoAtingimento(indicador.melhorQuandoMaior, mes.realizado, metaValor);
}

/** Textos dos tooltips (IconeInfo) do Ranking — um lugar só pra manter a explicação igual em toda tela que usa `resumoMetaRealizado`. */
export const EXPLICACAO_META_GERAL =
  'Meta Geral da Cidade: meta do indicador de referência (Instalação no FTTH, Ativação no 5G), acumulada até o último mês apurado do ano. Não é a meta de um indicador específico — essa fica só na tabela de indicadores dentro da cidade, quando existir.';

export const EXPLICACAO_REALIZADO_GERAL =
  'Realizado acumulado do ano até o último mês apurado, do mesmo indicador de referência da Meta Geral. Filtrar por canal recalcula esse número — a meta continua sendo a da cidade inteira.';

export const EXPLICACAO_META_REALIZADO_GERAL =
  'Realizado e Meta Geral da Cidade, acumulados do ano até o último mês apurado, do indicador de referência (Instalação no FTTH, Ativação no 5G). Filtrar por canal recalcula o realizado — a meta continua sendo a da cidade inteira.';

export const EXPLICACAO_ATINGIMENTO =
  'Realizado ÷ Meta Geral (colunas ao lado), do mesmo indicador de referência. Não é a média de todos os indicadores da cidade — só desse indicador.';

/** Texto do tooltip (IconeInfo) em toda tela que mostra a Projeção (mês) — um só lugar pra manter a explicação igual em todo canto. */
export const EXPLICACAO_PROJECAO_FECHAMENTO =
  'Estimativa de fechamento do mês atual: pega o ritmo médio das semanas já apuradas e extrapola pro total de semanas do mês. Não é meta nem o acumulado do ano — só uma projeção de curto prazo.';

/**
 * Projeção de fechamento do mês corrente de um indicador: ritmo semanal —
 * realizado das semanas JÁ apuradas nesse mês, dividido pela quantidade
 * de semanas apuradas, extrapolado pro total de semanas do mês (4 ou 5,
 * conforme o calendário real — ver utils/semanas.js). `null` quando
 * nenhuma semana do mês tem dado ainda (nada pra projetar, nunca inventa
 * ritmo a partir de zero) ou quando o indicador não tem granularidade
 * semanal (`possuiSemanas: false` — ver mockHelpers.js).
 */
export function projecaoFechamentoMes(indicador, indiceMes) {
  const mes = indicador.meses[indiceMes];
  if (!mes) return null;

  const semanasApuradas = mes.semanas.filter((s) => s.valor !== null);
  if (semanasApuradas.length === 0) return null;

  const realizadoParcial = semanasApuradas.reduce((acc, s) => acc + s.valor, 0);
  const ritmoSemanal = realizadoParcial / semanasApuradas.length;
  return ritmoSemanal * mes.semanas.length;
}