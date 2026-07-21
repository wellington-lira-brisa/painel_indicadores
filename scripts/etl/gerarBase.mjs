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
// Uso: node scripts/etl/gerarBase.mjs <csv-vendas> [csv-metas] [csv-cidades-atuais-5g] [csv-cidades-ftth]
//
// 2º-4º argumentos são opcionais (mantém compatibilidade com quem chamar
// só com a base de vendas) — quando informados, geram também
// `public/dados/metas-instalacao-ftth.csv` + `public/dados/metas-ativacao-5g.csv`
// (mesmo arquivo baixado, um normalizador por tecnologia) e
// `public/dados/cidades-oficiais.csv` (funde as duas fontes de cidade —
// ver normalizarCidadesOficiais em csvIndicadores.js). No workflow
// automatizado (.github/workflows/atualizar-base.yml) os quatro arquivos
// são baixados do Drive e este é sempre chamado com os quatro.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
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
  normalizarMetasAtivacao5g,
  paraCsvMetasAtivacao5g,
  normalizarCidadesOficiais,
  paraCsvCidadesOficiais,
} from '../../src/shared/csvIndicadores.js';

const SAIDA_CSV = 'public/dados/indicadores-realizados.csv';
const SAIDA_METADADOS_CIDADE = 'public/dados/cidades-metadados.csv';
// Por canal é particionado por tecnologia + ano (o front baixa só a
// partição da sessão — ver nomeArquivoPorCanal em
// indicadorRealizadoService.js). O agregado único de ~31MB não é mais
// publicado; escreverPorCanalParticionado remove o legado se existir.
const PREFIXO_SAIDA_POR_CANAL = 'public/dados/indicadores-realizados-por-canal';
const SAIDA_POR_CANAL_LEGADO = `${PREFIXO_SAIDA_POR_CANAL}.csv`;
const SAIDA_METAS_INSTALACAO = 'public/dados/metas-instalacao-ftth.csv';
const SAIDA_METAS_ATIVACAO_5G = 'public/dados/metas-ativacao-5g.csv';
const SAIDA_CIDADES_OFICIAIS = 'public/dados/cidades-oficiais.csv';
const SAIDA_STATUS = 'public/dados/ultima-atualizacao.json';

function escreverStatus(status) {
  mkdirSync(dirname(SAIDA_STATUS), { recursive: true });
  writeFileSync(SAIDA_STATUS, JSON.stringify(status, null, 2) + '\n', 'utf-8');
}

/**
 * Escreve um CSV por (tecnologia, ano) — mesma serialização
 * (`paraCsvPorCanal`) e mesmo parser no front, só o recorte muda.
 * Também remove o agregado legado de ~31MB, se existir, pra não deixar
 * arquivo obsoleto (e pesado) no deploy.
 */
function escreverPorCanalParticionado(registros) {
  const porParticao = new Map();
  for (const registro of registros) {
    const ano = String(registro.mesRef).slice(0, 4);
    const chave = `${registro.tecnologia}-${ano}`;
    if (!porParticao.has(chave)) porParticao.set(chave, []);
    porParticao.get(chave).push(registro);
  }

  for (const [chave, registrosDaParticao] of porParticao) {
    writeFileSync(`${PREFIXO_SAIDA_POR_CANAL}-${chave}.csv`, paraCsvPorCanal(registrosDaParticao), 'utf-8');
  }

  if (existsSync(SAIDA_POR_CANAL_LEGADO)) rmSync(SAIDA_POR_CANAL_LEGADO);

  console.log(
    `Por canal: ${porParticao.size} partição(ões) escrita(s): ${[...porParticao.keys()].sort().join(', ')}`,
  );
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
  escreverPorCanalParticionado(normalizarPorCanal(linhas));

  const caminhoMetas = process.argv[3];
  let metasProcessadas = null;
  let metasAtivacao5gProcessadas = null;
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

    // Mesmo arquivo baixado, filtro próprio (servico='5G' + indicador_geral='Vendas
    // Ativadas') — não é um download separado, ver comentário de uso no topo do arquivo.
    const { registros: metasAtivacao5g, avisos: avisosMetas5g } = normalizarMetasAtivacao5g(linhasMetas);
    if (avisosMetas5g.length > 0) {
      console.warn(`${avisosMetas5g.length} aviso(s) de meta de ativação 5G (não bloqueiam a publicação):`);
      avisosMetas5g.slice(0, 20).forEach((a) => console.warn(`  - ${a}`));
    }
    writeFileSync(SAIDA_METAS_ATIVACAO_5G, paraCsvMetasAtivacao5g(metasAtivacao5g), 'utf-8');
    metasAtivacao5gProcessadas = metasAtivacao5g.length;
    console.log(`Metas de ativação 5G: ${metasAtivacao5g.length} registro(s) em ${SAIDA_METAS_ATIVACAO_5G}.`);
  }

  const caminhoCidadesOficiais = process.argv[4]; // cidades_atuais.csv (5G)
  const caminhoCidadesFtth = process.argv[5]; // cidades_ftth.csv (FTTH)
  let cidadesOficiaisProcessadas = null;
  if (caminhoCidadesOficiais || caminhoCidadesFtth) {
    const linhasCidadesOficiais = caminhoCidadesOficiais
      ? parsearCsv(readFileSync(caminhoCidadesOficiais, 'utf-8'))
      : [];
    const linhasCidadesFtth = caminhoCidadesFtth ? parsearCsv(readFileSync(caminhoCidadesFtth, 'utf-8')) : [];
    if (!caminhoCidadesFtth) {
      console.warn('Sem csv-cidades-ftth: nenhuma cidade será marcada vendeFtth=true.');
    }
    if (!caminhoCidadesOficiais) {
      console.warn('Sem csv-cidades-atuais-5g: nenhuma cidade será marcada vende5g=true (nem FWA/lançamento comercial).');
    }
    const { registros: cidadesOficiais, avisos: avisosCidadesOficiais } = normalizarCidadesOficiais(
      linhasCidadesFtth,
      linhasCidadesOficiais,
    );
    if (avisosCidadesOficiais.length > 0) {
      console.warn(`${avisosCidadesOficiais.length} aviso(s) de cidades oficiais (não bloqueiam a publicação):`);
      avisosCidadesOficiais.slice(0, 20).forEach((a) => console.warn(`  - ${a}`));
    }
    writeFileSync(SAIDA_CIDADES_OFICIAIS, paraCsvCidadesOficiais(cidadesOficiais), 'utf-8');
    cidadesOficiaisProcessadas = cidadesOficiais.length;
    console.log(`Cidades oficiais: ${cidadesOficiais.length} registro(s) em ${SAIDA_CIDADES_OFICIAIS}.`);
  }

  escreverStatus({
    iniciadoEm,
    finalizadoEm: new Date().toISOString(),
    status: 'sucesso',
    linhasLidas: linhas.length,
    linhasPublicadas: registros.length,
    linhasSemCidade: semCidade,
    metasInstalacaoProcessadas: metasProcessadas,
    metasAtivacao5gProcessadas,
    cidadesOficiaisProcessadas,
    commit: process.env.GITHUB_SHA ?? null,
  });

  console.log(`Gerado com sucesso: ${registros.length} registro(s) em ${SAIDA_CSV} (${semCidade} sem cidade mapeada).`);
}

main();
