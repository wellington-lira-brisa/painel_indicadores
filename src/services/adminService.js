import { supabase } from './supabaseClient';
import { tratarErro } from './supabaseHelpers';

const COLUNAS_COLABORADOR =
  'id, matricula, nome, email, cargo, regional, papel, nivel, status, permissoes_extras, permissoes_revogadas, perfis_acesso(nome, nivel, permissoes)';

/** Lista todos os colaboradores. Protegido por RLS (exige gerenciar_usuarios). */
export async function listarColaboradores() {
  const { data, error } = await supabase
    .from('colaboradores')
    .select(COLUNAS_COLABORADOR)
    .order('nome', { ascending: true });

  tratarErro(error, 'Não foi possível carregar os colaboradores.');
  return data;
}

/**
 * Atualiza extras/revogadas de um colaborador. RLS reforça no banco:
 * exige gerenciar_usuarios e nível hierárquico maior que o do alvo,
 * antes e depois da mudança — nada disso é confiado só pelo front.
 */
export async function atualizarPermissoes(colaboradorId, { permissoesExtras, permissoesRevogadas }) {
  const { data, error } = await supabase
    .from('colaboradores')
    .update({
      permissoes_extras: permissoesExtras,
      permissoes_revogadas: permissoesRevogadas,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', colaboradorId)
    .select(COLUNAS_COLABORADOR)
    .single();

  tratarErro(error, 'Não foi possível atualizar as permissões deste colaborador.');
  return data;
}

/**
 * Exclusão definitiva — remove a conta do Supabase Auth também, não só a
 * linha em `colaboradores`. Chama a Edge Function porque a Admin API do
 * Auth só é acessível com service_role, nunca do client.
 */
export async function excluirColaborador(colaboradorId) {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao?.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/excluir-colaborador`;
  const resposta = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ colaboradorId }),
  });

  const corpo = await resposta.json();
  if (!resposta.ok) {
    throw new Error(corpo.erro ?? 'Não foi possível excluir este colaborador.');
  }
}