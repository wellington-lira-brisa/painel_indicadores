import { atingimentoIndicador } from './status';

/** Textos dos tooltips (IconeInfo) do card "Média do período" — um lugar só pra manter a explicação igual em toda tela que usar esse resumo. */
export const EXPLICACAO_BASE_ATIVA_MEDIA =
  'Base Ativa é um valor de estoque (quantos clientes ativos naquele momento), não de fluxo — a média aqui é a média simples dos valores de fim de mês do período, ignorando mês sem apuração. Não soma, não acumula.';

export const EXPLICACAO_META_MEDIA_PERIODO =
  'Média da Meta por Canal (recortada pelo canal selecionado no filtro — soma todos os canais quando nenhum está selecionado) nos meses do período que TÊM meta. Mês sem meta cadastrada é ignorado, não conta como zero.';

export const EXPLICACAO_REALIZADO_MEDIA_PERIODO =
  'Média do realizado nos meses do período que já foram apurados, recortado pelo mesmo canal do filtro. Mês sem apuração é ignorado, não conta como zero. "X/Y apurados" avisa quando nem todo mês do período tem dado ainda.';

export const EXPLICACAO_ATINGIMENTO_PERIODO =
  'Soma do realizado por canal ÷ soma da meta por canal, só dos meses apurados do período — não é a razão entre as duas médias ao lado (que usam conjuntos de meses independentes). Indicador onde menor é melhor (ex.: churn) inverte a conta; resultado limitado a 150%.';

export const EXPLICACAO_META_GERAL_MEDIA_PERIODO =
  'Média da Meta Geral da Cidade (mesma fonte do Ranking, NUNCA recortada por canal) nos meses do período que têm meta cadastrada. Conceito à parte da Meta por Canal ao lado — os dois números não precisam bater.';

export const EXPLICACAO_REALIZADO_GERAL_MEDIA_PERIODO =
  'Média do realizado da cidade inteira (ignora o filtro de canal, sempre soma todo mundo) nos meses já apurados do período.';

export const EXPLICACAO_ATINGIMENTO_GERAL_PERIODO =
  'Soma do realizado da cidade inteira ÷ soma da Meta Geral da Cidade, só dos meses apurados do período — mesma lógica do Atingimento por canal, mas sem nenhum recorte de canal.';

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
 * recalculado só para esse recorte — POR CANAL (`metaIndicador`/`realizado`,
 * ambos já recortados pelo canal selecionado no filtro — ver
 * metaPorCanalDoIndicador/indicePorCanalComFallback em cidadeService.js).
 * O atingimento reaproveita `atingimentoIndicador` passando um indicador
 * "fatiado" — só com os meses do período —, em vez de duplicar a regra de
 * soma meta/realizado e a inversão pra indicadores onde menor é melhor
 * (churn, cancelamento).
 *
 * Também devolve `metaGeralMedia`/`realizadoGeralMedia`/`atingimentoGeralPeriodo`:
 * mesma ideia, mas SEMPRE com `meta`/`realizadoGeral` (Meta Geral da
 * Cidade e realizado sem filtro de canal — conceito à parte, não precisa
 * bater com o trio por canal).
 *
 * Cada média ignora, no seu próprio par (meta/realizado do canal, ou
 * meta/realizado geral), os meses em que o valor é `null` — uma cidade
 * sem cadastro de meta (existe só na base real, nunca foi cadastrada —
 * ver cidadeService.js) tem meta `null` em todo mês; `media([null,
 * null, ...])` sem esse filtro somaria "null" como 0 e devolveria 0
 * (parece "meta zerada", quando na verdade é "meta desconhecida" — `null`
 * deveria virar "—", não "0").
 */
export function calcularMediaIndicador(indicador, indicesPeriodo) {
  const mesesDoPeriodo = indicesPeriodo.map((i) => indicador.meses[i]);

  const apuradosCanal = mesesDoPeriodo.filter((m) => m.realizado !== null);
  const comMetaCanal = mesesDoPeriodo.filter((m) => m.metaIndicador !== null);

  const apuradosGeral = mesesDoPeriodo.filter((m) => m.realizadoGeral !== null);
  const comMetaGeral = mesesDoPeriodo.filter((m) => m.meta !== null);

  const indicadorDoPeriodo = { ...indicador, meses: mesesDoPeriodo };

  return {
    metaMedia: media(comMetaCanal.map((m) => m.metaIndicador)),
    realizadoMedia: media(apuradosCanal.map((m) => m.realizado)),
    atingimentoPeriodo: atingimentoIndicador(indicadorDoPeriodo, 'metaIndicador'),
    quantidadeMesesApurados: apuradosCanal.length,
    quantidadeMesesNoPeriodo: mesesDoPeriodo.length,

    metaGeralMedia: media(comMetaGeral.map((m) => m.meta)),
    realizadoGeralMedia: media(apuradosGeral.map((m) => m.realizadoGeral)),
    atingimentoGeralPeriodo: atingimentoIndicador(indicadorDoPeriodo, 'meta', 'realizadoGeral'),
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