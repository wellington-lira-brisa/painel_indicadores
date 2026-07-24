import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparVendedoresPorIndicador,
  filtrarGruposQuintil,
  ordenarGruposQuintil,
} from '../visaoQuintilVendedores.js';

const vendedores = [
  {
    vendedorId: 'v1',
    vendedor: 'JOÃO',
    canais: ['LOJA'],
    indicador: 'Combo',
    meta: 10,
    realizado: 12,
    atingimento: 1.2,
    quintil: 1,
  },
  {
    vendedorId: 'v1',
    vendedor: 'JOÃO',
    canais: ['LOJA'],
    indicador: 'Avulso',
    meta: 15,
    realizado: 6,
    atingimento: 0.4,
    quintil: 4,
  },
  {
    vendedorId: 'v2',
    vendedor: 'ANA',
    canais: ['PAP'],
    indicador: 'Combo',
    meta: 10,
    realizado: 2,
    atingimento: 0.2,
    quintil: 5,
  },
];

test('agrupa todos os indicadores do vendedor em uma única entrada', () => {
  const grupos = agruparVendedoresPorIndicador(vendedores);

  assert.equal(grupos.length, 2);
  assert.equal(grupos.find((grupo) => grupo.vendedorId === 'v1').quantidadeIndicadores, 2);
  assert.deepEqual(grupos.find((grupo) => grupo.vendedorId === 'v1').distribuicao, {
    1: 1,
    2: 0,
    3: 0,
    4: 1,
    5: 0,
    semMeta: 0,
  });
});

test('vincula a evolução do histórico ao indicador correto', () => {
  const historico = {
    vendedores: [
      { vendedorId: 'v1', indicador: 'Combo', tendencia: { tipo: 'melhorou', faixas: 1 } },
      { vendedorId: 'v1', indicador: 'Avulso', tendencia: { tipo: 'caiu', faixas: 2 } },
    ],
  };

  const grupo = agruparVendedoresPorIndicador(vendedores, historico).find(
    (item) => item.vendedorId === 'v1',
  );

  assert.equal(grupo.melhorando, 1);
  assert.equal(grupo.emQueda, 1);
  assert.equal(
    grupo.indicadores.find((item) => item.indicador === 'Avulso').tendencia.tipo,
    'caiu',
  );
});

test('filtro de indicador preserva uma linha por colaborador e recalcula o resumo visual', () => {
  const grupos = agruparVendedoresPorIndicador(vendedores);
  const filtrados = filtrarGruposQuintil(grupos, { indicador: 'Combo' });

  assert.equal(filtrados.length, 2);
  assert.ok(filtrados.every((grupo) => grupo.quantidadeIndicadores === 1));
  assert.deepEqual(filtrados.map((grupo) => grupo.distribuicao[1]), [1, 0]);
});

test('ordenação padrão coloca primeiro quem possui o indicador mais crítico', () => {
  const grupos = agruparVendedoresPorIndicador(vendedores);
  const ordenados = ordenarGruposQuintil(grupos);

  assert.equal(ordenados[0].vendedor, 'ANA');
  assert.equal(ordenados[0].piorQuintil, 5);
});