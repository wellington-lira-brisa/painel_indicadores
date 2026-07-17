import { parsearCsv } from '../shared/csvIndicadores';
import { ANO_PAINEL } from '../data/mockHelpers';

// Meta por canal — DIFERENTE da Meta Geral da Cidade
// (metaInstalacaoFtthService.js/metaAtivacao5gService.js): fonte própria
// (dicionário de metas + fato de metas por vendedor, ver
// scripts/etl/consolidarMetaPorCanal.mjs e normalizarMetaPorCanal em
// csvIndicadores.js), granularidade própria (cidade+canal+indicador+mês).
// Cobre 4 categorias hoje: "orcamento" (Criado), "efetivado", "instalacao",
// "ativacao" (5G) — ver INDICADORES_POR_CATEGORIA_META em csvIndicadores.js.
// Os números não precisam bater com a Meta Geral — são conceitos
// distintos confirmados com o negócio: a Meta Geral alimenta
// Ranking/score; esta alimenta só a Meta do Indicador ("· meta") na
// tabela da cidade, filtrável pelo SeletorCanais.
//
// Volume pequeno (cidade×canal×indicador×mês, não vendedor×mês — a
// agregação já aconteceu no ETL), por isso carregado sempre, igual
// metas-instalacao-ftth.csv — não precisa do padrão "arquivo pesado, só
// busca sob demanda" usado em indicadores-realizados-por-canal.csv.
const CAMINHO_CSV = `${import.meta.env.BASE_URL}dados/metas-por-canal.csv`;

/** 'YYYY-MM-DD' -> índice 0-based do mês (jan=0), só quando o ano bate com ANO_PAINEL. Mesmo critério do resto do pipeline. */
function indiceDoMesNoAnoDoPainel(mesRefIso) {
  const ano = Number(mesRefIso.slice(0, 4));
  if (ano !== ANO_PAINEL) return null;
  return Number(mesRefIso.slice(5, 7)) - 1;
}

/** cidadeSlug -> indicadorId -> canal -> Map(mesIndex -> meta) */
function indexarPorCidadeIndicadorECanal(linhas) {
  const indice = new Map();
  for (const l of linhas) {
    // Defensivo: linha sem cidade_slug/mes_ref/indicador_id (CSV
    // reaberto/resalvo fora do pipeline, ex.: Excel trocando separador,
    // ou fetch caindo no fallback de HTML do Vite) não pode derrubar o
    // arquivo inteiro — só essa linha fica de fora, auditável no console,
    // igual ao critério de "nunca inventa" do resto do painel.
    if (!l.cidade_slug || !l.mes_ref || !l.indicador_id) {
      console.warn('metas-por-canal.csv: linha incompleta, ignorada:', l);
      continue;
    }

    const mesIndex = indiceDoMesNoAnoDoPainel(l.mes_ref);
    if (mesIndex === null) continue;

    if (!indice.has(l.cidade_slug)) indice.set(l.cidade_slug, new Map());
    const porIndicador = indice.get(l.cidade_slug);

    if (!porIndicador.has(l.indicador_id)) porIndicador.set(l.indicador_id, new Map());
    const porCanal = porIndicador.get(l.indicador_id);

    if (!porCanal.has(l.canal)) porCanal.set(l.canal, new Map());
    porCanal.get(l.canal).set(mesIndex, Number(l.meta));
  }
  return indice;
}

let cache = null; // null = ainda não carregado com sucesso nesta sessão

/** `cache: 'no-store'` — mesmo raciocínio dos outros arquivos publicados: pode ser atualizado a qualquer momento. */
export async function carregarMetaPorCanal() {
  const resposta = await fetch(CAMINHO_CSV, { cache: 'no-store' });
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar ${CAMINHO_CSV} (HTTP ${resposta.status}).`);
  }
  const texto = await resposta.text();
  const indice = indexarPorCidadeIndicadorECanal(parsearCsv(texto));
  cache = indice;
  return indice;
}

export function metaPorCanalEmCacheOuNulo() {
  return cache;
}

/**
 * Meta de um indicador (orcamento/efetivado/instalacao/ativacao), pra uma
 * cidade, somando os canais selecionados. `canaisSelecionados` vazio =
 * soma TODOS os canais disponíveis pra essa cidade+indicador
 * (comportamento padrão ao entrar na tela — "retorne todos os canais que
 * tiver na base"), não fica em branco esperando filtro. Cidade/indicador/
 * mês sem nenhum canal com meta cadastrada devolve `null` ("—"), nunca 0
 * — mesmo critério do resto do painel.
 */
export function metaPorCanalDoIndicador(indice, cidadeSlug, indicadorId, mesIndex, canaisSelecionados = []) {
  const porCanal = indice?.get(cidadeSlug)?.get(indicadorId);
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