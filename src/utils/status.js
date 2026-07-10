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

/**
 * Atingimento acumulado de um indicador (apenas meses com realizado informado).
 * Para indicadores onde "menor é melhor" (ex.: churn), o atingimento é invertido:
 * meta/realizado, limitado a 150% para não distorcer a média.
 */
export function atingimentoIndicador(indicador) {
  const meses = indicador.meses.filter((m) => m.realizado !== null);
  if (meses.length === 0) return null;

  const meta = meses.reduce((acc, m) => acc + m.meta, 0);
  const realizado = meses.reduce((acc, m) => acc + m.realizado, 0);
  if (meta === 0) return null;

  const razao = indicador.melhorQuandoMaior
    ? realizado / meta
    : meta / Math.max(realizado, 0.0001);
  return Math.min(razao * 100, 150);
}

/** Score da cidade: média simples dos atingimentos válidos dos indicadores. */
export function scoreCidade(cidade) {
  const valores = cidade.indicadores
    .map(atingimentoIndicador)
    .filter((v) => v !== null);
  if (valores.length === 0) return 0;
  return valores.reduce((acc, v) => acc + v, 0) / valores.length;
}

export function statusCidade(cidade) {
  return classificarAtingimento(scoreCidade(cidade));
}

/** Último mês com realizado apurado de um indicador, ou null se nenhum. */
export function ultimoMesApurado(indicador) {
  const apurados = indicador.meses.filter((m) => m.realizado !== null);
  return apurados.length > 0 ? apurados[apurados.length - 1] : null;
}

/** Atingimento (%) de um único mês do indicador, ou null se não apurado. */
export function atingimentoMes(indicador, mes) {
  if (mes.realizado === null || mes.meta === 0) return null;
  const razao = indicador.melhorQuandoMaior
    ? mes.realizado / mes.meta
    : mes.meta / Math.max(mes.realizado, 0.0001);
  return Math.min(razao * 100, 150);
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