import { supabase } from './supabaseClient';
import { tratarErro } from './supabaseHelpers';

/**
 * Camada de acesso a dados de colaboradores.
 * Toda leitura já vem com o join de `perfis_acesso` — permissão efetiva
 * (services/permissaoService.js) depende desses dados, e assim evitamos
 * uma segunda consulta só para buscar o perfil.
 */
const COLUNAS_COLABORADOR =
  'id, matricula, nome, email, cargo, regional, papel, nivel, permissoes_extras, permissoes_revogadas, status, perfis_acesso(nome, nivel, permissoes)';

/**
 * Busca o colaborador pelo id (uid do Supabase Auth).
 * Retorna null se não houver colaborador cadastrado para esse uid —
 * usar `.maybeSingle()` em vez de `.single()` é o que garante isso sem
 * precisar tratar erro de "0 linhas" como excepcional.
 */
export async function buscarPorId(uid) {
  const { data, error } = await supabase
    .from('colaboradores')
    .select(COLUNAS_COLABORADOR)
    .eq('id', uid)
    .maybeSingle();

  if (error) {
    throw new Error('Não foi possível carregar os dados do colaborador.');
  }
  return data;
}

/** Usado no login para decidir entre autenticar (conta existe) ou criar (primeiro acesso). */
export async function colaboradorExiste(matricula) {
  const { data, error } = await supabase.rpc('colaborador_existe', { p_matricula: matricula });
  tratarErro(error, 'Não foi possível verificar a matrícula.');
  return data === true;
}