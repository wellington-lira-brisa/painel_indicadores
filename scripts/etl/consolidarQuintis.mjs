// Gera public/dados/quintis-por-cidade.csv a partir do Dicionário de
// Metas e da Fato de Metas por vendedor (que agora traz também a coluna
// `realizado`) — mesmos dois arquivos já baixados do Drive pro pipeline
// de Meta por Canal; nenhum download novo.
//
// PRIVACIDADE: a fato tem nome, matrícula e hash de cada vendedor. NADA
// disso é publicado — só a distribuição agregada por cidade (ver
// normalizarQuintisPorCidade em src/shared/csvIndicadores.js). A base
// crua nunca vai pro repositório, mesma regra dos demais.
//
// Uso: node scripts/etl/consolidarQuintis.mjs <dicionario.csv> <fato-vendedores.csv>
//
// Se a validação/reconciliação falhar, sai com código != 0 SEM escrever
// nada — mesmo contrato de gerarBase.mjs/consolidarMetaPorCanal.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  parsearCsv,
  indexarMultiplicadoresDicionarioMetas,
  normalizarQuintisPorCidade,
  paraCsvQuintis,
} from '../../src/shared/csvIndicadores.js';

const SAIDA_CSV = 'public/dados/quintis-por-cidade.csv';

function main() {
  const [caminhoDicionario, caminhoFato] = process.argv.slice(2);
  if (!caminhoDicionario || !caminhoFato) {
    console.error('Uso: node scripts/etl/consolidarQuintis.mjs <dicionario.csv> <fato-vendedores.csv>');
    process.exit(1);
  }

  const linhasDicionario = parsearCsv(readFileSync(caminhoDicionario, 'utf-8'));
  const linhasFato = parsearCsv(readFileSync(caminhoFato, 'utf-8'));

  const { indice: indiceMultiplicadores, avisos: avisosDicionario } = indexarMultiplicadoresDicionarioMetas(linhasDicionario);
  if (avisosDicionario.length > 0) {
    console.warn(`${avisosDicionario.length} aviso(s) no dicionário de metas:`);
    avisosDicionario.slice(0, 20).forEach((a) => console.warn(`  - ${a}`));
  }

  // normalizarQuintisPorCidade LANÇA se a reconciliação interna
  // (q1..q5 + sem_meta === total de vendedores) falhar — nada é escrito.
  const { registros, avisos } = normalizarQuintisPorCidade(linhasFato, indiceMultiplicadores);
  if (avisos.length > 0) {
    console.warn(`${avisos.length} aviso(s) na consolidação de quintis (não bloqueiam a publicação):`);
    avisos.slice(0, 20).forEach((a) => console.warn(`  - ${a}`));
  }

  if (registros.length === 0) {
    console.error('Consolidação de quintis resultou em 0 registros. Arquivo existente NÃO foi alterado.');
    process.exit(1);
  }

  mkdirSync('public/dados', { recursive: true });
  writeFileSync(SAIDA_CSV, paraCsvQuintis(registros), 'utf-8');

  const meses = [...new Set(registros.map((r) => r.mesRef))].sort();
  const cidades = new Set(registros.map((r) => r.cidadeSlug)).size;
  console.log(
    `Gerado com sucesso: ${registros.length} registro(s) (cidade×tecnologia×mês) em ${SAIDA_CSV}. ` +
      `${cidades} cidade(s), meses ${meses[0]} a ${meses[meses.length - 1]}.`,
  );
}

main();
