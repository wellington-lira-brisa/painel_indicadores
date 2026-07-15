// Baixa o CSV da base oficial de um Google Drive corporativo, autenticando
// como Service Account (OAuth2 JWT Bearer flow — RFC 7523). Sem
// googleapis/google-auth-library: só `fetch` e `crypto`, que já estão
// disponíveis no runner do GitHub Actions (Node 20+), pra não adicionar
// dependência só por causa de um download.
//
// Segredos esperados (GitHub Secrets, nunca commitados):
//   GOOGLE_SERVICE_ACCOUNT_JSON  -- conteúdo integral do JSON da service account
//   GOOGLE_DRIVE_FILE_ID         -- id do arquivo (planilha/CSV) no Drive
//
// A service account só precisa do escopo readonly e só precisa ter sido
// dada permissão de "Leitor" no arquivo específico no Drive (nunca na
// unidade inteira) — permissão mínima, auditável pelo próprio Drive.

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

export async function baixarBaseGoogleDrive({ credenciaisJson, arquivoId }) {
  const credenciais = JSON.parse(credenciaisJson);
  const accessToken = await obterAccessToken(credenciais);

  const resposta = await fetch(`https://www.googleapis.com/drive/v3/files/${arquivoId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resposta.ok) {
    throw new Error(`Falha ao baixar arquivo do Drive (HTTP ${resposta.status}): ${await resposta.text()}`);
  }
  return resposta.text();
}

// Execução direta (uso no workflow): node baixarBaseGoogleDrive.mjs > base.csv
// Aceita opcionalmente o ID do arquivo por argumento — é o que permite
// baixar mais de um arquivo do Drive reusando este mesmo script (ex.: a
// base de vendas e a de metas, com IDs diferentes), sem duplicar a lógica
// de autenticação. Sem argumento, cai no comportamento de sempre
// (GOOGLE_DRIVE_FILE_ID).
if (import.meta.url === `file://${process.argv[1]}`) {
  const credenciaisJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const arquivoId = process.argv[2] || process.env.GOOGLE_DRIVE_FILE_ID;
  if (!credenciaisJson || !arquivoId) {
    console.error('GOOGLE_SERVICE_ACCOUNT_JSON e GOOGLE_DRIVE_FILE_ID (ou um ID por argumento) são obrigatórios.');
    process.exit(1);
  }
  baixarBaseGoogleDrive({ credenciaisJson, arquivoId })
    .then((csv) => process.stdout.write(csv))
    .catch((erro) => {
      console.error(erro.message);
      process.exit(1);
    });
}
