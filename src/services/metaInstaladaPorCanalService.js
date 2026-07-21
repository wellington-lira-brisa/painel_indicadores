import { parsearCsv } from '../shared/csvIndicadores';
import { carregarCsvDados } from './dadosProtegidosService';
import { ANO_PAINEL } from '../data/mockHelpers';

// Meta de Instalação (FTTH) por canal — DIFERENTE da Meta Geral da Cidade
// (metaInstalacaoFtthService.js): fonte própria (dicionário de metas +
// fato de metas por vendedor, ver scripts/etl/consolidarMetaInstaladaPorCanal.mjs
// e normalizarMetaInstaladaPorCanal em csvIndicadores.js), granularidade
// própria (cidade+canal+mês). Os dois números não precisam bater — são
// conceitos distintos confirmados com o negócio: a Meta Geral alimenta
// Ranking/score; esta alimenta só a Meta do Indicador ("Instalação ·
// meta") na tabela da cidade, filtrável pelo SeletorCanais.
//
// Volume pequeno (cidade×canal×mês, não vendedor×mês — a agregação já
// aconteceu no ETL), por isso carregado sempre, igual
// metas-instalacao-ftth.csv — não precisa do padrão "arquivo pesado, só
// busca sob demanda" usado em indicadores-realizados-por-canal.csv.
const NOME_ARQUIVO = 'metas-instalacao-por-canal.csv';

/** 'YYYY-MM-DD' -> índice 0-based do mês (jan=0), só quando o ano bate com ANO_PAINEL. Mesmo critério do resto do pipeline. */
function indiceDoMesNoAnoDoPainel(mesRefIso) {
  const ano = Number(mesRefIso.slice(0, 4));
  if (ano !== ANO_PAINEL) return null;
  return Number(mesRefIso.slice(5, 7)) - 1;
}

/** cidadeSlug -> canal -> Map(mesIndex -> meta) */
function indexarPorCidadeECanal(linhas) {
  const indice = new Map();
  for (const l of linhas) {
    const mesIndex = indiceDoMesNoAnoDoPainel(l.mes_ref);
    if (mesIndex === null) continue;

    if (!indice.has(l.cidade_slug)) indice.set(l.cidade_slug, new Map());
    const porCanal = indice.get(l.cidade_slug);

    if (!porCanal.has(l.canal)) porCanal.set(l.canal, new Map());
    porCanal.get(l.canal).set(mesIndex, Number(l.meta));
  }
  return indice;
}

let cache = null; // null = ainda não carregado com sucesso nesta sessão

/** `cache: 'no-store'` — mesmo raciocínio dos outros arquivos publicados: pode ser atualizado a qualquer momento. */
export async function carregarMetaInstaladaPorCanal() {
  const texto = await carregarCsvDados(NOME_ARQUIVO);
  const indice = indexarPorCidadeECanal(parsearCsv(texto));
  cache = indice;
  return indice;
}

export function metaInstaladaPorCanalEmCacheOuNulo() {
  return cache;
}

/**
 * Meta do indicador "instalacao", pra uma cidade, somando os canais
 * selecionados. `canaisSelecionados` vazio = soma TODOS os canais
 * disponíveis pra essa cidade (comportamento padrão ao entrar na tela —
 * "retorne todos os canais que tiver na base"), não fica em branco
 * esperando filtro. Mês sem nenhum canal com meta cadastrada devolve
 * `null` ("—"), nunca 0 — mesmo critério do resto do painel.
 */
export function metaPorCanalDaCidade(indice, cidadeSlug, mesIndex, canaisSelecionados = []) {
  const porCanal = indice?.get(cidadeSlug);
  if (!porCanal) return null;

  const canais = canaisSelecionados.length > 0 ? canaisSelecionados : [...porCanal.keys()];

  let soma = null;
  for (const canal of canais) {
    const valor = porCanal.get(canal)?.get(mesIndex);
    if (valor === undefined) continue;
    soma = (soma ?? 0) + valor;
  }
  return soma;
}