// Transição única: particiona o indicadores-realizados-por-canal.csv já
// publicado em arquivos por (tecnologia, ano), sem rodar o ETL completo.
// A partir da próxima execução do ETL (gerarBase.mjs), as partições são
// geradas direto e este script deixa de ser necessário.
//
// Uso: node scripts/etl/particionarPorCanalExistente.mjs
//
// Os campos de particionamento são extraídos com o MESMO parser usado
// pelo front (parsearCsv — células quotadas com vírgula existem em
// cidade_origem, split ingênuo corrompe). As linhas cruas são escritas
// intactas, preservando o formato byte a byte.
//
// Valida reconciliação (nº de linhas e soma de `valor` origem === soma
// das partições) e só então remove o agregado. Falhou a reconciliação →
// nada é removido e o processo sai com erro.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { parsearCsv } from '../../src/shared/csvIndicadores.js';

const ORIGEM = 'public/dados/indicadores-realizados-por-canal.csv';
const PREFIXO = 'public/dados/indicadores-realizados-por-canal';

const texto = readFileSync(ORIGEM, 'utf-8');
const registros = parsearCsv(texto);

const linhas = texto.split('\n').filter((l) => l.replace(/\r$/, '').length > 0);
const cabecalho = linhas[0];
const linhasDados = linhas.slice(1);
if (registros.length !== linhasDados.length) {
  throw new Error(
    `Parse (${registros.length}) e linhas cruas (${linhasDados.length}) divergem — não dá pra parear com segurança.`,
  );
}

const porParticao = new Map();
let somaValorOrigem = 0;

for (let i = 0; i < registros.length; i += 1) {
  const registro = registros[i];
  const chave = `${registro.tecnologia}-${String(registro.mes_ref).slice(0, 4)}`;
  if (!porParticao.has(chave)) porParticao.set(chave, { linhas: [], somaValor: 0 });
  const particao = porParticao.get(chave);
  particao.linhas.push(linhasDados[i]);
  particao.somaValor += Number(registro.valor) || 0;
  somaValorOrigem += Number(registro.valor) || 0;
}

let totalLinhasParticoes = 0;
let somaValorParticoes = 0;
for (const [chave, particao] of porParticao) {
  totalLinhasParticoes += particao.linhas.length;
  somaValorParticoes += particao.somaValor;
  writeFileSync(`${PREFIXO}-${chave}.csv`, [cabecalho, ...particao.linhas].join('\n') + '\n', 'utf-8');
}

if (totalLinhasParticoes !== registros.length || somaValorParticoes !== somaValorOrigem) {
  throw new Error(
    `Reconciliação FALHOU: origem ${registros.length} linhas / soma ${somaValorOrigem}; ` +
      `partições ${totalLinhasParticoes} linhas / soma ${somaValorParticoes}. Agregado NÃO removido.`,
  );
}

rmSync(ORIGEM);
console.log(
  `OK: ${porParticao.size} partições (${[...porParticao.keys()].sort().join(', ')}), ` +
    `${totalLinhasParticoes} linhas reconciliadas, agregado removido.`,
);
