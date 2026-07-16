import { parsearCsv } from '../shared/csvIndicadores';

// Lista oficial de cidades onde a operação vende — fonte de ESCOPO do
// Ranking (ver normalizarCidadesOficiais em csvIndicadores.js e
// cidadeService.js). Atualizada mensalmente pelo negócio, baixada do
// Drive pelo mesmo workflow automatizado (GOOGLE_DRIVE_CIDADES_OFICIAIS_FILE_ID).
const CAMINHO_CSV = `${import.meta.env.BASE_URL}dados/cidades-oficiais.csv`;

/** cidadeSlug -> { cidadeOrigem, vendeFtth, vende5g, vendeFwa, lancamentoComercial } */
function indexarCidadesOficiais(linhas) {
  const indice = new Map();
  for (const l of linhas) {
    if (!l.cidade_slug) continue;
    indice.set(l.cidade_slug, {
      cidadeOrigem: l.cidade_origem,
      vendeFtth: l.vende_ftth === 'true',
      vende5g: l.vende_5g === 'true',
      vendeFwa: l.vende_fwa === 'true',
      lancamentoComercial: l.lancamento_comercial || null,
    });
  }
  return indice;
}

let cache = null; // null = ainda não carregado com sucesso nesta sessão

/** `cache: 'no-store'` — mesmo raciocínio dos outros arquivos publicados: pode ser atualizado a qualquer momento. */
export async function carregarCidadesOficiais() {
  const resposta = await fetch(CAMINHO_CSV, { cache: 'no-store' });
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar ${CAMINHO_CSV} (HTTP ${resposta.status}).`);
  }
  const texto = await resposta.text();
  const indice = indexarCidadesOficiais(parsearCsv(texto));
  cache = indice;
  return indice;
}

export function cidadesOficiaisEmCacheOuNulo() {
  return cache;
}