import { supabase } from './supabaseClient';

/** Chama a function security definer que valida o convite sem expor a tabela. */
export async function conviteValido(codigo, matricula) {
  const { data, error } = await supabase.rpc('convite_valido', {
    p_codigo: codigo,
    p_matricula: matricula,
  });

  if (error) throw new Error('Não foi possível validar o código de convite.');
  return data === true;
}

/** Marca o convite como usado. Só deve ser chamado após autenticação bem-sucedida. */
export async function consumirConvite(codigo, matricula) {
  const { data, error } = await supabase.rpc('consumir_convite', {
    p_codigo: codigo,
    p_matricula: matricula,
  });

  if (error) throw new Error('Não foi possível registrar o uso do código de convite.');
  return data === true;
}