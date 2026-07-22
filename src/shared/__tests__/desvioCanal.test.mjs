import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarDesvioPorCanal } from '../csvIndicadores.js';

function linha(extra) {
  return {
    data: '2026-07-01',
    canal: 'LOJA',
    indicador: 'Vendas instaladas Combo 1 Chip - FTTH',
    meta: '10',
    realizado: '7',
    formato_dado: 'Qtd',
    polaridade: 'Maior melhor',
    servico: 'FTTH',
    vendedor: 'X',
    hash_user: 'h1',
    matricula: '1',
    cidade: 'CRATO / CE',
    ...extra,
  };
}

test('desvio negativo quando realizado < meta', () => {
  const { registros } = normalizarDesvioPorCanal([linha({ meta: '10', realizado: '7' })]);
  assert.equal(registros[0].desvio, -3);
});

test('desvio positivo quando realizado > meta (superávit)', () => {
  const { registros } = normalizarDesvioPorCanal([linha({ meta: '10', realizado: '15' })]);
  assert.equal(registros[0].desvio, 5);
});

test('agrega múltiplas linhas do mesmo canal (vendedores diferentes)', () => {
  const linhas = [
    linha({ hash_user: 'h1', meta: '10', realizado: '5' }),
    linha({ hash_user: 'h2', meta: '10', realizado: '8' }),
  ];
  const { registros } = normalizarDesvioPorCanal(linhas);
  assert.equal(registros.length, 1);
  assert.equal(registros[0].meta, 20);
  assert.equal(registros[0].realizado, 13);
  assert.equal(registros[0].desvio, -7);
});

test('canais diferentes geram registros separados', () => {
  const linhas = [
    linha({ canal: 'LOJA', meta: '10', realizado: '8' }),
    linha({ canal: 'ONLINE', meta: '5', realizado: '3' }),
  ];
  const { registros } = normalizarDesvioPorCanal(linhas);
  assert.equal(registros.length, 2);
  const loja = registros.find((r) => r.canal === 'LOJA');
  const online = registros.find((r) => r.canal === 'ONLINE');
  assert.equal(loja.desvio, -2);
  assert.equal(online.desvio, -2);
});

test('canal-lixo (CANAL NAO ENCONTRADO) é descartado', () => {
  const { registros } = normalizarDesvioPorCanal([linha({ canal: 'CANAL NAO ENCONTRADO' })]);
  assert.equal(registros.length, 0);
});

test('indicador de churn/ticket é excluído (só indicadores de venda entram)', () => {
  const { registros } = normalizarDesvioPorCanal([linha({ indicador: 'Churn Safra - Banda Larga', meta: '0.07', realizado: '4' })]);
  assert.equal(registros.length, 0);
});

test('meta 0 é descartada sem aviso (ruído esperado)', () => {
  const { registros, avisos } = normalizarDesvioPorCanal([linha({ meta: '0', realizado: '5' })]);
  assert.equal(registros.length, 0);
  assert.equal(avisos.length, 0);
});

test('cidade não mapeável fica fora', () => {
  const { registros } = normalizarDesvioPorCanal([linha({ cidade: 'null' })]);
  assert.equal(registros.length, 0);
});

test('FTTH e 5G geram registros separados para o mesmo canal', () => {
  const linhas = [
    linha({ indicador: 'Vendas instaladas Combo 1 Chip - FTTH', meta: '10', realizado: '7' }),
    linha({ indicador: 'Ativação 5G avulso', meta: '20', realizado: '18' }),
  ];
  const { registros } = normalizarDesvioPorCanal(linhas);
  const ftth = registros.find((r) => r.tecnologia === 'ftth');
  const g5 = registros.find((r) => r.tecnologia === '5g');
  assert.equal(ftth.desvio, -3);
  assert.equal(g5.desvio, -2);
});

test('meses diferentes geram registros separados', () => {
  const linhas = [
    linha({ data: '2026-06-01', meta: '10', realizado: '8' }),
    linha({ data: '2026-07-01', meta: '10', realizado: '6' }),
  ];
  const { registros } = normalizarDesvioPorCanal(linhas);
  assert.equal(registros.length, 2);
});
