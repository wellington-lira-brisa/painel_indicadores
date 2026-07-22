import test from 'node:test';
import assert from 'node:assert/strict';
import { classificarQuintil, normalizarQuintisPorCidade } from '../csvIndicadores.js';

test('classificarQuintil: fronteiras exatas da regra de negócio', () => {
  assert.equal(classificarQuintil(1.5), 1);
  assert.equal(classificarQuintil(1.0), 1); // ≥100% é 1º
  assert.equal(classificarQuintil(0.99), 2);
  assert.equal(classificarQuintil(0.8), 2); // ≥80% é 2º
  assert.equal(classificarQuintil(0.79), 3);
  assert.equal(classificarQuintil(0.6), 3); // ≥60% é 3º
  assert.equal(classificarQuintil(0.59), 4);
  assert.equal(classificarQuintil(0.3), 4); // ≥30% é 4º
  assert.equal(classificarQuintil(0.29), 5);
  assert.equal(classificarQuintil(0), 5);
  assert.equal(classificarQuintil(null), null);
});

const MULT_1 = new Map([
  ['2026-07-01\u0001Vendas instaladas Combo 1 Chip - FTTH', 1],
  ['2026-07-01\u0001Vendas instalada Combo - FTTH', 1],
  ['2026-07-01\u0001Ativação 5G avulso', 1],
]);

function linha(extra) {
  return {
    data: '2026-07-01',
    canal: 'LOJA',
    indicador: 'Vendas instaladas Combo 1 Chip - FTTH',
    meta: '10',
    realizado: '10',
    servico: 'FTTH',
    vendedor: 'X',
    hash_user: 'h1',
    matricula: '1',
    cidade: 'CRATO / CE',
    ...extra,
  };
}

test('vendedor com Σreal/Σmeta = 100% cai no Q1; agrega múltiplas linhas de venda', () => {
  const linhas = [
    linha({ meta: '10', realizado: '5' }),
    linha({ indicador: 'Vendas instalada Combo - FTTH', meta: '10', realizado: '15' }),
  ];
  const { registros } = normalizarQuintisPorCidade(linhas, MULT_1);
  const ftth = registros.find((r) => r.tecnologia === 'ftth');
  assert.equal(ftth.totalVendedores, 1);
  assert.equal(ftth.q1, 1); // (5+15)/(10+10) = 100%
  assert.equal(ftth.quintilCidade, 1);
});

test('vendedor só com churn (sem linha de venda) entra em sem_meta e soma das faixas bate com o total', () => {
  const linhas = [
    linha({ hash_user: 'h1', meta: '10', realizado: '3' }), // 30% -> Q4
    linha({ hash_user: 'h2', indicador: 'Churn Safra - Banda Larga', meta: '0.07', realizado: '4' }),
  ];
  const { registros } = normalizarQuintisPorCidade(linhas, MULT_1);
  const ftth = registros.find((r) => r.tecnologia === 'ftth');
  assert.equal(ftth.totalVendedores, 2);
  assert.equal(ftth.q4, 1);
  assert.equal(ftth.semMeta, 1);
  assert.equal(ftth.q1 + ftth.q2 + ftth.q3 + ftth.q4 + ftth.q5 + ftth.semMeta, ftth.totalVendedores);
});

test('meta 0 é descartada com aviso (nunca divisão por zero); vendedor sem outra linha vira sem_meta', () => {
  const linhas = [linha({ meta: '0', realizado: '7' })];
  const { registros, avisos } = normalizarQuintisPorCidade(linhas, MULT_1);
  assert.ok(avisos.some((a) => a.includes('meta 0')));
  // único vendedor ficou sem atingimento -> nenhuma linha publicada pra tecnologia
  assert.equal(registros.length, 0);
});

test('indicador sem regra no dicionário: aviso + descarte, mesmo contrato do pipeline de meta', () => {
  const linhas = [linha({ data: '2026-08-01' })]; // MULT_1 não tem agosto
  const { registros, avisos } = normalizarQuintisPorCidade(linhas, MULT_1);
  assert.ok(avisos.some((a) => a.includes('sem regra no dicionário')));
  assert.equal(registros.length, 0);
});

test('multiplicador do dicionário entra na meta (mesma meta do pipeline de vendas)', () => {
  const mult2 = new Map([['2026-07-01\u0001Vendas instaladas Combo 1 Chip - FTTH', 2]]);
  const linhas = [linha({ meta: '10', realizado: '10' })]; // meta efetiva 20 -> 50% -> Q4
  const { registros } = normalizarQuintisPorCidade(linhas, mult2);
  assert.equal(registros[0].q4, 1);
});

test('ativação 5G respeita indicador-por-canal (Ativação avulso sob ONLINE é ignorada)', () => {
  const linhas = [
    linha({ indicador: 'Ativação 5G avulso', canal: 'ONLINE', servico: '5G', meta: '10', realizado: '10' }),
  ];
  const { registros } = normalizarQuintisPorCidade(linhas, MULT_1);
  assert.equal(registros.filter((r) => r.tecnologia === '5g').length, 0); // linha ignorada -> sem atingimento 5G
});

test('cidade não mapeável fica fora (nunca inventada)', () => {
  const { registros } = normalizarQuintisPorCidade([linha({ cidade: 'null' })], MULT_1);
  assert.equal(registros.length, 0);
});

test('tecnologias separadas: venda FTTH não contamina quintil 5G do mesmo vendedor', () => {
  const linhas = [
    linha({ meta: '10', realizado: '10' }), // FTTH 100%
    linha({ indicador: 'Ativação 5G avulso', canal: 'LOJA', meta: '10', realizado: '1' }), // 5G 10%
  ];
  const { registros } = normalizarQuintisPorCidade(linhas, MULT_1);
  assert.equal(registros.find((r) => r.tecnologia === 'ftth').quintilCidade, 1);
  assert.equal(registros.find((r) => r.tecnologia === '5g').quintilCidade, 5);
});

test('vendedor que só vende a OUTRA tecnologia não conta no total nem em sem_meta desta (achado real: Juazeiro do Norte/CE)', () => {
  const linhas = [
    linha({ hash_user: 'so-ftth', meta: '10', realizado: '10' }), // só FTTH, 100%
    linha({ hash_user: 'so-5g', indicador: 'Ativação 5G avulso', canal: 'LOJA', meta: '10', realizado: '10' }), // só 5G, 100%
    linha({ hash_user: 'ambos', meta: '10', realizado: '3' }), // vende as duas — perna FTTH: 30%
    linha({ hash_user: 'ambos', indicador: 'Ativação 5G avulso', canal: 'LOJA', meta: '10', realizado: '3' }), // perna 5G: 30%
  ];
  const { registros } = normalizarQuintisPorCidade(linhas, MULT_1);
  const ftth = registros.find((r) => r.tecnologia === 'ftth');
  const g5 = registros.find((r) => r.tecnologia === '5g');
  // FTTH: só-ftth (100%) + ambos (30%) = 2 vendedores relevantes; so-5g NUNCA entra aqui.
  assert.equal(ftth.totalVendedores, 2);
  assert.equal(ftth.semMeta, 0);
  assert.equal(ftth.q1, 1);
  assert.equal(ftth.q4, 1);
  // 5G: só-5g (100%) + ambos (30%) = 2 vendedores relevantes; so-ftth NUNCA entra aqui.
  assert.equal(g5.totalVendedores, 2);
  assert.equal(g5.semMeta, 0);
  assert.equal(g5.q1, 1);
  assert.equal(g5.q4, 1);
});

test('vendedor sem NENHUMA venda (só churn) conta como sem_meta nas DUAS tecnologias', () => {
  const linhas = [
    linha({ hash_user: 'vendedor-ftth', meta: '10', realizado: '10' }), // garante que a cidade publica linha FTTH
    linha({ hash_user: 'vendedor-5g', indicador: 'Ativação 5G avulso', canal: 'LOJA', meta: '10', realizado: '10' }), // garante linha 5G
    linha({ hash_user: 'so-churn', indicador: 'Churn Safra - Banda Larga', meta: '0.07', realizado: '4' }),
  ];
  const { registros } = normalizarQuintisPorCidade(linhas, MULT_1);
  const ftth = registros.find((r) => r.tecnologia === 'ftth');
  const g5 = registros.find((r) => r.tecnologia === '5g');
  assert.equal(ftth.totalVendedores, 2); // vendedor-ftth + so-churn (ambíguo, conta nos dois)
  assert.equal(ftth.semMeta, 1);
  assert.equal(g5.totalVendedores, 2); // vendedor-5g + so-churn
  assert.equal(g5.semMeta, 1);
});
