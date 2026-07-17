/**
 * Consolida a Meta Instalada (FTTH) por canal.
 *
 * Regra de negócio (confirmada com o time):
 *   meta_calculada = meta_base × max(FTTH, 5G, FWA)   [colunas do dicionário]
 *   meta_instalada_consolidada(data, canal) = Σ meta_calculada dos 4 indicadores-alvo
 *
 * Chave de relacionamento: data + indicador (texto exato, incluindo o typo "FTHH").
 *
 * Camadas geradas:
 *   1. Intermediária (auditoria): 1 linha por data+canal+indicador+vendedor/matrícula
 *   2. Final (consumo do painel): 1 linha por data+canal
 *
 * Uso: node scripts/etl/consolidar-meta-instalada.mjs <dicionario.csv> <fato.csv> <pasta-saida>
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const TARGET_INDICATORS = [
  'Vendas instalada Combo - FTTH',
  'Vendas instaladas Combo 1 Chip - FTTH',
  'Vendas instaladas Combo 2+ Chip - FTTH',
  'Vendas instaladas avulso - FTHH', // grafia real da fonte (typo consistente nas duas bases)
];

const CATEGORIA_CONSOLIDADA = 'Vendas Instaladas';

// ---------------------------------------------------------------------------
// Parsing (I/O isolado das regras de negócio)
// ---------------------------------------------------------------------------

function parsearCsv(caminho, delimitador) {
  const texto = readFileSync(caminho, 'utf-8').trim();
  const [linhaCabecalho, ...linhas] = texto.split('\n');
  const cabecalhos = linhaCabecalho.split(delimitador);

  return linhas
    .filter((linha) => linha.trim().length > 0)
    .map((linha) => {
      const colunas = linha.split(delimitador);
      const registro = {};
      cabecalhos.forEach((c, i) => {
        registro[c.trim()] = (colunas[i] ?? '').trim();
      });
      return registro;
    });
}

function paraNumero(valor, { decimalComVirgula = false } = {}) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const normalizado = decimalComVirgula ? valor.replace(',', '.') : valor;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Regras de negócio (funções puras, testáveis sem I/O)
// ---------------------------------------------------------------------------

export function construirIndiceDicionario(linhasDicionario) {
  const indice = new Map();
  const chavesDuplicadas = [];

  for (const linha of linhasDicionario) {
    const chave = `${linha.data}|${linha.indicador}`;
    const ftth = paraNumero(linha.FTTH) ?? 0;
    const fwa = paraNumero(linha.FWA) ?? 0;
    const g5 = paraNumero(linha['5G']) ?? 0;
    const multiplicador = Math.max(ftth, fwa, g5);

    if (indice.has(chave)) {
      chavesDuplicadas.push(chave);
    }
    indice.set(chave, { ftth, fwa, g5, multiplicador });
  }

  return { indice, chavesDuplicadas };
}

/**
 * Aplica a regra do multiplicador em cada linha da fato e retorna a camada
 * intermediária (auditável), junto com as ocorrências de validação.
 */
export function construirCamadaIntermediaria(linhasFato, indiceDicionario) {
  const linhas = [];
  const semCorrespondenciaNoDicionario = [];
  const metaInvalida = [];
  const multiplicadorZero = [];

  for (const linha of linhasFato) {
    if (!TARGET_INDICATORS.includes(linha.indicador)) continue;

    const metaBase = paraNumero(linha.meta, { decimalComVirgula: true });
    if (metaBase === null) {
      metaInvalida.push(linha);
      continue;
    }

    const chave = `${linha.data}|${linha.indicador}`;
    const regra = indiceDicionario.get(chave);
    if (!regra) {
      semCorrespondenciaNoDicionario.push(linha);
      continue;
    }

    if (regra.multiplicador === 0) {
      multiplicadorZero.push(linha);
    }

    const metaCalculada = metaBase * regra.multiplicador;

    linhas.push({
      data: linha.data,
      canal: linha.canal || 'SEM CANAL',
      indicador_original: linha.indicador,
      categoria_consolidada: CATEGORIA_CONSOLIDADA,
      meta_base: metaBase,
      qtd_ftth: regra.ftth,
      qtd_5g: regra.g5,
      qtd_fwa: regra.fwa,
      multiplicador: regra.multiplicador,
      meta_calculada: metaCalculada,
      // auditoria (não vai para a camada final)
      vendedor: linha.vendedor,
      matricula: linha.matricula,
      cluster: linha.cluster,
      cidade: linha.cidade || null,
    });
  }

  return {
    linhas,
    validacoes: { semCorrespondenciaNoDicionario, metaInvalida, multiplicadorZero },
  };
}

/**
 * Agrega a camada intermediária em data+canal (meta instalada consolidada).
 */
export function construirCamadaFinal(linhasIntermediarias) {
  const acumulado = new Map();

  for (const linha of linhasIntermediarias) {
    const chave = `${linha.data}|${linha.canal}`;
    const atual = acumulado.get(chave) ?? {
      data: linha.data,
      canal: linha.canal,
      meta_instalada_consolidada: 0,
    };
    atual.meta_instalada_consolidada += linha.meta_calculada;
    acumulado.set(chave, atual);
  }

  return [...acumulado.values()].sort(
    (a, b) => a.data.localeCompare(b.data) || a.canal.localeCompare(b.canal)
  );
}

// ---------------------------------------------------------------------------
// Serialização
// ---------------------------------------------------------------------------

export function paraCsv(linhas, colunas) {
  const cabecalho = colunas.join(';');
  const corpo = linhas
    .map((linha) =>
      colunas
        .map((coluna) => {
          const v = linha[coluna];
          if (v === null || v === undefined) return '';
          return typeof v === 'number' ? String(v).replace('.', ',') : v;
        })
        .join(';')
    )
    .join('\n');
  return `${cabecalho}\n${corpo}\n`;
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

function main() {
  const [caminhoDicionario, caminhoFato, pastaSaida] = process.argv.slice(2);
  if (!caminhoDicionario || !caminhoFato || !pastaSaida) {
    console.error(
      'Uso: node scripts/etl/consolidar-meta-instalada.mjs <dicionario.csv> <fato.csv> <pasta-saida>'
    );
    process.exit(1);
  }

  const linhasDicionario = parsearCsv(caminhoDicionario, ',');
  const linhasFato = parsearCsv(caminhoFato, ';');

  const { indice: indiceDicionario, chavesDuplicadas } = construirIndiceDicionario(linhasDicionario);
  const { linhas: intermediaria, validacoes } = construirCamadaIntermediaria(linhasFato, indiceDicionario);
  const final = construirCamadaFinal(intermediaria);

  // --- Validações obrigatórias ---------------------------------------------
  const somaMetaBase = intermediaria.reduce((acc, l) => acc + l.meta_base, 0);
  const somaMetaCalculada = intermediaria.reduce((acc, l) => acc + l.meta_calculada, 0);
  const somaFinal = final.reduce((acc, l) => acc + l.meta_instalada_consolidada, 0);

  const relatorio = {
    linhasFatoIndicadoresAlvo: linhasFato.filter((r) => TARGET_INDICATORS.includes(r.indicador)).length,
    linhasIntermediariaGeradas: intermediaria.length,
    linhasFinaisDataCanal: final.length,
    chavesDuplicadasNoDicionario: chavesDuplicadas.length,
    linhasSemCorrespondenciaNoDicionario: validacoes.semCorrespondenciaNoDicionario.length,
    linhasComMetaInvalida: validacoes.metaInvalida.length,
    linhasComMultiplicadorZero: validacoes.multiplicadorZero.length,
    somaMetaBase,
    somaMetaCalculadaIntermediaria: somaMetaCalculada,
    somaMetaConsolidadaFinal: somaFinal,
    consistenciaIntermediariaVsFinal: somaMetaCalculada === somaFinal,
  };

  if (chavesDuplicadas.length > 0 || validacoes.metaInvalida.length > 0) {
    console.error('Base reprovada na validação. Arquivos existentes NÃO foram alterados.');
    console.error(JSON.stringify(relatorio, null, 2));
    process.exit(1);
  }

  mkdirSync(pastaSaida, { recursive: true });

  writeFileSync(
    path.join(pastaSaida, 'meta-instalada-intermediaria.csv'),
    paraCsv(intermediaria, [
      'data', 'canal', 'indicador_original', 'categoria_consolidada',
      'meta_base', 'qtd_ftth', 'qtd_5g', 'qtd_fwa', 'multiplicador', 'meta_calculada',
      'vendedor', 'matricula', 'cluster', 'cidade',
    ]),
    'utf-8'
  );

  writeFileSync(
    path.join(pastaSaida, 'meta-instalada-por-canal.csv'),
    paraCsv(final, ['data', 'canal', 'meta_instalada_consolidada']),
    'utf-8'
  );

  writeFileSync(
    path.join(pastaSaida, 'meta-instalada-relatorio-validacao.json'),
    JSON.stringify(relatorio, null, 2) + '\n',
    'utf-8'
  );

  console.log(JSON.stringify(relatorio, null, 2));

  if (validacoes.semCorrespondenciaNoDicionario.length > 0) {
    console.log('\nAmostra sem correspondência no dicionário:');
    console.log(validacoes.semCorrespondenciaNoDicionario.slice(0, 5));
  }
}

main();
