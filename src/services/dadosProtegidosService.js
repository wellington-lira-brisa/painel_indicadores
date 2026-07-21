import { supabase } from './supabaseClient';

/**
 * Ponto ÚNICO de carga dos arquivos de dados (CSVs de metas, realizados e
 * metadados). Todos os services de dados devem carregar por aqui — nunca
 * com fetch próprio — para que a política de acesso aos dados seja uma
 * decisão de UM lugar só.
 *
 * Dois modos, decididos por env:
 *
 * 1. `VITE_DADOS_BUCKET` definida → baixa do Supabase Storage PRIVADO
 *    usando a sessão autenticada (o SDK envia o JWT; a policy do bucket
 *    deve permitir SELECT apenas a `authenticated`). É o modo de
 *    produção: os dados comerciais saem do site estático público.
 *
 * 2. `VITE_DADOS_BUCKET` ausente → fetch dos arquivos estáticos em
 *    `public/dados/` (comportamento histórico). Serve para
 *    desenvolvimento local e para a transição — MAS mantém os dados
 *    públicos se o site for público. Não usar em produção após a
 *    migração do bucket.
 *
 * `cache: 'no-store'` no modo estático — os arquivos podem ser
 * republicados pelo ETL a qualquer momento (mesma regra que os services
 * já seguiam individualmente).
 */
const BUCKET_DADOS = import.meta.env.VITE_DADOS_BUCKET || null;

export async function carregarCsvDados(nomeArquivo) {
  if (BUCKET_DADOS) {
    const { data, error } = await supabase.storage.from(BUCKET_DADOS).download(nomeArquivo);
    if (error) {
      throw new Error(`Falha ao baixar ${nomeArquivo} do bucket ${BUCKET_DADOS}: ${error.message}`);
    }
    return data.text();
  }

  const caminho = `${import.meta.env.BASE_URL}dados/${nomeArquivo}`;
  const resposta = await fetch(caminho, { cache: 'no-store' });
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar ${caminho} (HTTP ${resposta.status}).`);
  }
  return resposta.text();
}