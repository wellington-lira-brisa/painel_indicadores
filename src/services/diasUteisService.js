import { parsearCsv } from '../shared/csvIndicadores';
import { carregarCsvDados } from './dadosProtegidosService';
import { indexarDiasUteis } from '../utils/diasUteis';

const NOME_ARQUIVO = 'dias-uteis.csv';

let cache = null; // null = ainda não carregado com sucesso nesta sessão

/** `cache: 'no-store'` (via carregarCsvDados) — mesmo raciocínio dos outros arquivos publicados: pode ser atualizado a qualquer momento.
 * Devolve `{ indice, ultimaData }` — ver indexarDiasUteis em utils/diasUteis.js
 * pra por que `ultimaData` importa (distinguir dia futuro de buraco no passado). */
export async function carregarDiasUteis() {
  const texto = await carregarCsvDados(NOME_ARQUIVO);
  const resultado = indexarDiasUteis(parsearCsv(texto));
  cache = resultado;
  return resultado;
}

export function diasUteisEmCacheOuNulo() {
  return cache;
}