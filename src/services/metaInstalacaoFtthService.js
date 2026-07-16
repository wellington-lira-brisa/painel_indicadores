import { parsearCsv } from '../shared/csvIndicadores';
import { ANO_PAINEL } from '../data/mockHelpers';

// Primeira meta real do painel (ver normalizarMetasInstalacaoFtth em
// csvIndicadores.js) — cobre FTTH/Instalação. Baixada do Drive e
// publicada pelo mesmo workflow automatizado da base de vendas
// (.github/workflows/atualizar-base.yml), com secret próprio
// (GOOGLE_DRIVE_FOLDER_ID + nome do arquivo, metas_cidades_vendas_instaladas.csv
// — ver baixarBaseGoogleDrive.mjs). Mesmo arquivo baixado também
// alimenta a meta do 5G — ver metaAtivacao5gService.js e
// normalizarMetasAtivacao5g() em csvIndicadores.js.
//
// NÃO decide escopo de cidades (isso é cidades-oficiais.csv — ver
// criarServicoCidades() em cidadeService.js); esse arquivo só dá o
// VALOR da meta pra quem já está no escopo.
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