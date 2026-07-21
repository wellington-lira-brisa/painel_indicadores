import { parsearCsv } from '../shared/csvIndicadores';
import { carregarCsvDados } from './dadosProtegidosService';
import { ANO_PAINEL } from '../data/mockHelpers';

// Meta Geral da Cidade do 5G ("Vendas Ativadas") — mesmo arquivo baixado
// que alimenta o FTTH (ver metaInstalacaoFtthService.js), só publicado
// num CSV próprio (normalizarMetasAtivacao5g() em csvIndicadores.js já
// separa por servico+indicador_geral). NÃO decide escopo de cidades
// (isso é cidades-oficiais.csv); só dá o VALOR da meta pra quem já está
// no escopo do 5G.
const NOME_ARQUIVO = 'metas-ativacao-5g.csv';

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
export async function carregarMetasAtivacao5g() {
  const texto = await carregarCsvDados(NOME_ARQUIVO);
  const indice = indexarMetasPorCidade(parsearCsv(texto));
  cache = indice;
  return indice;
}

export function metasAtivacao5gEmCacheOuNulo() {
  return cache;
}