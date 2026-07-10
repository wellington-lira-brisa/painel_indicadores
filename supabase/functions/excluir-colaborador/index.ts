import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? '*';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(corpo, status) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * Projeto já migrado pro novo sistema de chaves do Supabase (sb_secret_).
 * SUPABASE_SECRET_KEYS chega como JSON { [nome]: chave }; a chave criada
 * na migração default se chama "default". Fallback pra chave legada
 * (SUPABASE_SERVICE_ROLE_KEY) só existe pra projetos que não migraram.
 */
function chaveSecreta() {
  const bruto = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (bruto) {
    try {
      const chaves = JSON.parse(bruto);
      if (chaves.default) return chaves.default;
    } catch {
      // JSON malformado — cai pro fallback abaixo.
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ erro: 'Método não permitido.' }, 405);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ erro: 'Não autenticado.' }, 401);
  }

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return jsonResponse({ erro: 'Corpo da requisição inválido.' }, 400);
  }

  const colaboradorId = String(corpo.colaboradorId ?? '').trim();
  if (!colaboradorId) {
    return jsonResponse({ erro: 'colaboradorId é obrigatório.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  // Age com a identidade de quem chamou — respeita RLS de verdade. Nunca
  // confiar em permissão calculada só no front; aqui é a fronteira real.
  const comoChamador = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: chamador, error: erroChamador } = await comoChamador.rpc('meu_colaborador');
  if (erroChamador || !chamador) {
    return jsonResponse({ erro: 'Não foi possível identificar o usuário autenticado.' }, 401);
  }

  const { data: podeExcluir, error: erroPermissao } = await comoChamador.rpc('tem_permissao', {
    p_permissao: 'excluir_colaborador',
  });
  if (erroPermissao || !podeExcluir) {
    return jsonResponse({ erro: 'Você não tem permissão para excluir colaboradores.' }, 403);
  }

  if (chamador.id === colaboradorId) {
    return jsonResponse({ erro: 'Você não pode excluir sua própria conta.' }, 400);
  }

  const admin = createClient(supabaseUrl, chaveSecreta());

  const { data: alvo, error: erroAlvo } = await admin
    .from('colaboradores')
    .select('id, nivel')
    .eq('id', colaboradorId)
    .maybeSingle();

  if (erroAlvo) {
    console.error('Erro ao buscar colaborador alvo:', erroAlvo);
    return jsonResponse({ erro: `Falha ao verificar colaborador: ${erroAlvo.message}` }, 500);
  }
  if (!alvo) {
    return jsonResponse({ erro: 'Colaborador não encontrado.' }, 404);
  }

  if (chamador.nivel <= alvo.nivel) {
    return jsonResponse({ erro: 'Nível hierárquico insuficiente para excluir este colaborador.' }, 403);
  }

  // Linha do app primeiro: se falhar, a conta de Auth continua intacta —
  // falha segura. Se o Auth falhar depois, sobra um usuário órfão no Auth
  // (inofensivo: sem linha em colaboradores, não consegue logar de verdade).
  const { error: erroDelete } = await admin.from('colaboradores').delete().eq('id', colaboradorId);
  if (erroDelete) {
    console.error('Erro ao excluir colaborador:', erroDelete);
    return jsonResponse({ erro: `Não foi possível excluir o colaborador: ${erroDelete.message}` }, 500);
  }

  const { error: erroAuth } = await admin.auth.admin.deleteUser(colaboradorId);
  if (erroAuth) {
    console.error('Colaborador removido do sistema, mas falha ao excluir do Auth:', erroAuth);
  }

  return jsonResponse({ ok: true }, 200);
});