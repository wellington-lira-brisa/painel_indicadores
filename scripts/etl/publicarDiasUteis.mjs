// Gera public/dados/dias-uteis.csv a partir da base baixada do Drive
// (dias_acum_uteis.csv — fonte de verdade do calendário comercial pro
// rateio semanal de Meta do Indicador, ver utils/diasUteis.js).
//
// A base é um ledger de dias JÁ OCORRIDOS (nunca cobre o futuro) — isso
// é esperado, não um erro de validação; dias sem registro ainda são
// projetados por calendário em tempo de execução (ver
// construirEstimadorPorCalendario em utils/diasUteis.js), não aqui.
//
// Uso: node scripts/etl/publicarDiasUteis.mjs <dias-uteis-bruto.csv>
//
// Se a validação falhar, sai com código != 0 SEM escrever nada — mesmo
// contrato de gerarBase.mjs/consolidarMetaPorCanal.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parsearCsv, validarDiasUteis, paraCsvDiasUteis } from '../../src/shared/csvIndicadores.js';

const SAIDA_CSV = 'public/dados/dias-uteis.csv';

function main() {
  const caminhoArquivo = process.argv[2];
  if (!caminhoArquivo) {
    console.error('Uso: node scripts/etl/publicarDiasUteis.mjs <dias-uteis-bruto.csv>');
    process.exit(1);
  }

  const linhas = parsearCsv(readFileSync(caminhoArquivo, 'utf-8'));
  const { erros, avisos } = validarDiasUteis(linhas);

  if (avisos.length > 0) {
    console.warn(`${avisos.length} aviso(s) na base de dias úteis (não bloqueiam a publicação):`);
    avisos.forEach((a) => console.warn(`  - ${a}`));
  }

  if (erros.length > 0) {
    console.error(`Base de dias úteis reprovada na validação: ${erros.length} erro(s). Arquivo existente NÃO foi alterado.`);
    erros.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  mkdirSync('public/dados', { recursive: true });
  writeFileSync(SAIDA_CSV, paraCsvDiasUteis(linhas), 'utf-8');

  const datas = linhas.map((l) => l.data).sort();
  console.log(`Gerado com sucesso: ${linhas.length} linha(s) em ${SAIDA_CSV}. Intervalo: ${datas[0]} a ${datas[datas.length - 1]}.`);
}

main();
