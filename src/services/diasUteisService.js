import { parsearCsv } from '../shared/csvIndicadores';
import { carregarCsvDados } from './dadosProtegidosService';
import { indexarDiasUteis } from '../utils/diasUteis';

const NOME_ARQUIVO = 'dias-uteis.csv';

let cache = null; // null = ainda não carregado com sucesso nesta sessão

/** `cache: 'no-store'` (via carregarCsvDados) — mesmo raciocínio dos outros arquivos publicados: pode ser atualizado a qualquer momento. */
export async function carregarDiasUteis() {
  const texto = await carregarCsvDados(NOME_ARQUIVO);
  const indice = indexarDiasUteis(parsearCsv(texto));
  cache = indice;
  return indice;
}

export function diasUteisEmCacheOuNulo() {
  return cache;
}