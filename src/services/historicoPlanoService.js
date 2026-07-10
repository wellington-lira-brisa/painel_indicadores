import { supabase } from './supabaseClient';
import { tratarErro } from './supabaseHelpers';

// Sem path/metadados de imagem aqui — histórico não trata evidência,
// só os campos textuais/estruturados do plano (ver trigger da migration
// 20260708140000).
const COLUNAS_HISTORICO = 'id, plano_id, alterado_em, motivo, alteracoes, colaboradores!alterado_por(nome, matricula)';

function mapearEvento(linha) {
  return {
    id: linha.id,
    planoId: linha.plano_id,
    alteradoEm: linha.alterado_em,
    motivo: linha.motivo,
    // jsonb { campo: { de, para } } — já vem pronto pra diff, sem
    // transformação adicional no client.
    alteracoes: linha.alteracoes ?? {},
    alteradoPor: linha.colaboradores,
  };
}

/**
 * Timeline de alterações de um plano, mais recente primeiro. RLS de
 * `planos_acao_historico` já restringe a quem também pode ver o plano —
 * nenhuma checagem extra de permissão é necessária aqui.
 */
export async function listarHistoricoPlano(planoId) {
  const { data, error } = await supabase
    .from('planos_acao_historico')
    .select(COLUNAS_HISTORICO)
    .eq('plano_id', planoId)
    .order('alterado_em', { ascending: false });

  tratarErro(error, 'Não foi possível carregar o histórico deste plano.');
  return data.map(mapearEvento);
}