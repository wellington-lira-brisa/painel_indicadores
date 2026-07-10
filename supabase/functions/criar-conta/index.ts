import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Matrícula não é e-mail. Domínio sintético satisfaz o formato exigido pelo
// Supabase Auth — nunca recebe mensagem real. Duplicado de authService.js
// (runtime Deno separado do bundle Vite); é uma linha, risco de drift baixo.
const DOMINIO_LOGIN = 'ftth.local';

// Restringe CORS à origem real da aplicação. Configurar via
// `supabase secrets set APP_ORIGIN=https://seu-dominio.com`.
// Sem a secret definida, cai em '*' — só aceitável em desenvolvimento.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ erro: 'Método não permitido.' }, 405);
  }

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return jsonResponse({ erro: 'Corpo da requisição inválido.' }, 400);
  }

  // Nunca confiar que o client mandou os campos já normalizados — o
  // client é a fronteira de UX, não a fronteira de segurança/validação.
  const matricula = String(corpo.matricula ?? '').trim();
  const senha = String(corpo.senha ?? '');
  const codigoConvite = String(corpo.codigoConvite ?? '').trim().toUpperCase();
  const nome = String(corpo.nome ?? '').trim();

  if (!matricula || !senha || !codigoConvite || !nome) {
    return jsonResponse({ erro: 'Matrícula, senha, nome e código de convite são obrigatórios.' }, 400);
  }
  if (!/^[A-Za-z0-9]+$/.test(matricula)) {
    return jsonResponse({ erro: 'Matrícula deve conter apenas letras e números.' }, 400);
  }
  if (senha.length < 6) {
    return jsonResponse({ erro: 'Senha precisa ter no mínimo 6 caracteres.' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  );

  const email = `${matricula}@${DOMINIO_LOGIN}`;

  // Pré-checagem: evita criar Auth user se o convite já está obviamente inválido.
  const { data: conviteOk, error: erroConvite } = await admin.rpc('convite_valido', {
    p_codigo: codigoConvite,
    p_matricula: matricula,
  });
  if (erroConvite || !conviteOk) {
    return jsonResponse({ erro: 'Código de convite inválido, expirado ou já utilizado.' }, 400);
  }

  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (erroAuth) {
    return jsonResponse({ erro: 'Não foi possível criar a conta. A matrícula já pode estar cadastrada.' }, 400);
  }

  // Consumo real e criação do colaborador, atômicos dentro da function SQL.
  // Se falhar aqui (ex.: outra requisição consumiu o último uso entre a
  // pré-checagem acima e agora), desfaz o Auth user — nunca deixa conta órfã.
  const { error: erroColaborador } = await admin.rpc('criar_colaborador_via_convite', {
    p_uid: criado.user.id,
    p_matricula: matricula,
    p_nome: nome,
    p_codigo: codigoConvite,
  });

  if (erroColaborador) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return jsonResponse({ erro: 'Não foi possível concluir o cadastro. Verifique o convite e tente novamente.' }, 400);
  }

  return jsonResponse({ ok: true }, 200);
});