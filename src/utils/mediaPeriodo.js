import { atingimentoIndicador } from './status';

/** Índices (inclusive) do intervalo mesInicial..mesFinal. Vazio se o intervalo for inválido. */
export function indicesDoPeriodo(mesInicial, mesFinal) {
  if (mesInicial > mesFinal) return [];
  return Array.from({ length: mesFinal - mesInicial + 1 }, (_, i) => mesInicial + i);
}

function media(valores) {
  if (valores.length === 0) return null;
  return valores.reduce((acc, v) => acc + v, 0) / valores.length;
}

/**
 * Média de meta e realizado de um indicador num período, mais o atingimento
 * recalculado só para esse recorte. O atingimento reaproveita
 * `atingimentoIndicador` passando um indicador "fatiado" — só com os meses
 * do período —, em vez de duplicar a regra de soma meta/realizado e a
 * inversão pra indicadores onde menor é melhor (churn, cancelamento).
 *
 * `realizadoMedia` conta só meses já apurados (ignora `null`); `metaMedia`
 * usa todos os meses do período, já que a meta é sempre definida de antemão.
 */
export function calcularMediaIndicador(indicador, indicesPeriodo) {
  const mesesDoPeriodo = indicesPeriodo.map((i) => indicador.meses[i]);
  const apurados = mesesDoPeriodo.filter((m) => m.realizado !== null);

  return {
    metaMedia: media(mesesDoPeriodo.map((m) => m.meta)),
    realizadoMedia: media(apurados.map((m) => m.realizado)),
    atingimentoPeriodo: atingimentoIndicador({ ...indicador, meses: mesesDoPeriodo }),
    quantidadeMesesApurados: apurados.length,
    quantidadeMesesNoPeriodo: mesesDoPeriodo.length,
  };
}

/**
 * Média da Base Ativa num período. É um valor de estoque (snapshot mensal),
 * não de fluxo — mesmo assim, a média simples dos snapshots do período é o
 * que ferramentas de BI mostram como "base ativa média do período", então
 * segue a mesma regra: ignora meses sem apuração.
 */
export function calcularMediaBaseAtiva(baseAtiva, indicesPeriodo) {
  const valores = indicesPeriodo
    .map((i) => baseAtiva[i]?.valor)
    .filter((valor) => valor !== null && valor !== undefined);
  return media(valores);
}