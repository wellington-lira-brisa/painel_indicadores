// Baixa o CSV da base oficial de um Google Drive corporativo, autenticando
// como Service Account (OAuth2 JWT Bearer flow — RFC 7523). Sem
// googleapis/google-auth-library: só `fetch` e `crypto`, que já estão
// disponíveis no runner do GitHub Actions (Node 20+), pra não adicionar
// dependência só por causa de um download.
//
// DOIS MODOS de apontar pro arquivo:
//   1. Por ID direto (`arquivoId`) — só funciona enquanto o ID não muda.
//      Se o processo que gera o arquivo no Drive DELETA e RECRIA (em vez
//      de sobrescrever o conteúdo do mesmo arquivo) a cada exportação —
//      é o caso do export do Databricks aqui —, o ID muda toda vez e
//      alguém precisa atualizar o secret manualmente. Existe só por
//      compatibilidade com quem ainda aponta assim.
//   2. Por PASTA + NOME (`pastaId` + `nomeArquivo`, RECOMENDADO) — a
//      pasta no Drive não muda nunca (é criada uma vez, manualmente); o
//      arquivo dentro dela é procurado pelo nome toda vez que o workflow
//      roda, então o ID novo de cada exportação nunca precisa ser
//      copiado pra lugar nenhum. Se dois arquivos tiverem o mesmo nome
//      na pasta (não deveria acontecer, mas pastas compartilhadas às
//      vezes duplicam), pega o mais recente (`modifiedTime desc`) e avisa.
//
// Segredos esperados (GitHub Secrets, nunca commitados):
//   GOOGLE_SERVICE_ACCOUNT_JSON  -- conteúdo integral do JSON da service account
//   GOOGLE_DRIVE_FOLDER_ID       -- id da pasta (modo recomendado, não muda)
//   GOOGLE_DRIVE_FILE_ID         -- id do arquivo (modo antigo, muda a cada export)
//
// A service account só precisa do escopo readonly e só precisa ter sido
// dada permissão de "Leitor" na pasta (modo recomendado) ou no arquivo
// específico (modo antigo) — nunca na unidade inteira do Drive.

import { createSign } from 'node:crypto';

function base64Url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function obterAccessToken(credenciais) {
  const agoraEmSegundos = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: credenciais.client_email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: agoraEmSegundos,
      exp: agoraEmSegundos + 3600,
    }),
  );
  const assinatura = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(credenciais.private_key);
  const jwt = `${header}.${claims}.${base64Url(assinatura).replace(/\+/g, '-').replace(/\//g, '_')}`;

  const resposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao autenticar na Service Account do Google (HTTP ${resposta.status}): ${await resposta.text()}`);
  }
  const dados = await resposta.json();
  return dados.access_token;
}

/**
 * Procura, dentro de `pastaId`, o arquivo chamado `nomeArquivo` e devolve
 * o ID dele — é essa busca que substitui precisar saber o ID de antemão.
 * `trashed = false` ignora arquivo apagado (Drive mantém na lixeira por
 * um tempo, `files.list` sem esse filtro o devolveria mesmo apagado).
 */
async function resolverArquivoIdPorNome({ accessToken, pastaId, nomeArquivo }) {
  const consulta = `'${pastaId}' in parents and name = '${nomeArquivo}' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(consulta)}&fields=${encodeURIComponent('files(id,name,modifiedTime)')}&orderBy=modifiedTime desc&pageSize=5`;

  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resposta.ok) {
    throw new Error(`Falha ao procurar "${nomeArquivo}" na pasta ${pastaId} do Drive (HTTP ${resposta.status}): ${await resposta.text()}`);
  }
  const { files } = await resposta.json();
  if (files.length === 0) {
    // Não achou pelo nome — antes de falhar, lista o que a Service Account
    // CONSEGUE ver na pasta (sem filtro de nome). Isso diferencia na hora
    // "não tenho permissão nessa pasta" (lista vazia) de "o nome no
    // workflow está errado" (lista vem com outros nomes) — sem precisar
    // de mais uma rodada de tentativa e erro.
    const diagnostico = await listarNomesDaPasta({ accessToken, pastaId });
    const detalhe =
      diagnostico.length === 0
        ? 'A Service Account não enxerga NENHUM arquivo nessa pasta — é permissão, não nome (confirme que a pasta foi compartilhada com o e-mail certo da Service Account, com acesso de Leitor, e que não é uma subpasta diferente).'
        : `A Service Account enxerga ${diagnostico.length} arquivo(s) nessa pasta, mas nenhum com esse nome exato. Nomes vistos: ${diagnostico.join(', ')}`;
    throw new Error(`Nenhum arquivo chamado "${nomeArquivo}" encontrado na pasta ${pastaId} do Drive. ${detalhe}`);
  }
  if (files.length > 1) {
    console.warn(`Aviso: ${files.length} arquivos chamados "${nomeArquivo}" na pasta — usando o mais recente (${files[0].modifiedTime}).`);
  }
  return files[0].id;
}

/** Só pra diagnóstico de erro (ver acima) — lista até 20 nomes visíveis na pasta, sem filtrar por nome. */
async function listarNomesDaPasta({ accessToken, pastaId }) {
  const consulta = `'${pastaId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(consulta)}&fields=${encodeURIComponent('files(name)')}&pageSize=20`;
  const resposta = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resposta.ok) return []; // diagnóstico é best-effort — se falhar aqui também, o erro original já basta
  const { files } = await resposta.json();
  return files.map((f) => f.name);
}

export async function baixarBaseGoogleDrive({ credenciaisJson, arquivoId, pastaId, nomeArquivo }) {
  if (!arquivoId && !(pastaId && nomeArquivo)) {
    throw new Error('Informe `arquivoId`, ou `pastaId` + `nomeArquivo`.');
  }

  const credenciais = JSON.parse(credenciaisJson);
  const accessToken = await obterAccessToken(credenciais);

  const idResolvido = arquivoId ?? (await resolverArquivoIdPorNome({ accessToken, pastaId, nomeArquivo }));

  const resposta = await fetch(`https://www.googleapis.com/drive/v3/files/${idResolvido}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao baixar arquivo do Drive (HTTP ${resposta.status}): ${await resposta.text()}`);
  }
  return resposta.text();
}

// Execução direta (uso no workflow):
//   node baixarBaseGoogleDrive.mjs                                  -> GOOGLE_DRIVE_FILE_ID (modo antigo, por ID)
//   node baixarBaseGoogleDrive.mjs <arquivoId>                      -> ID explícito por argumento (modo antigo)
//   node baixarBaseGoogleDrive.mjs --pasta <nomeArquivo>            -> GOOGLE_DRIVE_FOLDER_ID + nome (modo recomendado)
//
// O terceiro formato existe pra reusar este mesmo script pros 3 arquivos
// que hoje vêm da mesma pasta no Drive (base de vendas, metas, cidades
// oficiais) sem duplicar a lógica de autenticação nem precisar de um
// secret de ID por arquivo.
if (import.meta.url === `file://${process.argv[1]}`) {
  const credenciaisJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credenciaisJson) {
    console.error('GOOGLE_SERVICE_ACCOUNT_JSON é obrigatório.');
    process.exit(1);
  }

  const argumentos = process.argv.slice(2);
  const indicePasta = argumentos.indexOf('--pasta');

  let promessa;
  if (indicePasta !== -1) {
    const nomeArquivo = argumentos[indicePasta + 1];
    const pastaId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!nomeArquivo || !pastaId) {
      console.error('Uso: --pasta <nomeArquivo>, com GOOGLE_DRIVE_FOLDER_ID definido no ambiente.');
      process.exit(1);
    }
    promessa = baixarBaseGoogleDrive({ credenciaisJson, pastaId, nomeArquivo });
  } else {
    const arquivoId = argumentos[0] || process.env.GOOGLE_DRIVE_FILE_ID;
    if (!arquivoId) {
      console.error('Informe o ID do arquivo por argumento, defina GOOGLE_DRIVE_FILE_ID, ou use --pasta <nomeArquivo>.');
      process.exit(1);
    }
    promessa = baixarBaseGoogleDrive({ credenciaisJson, arquivoId });
  }

  promessa
    .then((csv) => process.stdout.write(csv))
    .catch((erro) => {
      console.error(erro.message);
      process.exit(1);
    });
}
