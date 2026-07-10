import { supabase } from './supabaseClient';
import { tratarErro } from './supabaseHelpers';

const COLUNAS_CONVITE =
  'codigo, descricao, ativo, limite_usos, usos_atuais, expira_em, matricula_permitida, ' +
  'papel_associado, observacoes, criado_em, atualizado_em, criador:colaboradores!criado_por(nome)';

function mapearConvite(linha) {
  if (!linha) return null;
  return {
    codigo: linha.codigo,
    descricao: linha.descricao,
    ativo: linha.ativo,
    limiteUsos: linha.limite_usos,
    usosAtuais: linha.usos_atuais,
    expiraEm: linha.expira_em,
    matriculaPermitida: linha.matricula_permitida,
    papelAssociado: linha.papel_associado,
    observacoes: linha.observacoes,
    criadoPorNome: linha.criador?.nome ?? null,
    criadoEm: linha.criado_em,
    atualizadoEm: linha.atualizado_em,
  };
}

export async function listarConvites() {
  const { data, error } = await supabase
    .from('convites')
    .select(COLUNAS_CONVITE)
    .order('criado_em', { ascending: false });

  tratarErro(error, 'Não foi possível carregar os códigos de convite.');
  return data.map(mapearConvite);
}

export async function listarPapeis() {
  const { data, error } = await supabase
    .from('perfis_acesso')
    .select('papel, nome')
    .order('nivel', { ascending: true });

  tratarErro(error, 'Não foi possível carregar os perfis de acesso.');
  return data;
}

/**
 * @param {{ codigo: string, descricao: string, ativo: boolean, limiteUsos: number|null,
 *   expiraEm: string|null, matriculaPermitida: string|null, papelAssociado: string|null,
 *   observacoes: string|null, criadoPor: string }} dados
 */
export async function criarConvite(dados) {
  const { data, error } = await supabase
    .from('convites')
    .insert({
      codigo: dados.codigo,
      descricao: dados.descricao || null,
      ativo: dados.ativo,
      limite_usos: dados.limiteUsos,
      expira_em: dados.expiraEm,
      matricula_permitida: dados.matriculaPermitida || null,
      papel_associado: dados.papelAssociado || null,
      observacoes: dados.observacoes || null,
      criado_por: dados.criadoPor,
    })
    .select(COLUNAS_CONVITE)
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Já existe um convite com esse código.');
    throw new Error('Não foi possível criar o código de convite.');
  }
  return mapearConvite(data);
}

/** Não permite alterar `codigo` (é a chave primária) — só campos de conteúdo. */
export async function atualizarConvite(codigo, dados) {
  const { data, error } = await supabase
    .from('convites')
    .update({
      descricao: dados.descricao || null,
      ativo: dados.ativo,
      limite_usos: dados.limiteUsos,
      expira_em: dados.expiraEm,
      matricula_permitida: dados.matriculaPermitida || null,
      papel_associado: dados.papelAssociado || null,
      observacoes: dados.observacoes || null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('codigo', codigo)
    .select(COLUNAS_CONVITE)
    .single();

  tratarErro(error, 'Não foi possível atualizar o código de convite.');
  return mapearConvite(data);
}

export async function alternarAtivoConvite(codigo, ativo) {
  const { error } = await supabase
    .from('convites')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('codigo', codigo);

  tratarErro(error, 'Não foi possível atualizar o status do convite.');
}

export async function excluirConvite(codigo) {
  const { error } = await supabase.from('convites').delete().eq('codigo', codigo);
  tratarErro(error, 'Não foi possível excluir o código de convite.');
}