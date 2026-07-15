import { parsearCsv } from '../shared/csvIndicadores';
import { ANO_PAINEL } from '../data/mockHelpers';

// Primeira meta real do painel (ver normalizarMetasInstalacaoFtth em
// csvIndicadores.js) — cobre FTTH/Instalação por enquanto. Baixada do
// Drive e publicada pelo mesmo workflow automatizado da base de vendas
// (.github/workflows/atualizar-base.yml), com secret próprio
// (GOOGLE_DRIVE_METAS_FILE_ID).
//
// Esse arquivo também é a LISTA OFICIAL de cidades do FTTH (as ~161 que
// a operação realmente vende) — ver `criarServicoCidades('ftth')` em
// cidadeService.js. A base de vendas sozinha traz ~920 cidades porque
// Orçamento/Efetivado têm cobertura muito mais ampla que Instalação
// (funil comercial largo, nem toda oportunidade vira venda de verdade);
// a meta é o filtro certo pra escopo, não um corte arbitrário no código.
const CAMINHO_CSV = `${import.meta.env.BASE_URL}dados/metas-instalacao-ftth.csv`;

/** 'YYYY-MM-DD' -> índice 0-based do mês (jan=0), só quando o ano bate com ANO_PAINEL. Mesmo critério de indicadorRealizadoService.js. */
function indiceDoMesNoAnoDoPainel(mesRefIso) {
  const ano = Number(mesRefIso.slice(0, 4));
  if (ano !== ANO_PAINEL) return null;
  return Number(mesRefIso.slice(5, 7)) - 1;
}

/** cidadeSlug -> { cidadeOrigem, metas: Map(mesIndex -> meta) } */
function indexarMetasPorCidade(linhas) {
  const indice = new Map();
  for (const l of linhas) {
    if (!l.cidade_slug) continue;
    const mesIndex = indiceDoMesNoAnoDoPainel(l.mes_ref);
    if (mesIndex === null) continue;
    if (!indice.has(l.cidade_slug)) indice.set(l.cidade_slug, { cidadeOrigem: l.cidade_origem, metas: new Map() });
    indice.get(l.cidade_slug).metas.set(mesIndex, Number(l.meta));
  }
  return indice;
}

let cache = null; // null = ainda não carregado com sucesso nesta sessão

/** `cache: 'no-store'` — mesmo raciocínio dos outros arquivos publicados: pode ser atualizado a qualquer momento. */
export async function carregarMetasInstalacaoFtth() {
  const resposta = await fetch(CAMINHO_CSV, { cache: 'no-store' });
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar ${CAMINHO_CSV} (HTTP ${resposta.status}).`);
  }
  const texto = await resposta.text();
  const indice = indexarMetasPorCidade(parsearCsv(texto));
  cache = indice;
  return indice;
}

export function metasInstalacaoFtthEmCacheOuNulo() {
  return cache;
}