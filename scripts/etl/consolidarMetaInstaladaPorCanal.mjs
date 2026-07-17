// Gera public/dados/metas-instalacao-por-canal.csv a partir de duas bases
// baixadas do Drive: o Dicionário de Metas (multiplicador por
// mês×indicador) e a Fato de Metas por vendedor (meta-base por
// vendedor×mês×indicador×canal×cidade). Ver normalizarMetaInstaladaPorCanal
// em src/shared/csvIndicadores.js pra regra de negócio completa.
//
// DIFERENTE de metas-instalacao-ftth.csv (Meta Geral da Cidade, sem
// canal): esse arquivo é uma fonte própria, com canal, que não precisa
// (e não deve) bater com a Meta Geral — são conceitos distintos, ver
// comentário em normalizarMetaInstaladaPorCanal.
//
// Uso: node scripts/etl/consolidarMetaInstaladaPorCanal.mjs <dicionario.csv> <fato-vendedores.csv>
//
// Se a validação falhar, sai com código != 0 SEM escrever nada — mesmo
// contrato de gerarBase.mjs.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  parsearCsv,
  indexarMultiplicadoresDicionarioMetas,
  normalizarMetaInstaladaPorCanal,
  paraCsvMetaInstaladaPorCanal,
} from '../../src/shared/csvIndicadores.js';

const SAIDA_CSV = 'public/dados/metas-instalacao-por-canal.csv';

function main() {
  const [caminhoDicionario, caminhoFato] = process.argv.slice(2);
  if (!caminhoDicionario || !caminhoFato) {
    console.error('Uso: node scripts/etl/consolidarMetaInstaladaPorCanal.mjs <dicionario.csv> <fato-vendedores.csv>');
    process.exit(1);
  }

  const linhasDicionario = parsearCsv(readFileSync(caminhoDicionario, 'utf-8'));
  const linhasFato = parsearCsv(readFileSync(caminhoFato, 'utf-8'));

  const { indice: indiceMultiplicadores, avisos: avisosDicionario } = indexarMultiplicadoresDicionarioMetas(linhasDicionario);
  if (avisosDicionario.length > 0) {
    console.warn(`${avisosDicionario.length} aviso(s) no dicionário de metas:`);
    avisosDicionario.slice(0, 20).forEach((a) => console.warn(`  - ${a}`));
  }

  const { registros, avisos } = normalizarMetaInstaladaPorCanal(linhasFato, indiceMultiplicadores);
  if (avisos.length > 0) {
    console.warn(`${avisos.length} aviso(s) na consolidação de meta por canal (não bloqueiam a publicação):`);
    avisos.slice(0, 20).forEach((a) => console.warn(`  - ${a}`));
  }

  if (registros.length === 0) {
    console.error('Consolidação de meta por canal resultou em 0 registros. Arquivo existente NÃO foi alterado.');
    process.exit(1);
  }

  mkdirSync('public/dados', { recursive: true });
  writeFileSync(SAIDA_CSV, paraCsvMetaInstaladaPorCanal(registros), 'utf-8');

  const somaMeta = registros.reduce((acc, r) => acc + r.meta, 0);
  console.log(
    `Gerado com sucesso: ${registros.length} registro(s) (cidade×canal×mês) em ${SAIDA_CSV}, soma total = ${somaMeta}.`,
  );
}

main();
