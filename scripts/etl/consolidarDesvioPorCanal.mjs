// Gera public/dados/desvio-por-canal.csv a partir da Fato de Metas por
// vendedor (metas_vendedores_por_cidade.csv, com coluna `realizado`).
// Calcula desvio = realizado − meta agregado por cidade × canal × tecnologia × mês,
// usando apenas os indicadores principais de venda (Instalação no FTTH,
// Ativação no 5G).
//
// Uso: node scripts/etl/consolidarDesvioPorCanal.mjs <fato-vendedores.csv>
//
// Sai com código != 0 SEM escrever nada se não houver registros válidos.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parsearCsv, normalizarDesvioPorCanal, paraCsvDesvioPorCanal } from '../../src/shared/csvIndicadores.js';

const SAIDA_CSV = 'public/dados/desvio-por-canal.csv';

function main() {
  const caminhoFato = process.argv[2];
  if (!caminhoFato) {
    console.error('Uso: node scripts/etl/consolidarDesvioPorCanal.mjs <fato-vendedores.csv>');
    process.exit(1);
  }

  const linhasFato = parsearCsv(readFileSync(caminhoFato, 'utf-8'));
  const { registros, avisos } = normalizarDesvioPorCanal(linhasFato);

  if (avisos.length > 0) {
    console.warn(`${avisos.length} aviso(s) (não bloqueiam a publicação):`);
    avisos.slice(0, 20).forEach((a) => console.warn(`  - ${a}`));
  }

  if (registros.length === 0) {
    console.error('Desvio por canal: 0 registros gerados. Arquivo existente NÃO foi alterado.');
    process.exit(1);
  }

  mkdirSync('public/dados', { recursive: true });
  writeFileSync(SAIDA_CSV, paraCsvDesvioPorCanal(registros), 'utf-8');

  const meses = [...new Set(registros.map((r) => r.mesRef))].sort();
  const cidades = new Set(registros.map((r) => r.cidadeSlug)).size;
  console.log(
    `Gerado: ${registros.length} registro(s) (cidade×canal×tecnologia×mês) em ${SAIDA_CSV}. ` +
      `${cidades} cidade(s), ${meses[0]} a ${meses[meses.length - 1]}.`,
  );
}

main();
