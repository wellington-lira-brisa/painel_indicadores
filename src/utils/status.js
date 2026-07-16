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
    .map(atingimentoIndicador)
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

/**
 * Tendência: compara o atingimento do último mês realizado com a média dos anteriores.
 * Retorna 'alta' | 'estavel' | 'queda'.
 */
export function tendenciaCidade(cidade) {
  const porMes = {};
  cidade.indicadores.forEach((ind) => {
    ind.meses.forEach((m, i) => {
      if (m.realizado === null || m.meta === 0) return;
      const razao = ind.melhorQuandoMaior
        ? m.realizado / m.meta
        : m.meta / Math.max(m.realizado, 0.0001);
      (porMes[i] ??= []).push(Math.min(razao, 1.5));
    });
  });

  const indices = Object.keys(porMes).map(Number).sort((a, b) => a - b);
  if (indices.length < 2) return 'estavel';

  const media = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const ultimo = media(porMes[indices.at(-1)]);
  const anteriores = media(indices.slice(0, -1).flatMap((i) => porMes[i]));

  if (ultimo > anteriores * 1.03) return 'alta';
  if (ultimo < anteriores * 0.97) return 'queda';
  return 'estavel';
}