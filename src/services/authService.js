import { supabase } from './supabaseClient';
import { buscarPorId, colaboradorExiste } from './usuarioService';

// Supabase Auth só autentica por e-mail. Matrícula é o identificador que o
// colaborador digita; este domínio sintético satisfaz o formato exigido
// pelo provedor — não é lookup, não expõe nada, nunca recebe mensagem real.
const DOMINIO_LOGIN = 'ftth.local';

function emailDaMatricula(matricula) {
  return `${matricula}@${DOMINIO_LOGIN}`;
}

/** true = matrícula ainda não tem conta (primeiro acesso, precisa de convite + nome). */
async function verificarPrimeiroAcesso(matricula) {
  return !(await colaboradorExiste(matricula));
}

/**
 * Única chamada que cria conta. Roda inteiramente na Edge Function
 * (service_role) — o client nunca tem permissão de criar colaborador
 * ou consumir convite diretamente; só a function tem.
 */
async function criarConta({ matricula, senha, codigoConvite, nome }) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/criar-conta`;
  const resposta = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ matricula, senha, codigoConvite, nome }),
  });

  const corpo = await resposta.json();
  if (!resposta.ok) {
    throw new Error(corpo.erro ?? 'Não foi possível criar a conta.');
  }
}

/**
 * @param {{ matricula: string, senha: string, codigoConvite?: string, nome?: string }} dados
 * codigoConvite e nome só são exigidos no primeiro acesso — decidido aqui,
 * não pelo componente de UI, para não duplicar essa regra em dois lugares.
 */
export async function login({ matricula, senha, codigoConvite, nome }) {
  const primeiroAcesso = await verificarPrimeiroAcesso(matricula);

  if (primeiroAcesso) {
    if (!codigoConvite || !nome) {
      throw new Error('Nome completo e código de convite são obrigatórios no primeiro acesso.');
    }
    await criarConta({ matricula, senha, codigoConvite, nome });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: emailDaMatricula(matricula),
    password: senha,
  });

  if (error) {
    throw new Error('Matrícula ou senha inválidas.');
  }

  const colaborador = await buscarPorId(data.user.id);
  if (!colaborador || colaborador.status !== 'ativo') {
    await supabase.auth.signOut();
    throw new Error('Esta conta está inativa. Contate o administrador.');
  }

  return colaborador;
}

export async function logout() {
  await supabase.auth.signOut();
}

/** Restaura o colaborador da sessão ativa, ou null se não houver sessão válida. */
export async function sessaoAtual() {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return null;

  const colaborador = await buscarPorId(uid);
  if (!colaborador || colaborador.status !== 'ativo') {
    await supabase.auth.signOut();
    return null;
  }
  return colaborador;
}

/**
 * Notifica sobre logout disparado em outra aba/janela (mesmo navegador).
 * Não reage a TOKEN_REFRESHED/SIGNED_IN aqui para não refazer a consulta
 * ao colaborador em todo refresh de token — login() e sessaoAtual() já
 * cobrem esses casos explicitamente.
 */
export function ouvirLogoutExterno(callback) {
  const { data } = supabase.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') callback();
  });
  return () => data.subscription.unsubscribe();
}