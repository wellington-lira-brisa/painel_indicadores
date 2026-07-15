// Orquestra o ETL sem nenhum banco externo: lê o arquivo baixado pelo
// passo anterior do workflow, valida, normaliza e escreve o resultado
// como arquivo estático dentro do próprio projeto —
// `public/dados/indicadores-realizados.csv` — pra o front consultar com
// `fetch()` (ver src/services/indicadorRealizadoService.js). Quando
// existir uma API real, só essa troca (fetch do arquivo -> fetch da API)
// precisa mudar; o resto do pipeline continua igual.
//
// Se a validação falhar, o script sai com código != 0 SEM escrever nada:
// os arquivos em public/dados/ continuam sendo os da última publicação
// bem-sucedida, e como estão versionados no git, "a última versão válida"
// é literalmente o commit atual em main — não precisa de lógica extra de
// rollback (ver RELATORIO.md, seção 13).
//
// Uso: node scripts/etl/gerarBase.mjs <caminho-do-csv-baixado> [caminho-do-csv-de-metas]
//
// O 2º argumento é opcional (mantém compatibilidade com quem chamar só
// com a base de vendas) — quando informado, gera também
// `public/dados/metas-instalacao-ftth.csv`. No workflow automatizado
// (.github/workflows/atualizar-base.yml) os dois arquivos são baixados do
// Drive e este é sempre chamado com os dois.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  parsearCsv,
  validar,
  normalizar,
  paraCsv,
  normalizarMetadadosCidade,
  paraCsvMetadados,
  normalizarPorCanal,
  paraCsvPorCanal,
  normalizarMetasInstalacaoFtth,
  paraCsvMetasInstalacaoFtth,
} from '../../src/shared/csvIndicadores.js';

const SAIDA_CSV = 'public/dados/indicadores-realizados.csv';
const SAIDA_METADADOS_CIDADE = 'public/dados/cidades-metadados.csv';
const SAIDA_POR_CANAL = 'public/dados/indicadores-realizados-por-canal.csv';
const SAIDA_METAS_INSTALACAO = 'public/dados/metas-instalacao-ftth.csv';
const SAIDA_STATUS = 'public/dados/ultima-atualizacao.json';

function escreverStatus(status) {
  mkdirSync(dirname(SAIDA_STATUS), { recursive: true });
  writeFileSync(SAIDA_STATUS, JSON.stringify(status, null, 2) + '\n', 'utf-8');
}

function main() {
  const caminhoArquivo = process.argv[2];
  if (!caminhoArquivo) {
    console.error('Uso: node scripts/etl/gerarBase.mjs <caminho-do-csv-baixado>');
    process.exit(1);
  }

  const iniciadoEm = new Date().toISOString();
  const texto = readFileSync(caminhoArquivo, 'utf-8');
  const linhas = parsearCsv(texto);
  const { erros, avisos } = validar(linhas);

  if (avisos.length > 0) {
    console.warn(`${avisos.length} aviso(s) de validação (não bloqueiam a publicação):`);
    avisos.slice(0, 20).forEach((a) => console.warn(`  - ${a}`));
  }

  if (erros.length > 0) {
    console.error(`Base reprovada na validação: ${erros.length} erro(s). Arquivos existentes NÃO foram alterados.`);
    erros.slice(0, 50).forEach((e) => console.error(`  - ${e}`));
    // status de falha é escrito num arquivo separado (não sobrescreve
    // ultima-atualizacao.json de sucesso), pra o workflow poder decidir
    // não commitar nada e, se quiser, publicar esse log como artefato do
    // Action pra quem for investigar.
    writeFileSync('ultima-execucao-falhou.json', JSON.stringify({
      iniciadoEm,
      finalizadoEm: new Date().toISOString(),
      status: 'falha',
      totalErros: erros.length,
      erros: erros.slice(0, 50),
    }, null, 2) + '\n', 'utf-8');
    process.exit(1);
  }

  const registros = normalizar(linhas);
  const semCidade = registros.filter((r) => r.cidadeSlug === null).length;

  const { registros: metadadosCidade, avisos: avisosMetadados } = normalizarMetadadosCidade(linhas);
  if (avisosMetadados.length > 0) {
    console.warn(`${avisosMetadados.length} aviso(s) de metadado de cidade (não bloqueiam a publicação):`);
    avisosMetadados.slice(0, 20).forEach((a) => console.warn(`  - ${a}`));
  }

  mkdirSync('public/dados', { recursive: true });
  writeFileSync(SAIDA_CSV, paraCsv(registros), 'utf-8');
  writeFileSync(SAIDA_METADADOS_CIDADE, paraCsvMetadados(metadadosCidade), 'utf-8');
  writeFileSync(SAIDA_POR_CANAL, paraCsvPorCanal(normalizarPorCanal(linhas)), 'utf-8');

  const caminhoMetas = process.argv[3];
  let metasProcessadas = null;
  if (caminhoMetas) {
    const textoMetas = readFileSync(caminhoMetas, 'utf-8');
    const linhasMetas = parsearCsv(textoMetas);
    const { registros: metasInstalacao, avisos: avisosMetas } = normalizarMetasInstalacaoFtth(linhasMetas);
    if (avisosMetas.length > 0) {
      console.warn(`${avisosMetas.length} aviso(s) de meta de instalação (não bloqueiam a publicação):`);
      avisosMetas.slice(0, 20).forEach((a) => console.warn(`  - ${a}`));
    }
    writeFileSync(SAIDA_METAS_INSTALACAO, paraCsvMetasInstalacaoFtth(metasInstalacao), 'utf-8');
    metasProcessadas = metasInstalacao.length;
    console.log(`Metas de instalação FTTH: ${metasInstalacao.length} registro(s) em ${SAIDA_METAS_INSTALACAO}.`);
  }

  escreverStatus({
    iniciadoEm,
    finalizadoEm: new Date().toISOString(),
    status: 'sucesso',
    linhasLidas: linhas.length,
    linhasPublicadas: registros.length,
    linhasSemCidade: semCidade,
    metasInstalacaoProcessadas: metasProcessadas,
    commit: process.env.GITHUB_SHA ?? null,
  });

  console.log(`Gerado com sucesso: ${registros.length} registro(s) em ${SAIDA_CSV} (${semCidade} sem cidade mapeada).`);
}

main();
