import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mesesConsecutivosAte,
  montarHistoricoVendedores,
  tendenciaEntreQuintis,
} from '../historicoQuintil.js';

test('mesesConsecutivosAte atravessa a virada do ano sem criar lacunas', () => {
  assert.deepEqual(mesesConsecutivosAte('2026-02-01', 4), [
    '2025-11-01',
    '2025-12-01',
    '2026-01-01',
    '2026-02-01',
  ]);
});

test('tendência respeita que Q1 é melhor que Q5', () => {
  assert.deepEqual(tendenciaEntreQuintis(4, 3), { tipo: 'melhorou', faixas: 1 });
  assert.deepEqual(tendenciaEntreQuintis(2, 3), { tipo: 'caiu', faixas: 1 });
  assert.deepEqual(tendenciaEntreQuintis(2, 2), { tipo: 'estavel', faixas: 0 });
  assert.deepEqual(tendenciaEntreQuintis(null, 2), { tipo: 'sem-comparacao', faixas: 0 });
});

test('histórico compara apenas o time atual e separa quem não tem base anterior', () => {
  const resultados = new Map([
    [
      '2026-06-01',
      {
        vendedores: [
          { vendedorId: 'v1', vendedor: 'Ana', canais: ['PAP'], atingimento: 0.5, quintil: 4 },
          { vendedorId: 'saiu', vendedor: 'Bruno', canais: ['LOJA'], atingimento: 1, quintil: 1 },
        ],
      },
    ],
    [
      '2026-07-01',
      {
        vendedores: [
          { vendedorId: 'v1', vendedor: 'Ana', canais: ['PAP'], atingimento: 0.7, quintil: 3 },
          { vendedorId: 'novo', vendedor: 'Carlos', canais: ['ONLINE'], atingimento: 0.9, quintil: 2 },
        ],
      },
    ],
  ]);

  const historico = montarHistoricoVendedores(resultados, '2026-07-01', 2);

  assert.deepEqual(historico.vendedores.map((v) => v.vendedor), ['Carlos', 'Ana']);
  assert.equal(historico.vendedores.some((v) => v.vendedor === 'Bruno'), false);
  assert.deepEqual(historico.vendedores.find((v) => v.vendedor === 'Ana').tendencia, {
    tipo: 'melhorou',
    faixas: 1,
  });
  assert.deepEqual(historico.movimentos, {
    melhoraram: 1,
    estaveis: 0,
    cairam: 0,
    semComparacao: 1,
  });
});

test('sem meta ou mês anterior ausente não vira queda', () => {
  const resultados = new Map([
    [
      '2026-07-01',
      {
        vendedores: [
          {
            vendedorId: 'v1',
            vendedor: 'Ana',
            canais: ['PAP'],
            meta: null,
            realizado: null,
            atingimento: null,
            quintil: null,
          },
        ],
      },
    ],
  ]);

  const historico = montarHistoricoVendedores(resultados, '2026-07-01', 2);
  assert.equal(historico.movimentos.semComparacao, 1);
  assert.equal(historico.movimentos.cairam, 0);
});

// Achado real: quintil por indicador significa que o mesmo vendedorId
// pode aparecer várias vezes no mesmo mês (Combo 1 Chip, Combo 2+ Chip,
// avulso). Chavear só por vendedorId fazia a última linha processada
// sobrescrever as anteriores, perdendo o histórico dos outros indicadores
// em silêncio — sem erro, sem aviso, só um indicador "sumia".
test('vendedor com múltiplos indicadores FTTH mantém histórico separado por indicador', () => {
  const resultados = new Map([
    [
      '2026-06-01',
      {
        vendedores: [
          { vendedorId: 'v1', vendedor: 'Guilherme', indicador: 'Vendas instaladas Combo 1 Chip - FTTH', canais: ['PAP'], atingimento: 0.9, quintil: 2 },
          { vendedorId: 'v1', vendedor: 'Guilherme', indicador: 'Vendas instaladas avulso - FTHH', canais: ['PAP'], atingimento: 1.5, quintil: 1 },
        ],
      },
    ],
    [
      '2026-07-01',
      {
        vendedores: [
          { vendedorId: 'v1', vendedor: 'Guilherme', indicador: 'Vendas instaladas Combo 1 Chip - FTTH', canais: ['PAP'], atingimento: 0.5, quintil: 4 },
          { vendedorId: 'v1', vendedor: 'Guilherme', indicador: 'Vendas instaladas avulso - FTHH', canais: ['PAP'], atingimento: 1.5, quintil: 1 },
        ],
      },
    ],
  ]);

  const historico = montarHistoricoVendedores(resultados, '2026-07-01', 2);
  assert.equal(historico.vendedores.length, 2); // nunca 1 — cada indicador é sua própria linha

  const combo1 = historico.vendedores.find((v) => v.indicador === 'Vendas instaladas Combo 1 Chip - FTTH');
  const avulso = historico.vendedores.find((v) => v.indicador === 'Vendas instaladas avulso - FTHH');
  assert.ok(combo1);
  assert.ok(avulso);
  assert.equal(combo1.tendencia.tipo, 'caiu'); // Q2 -> Q4
  assert.equal(avulso.tendencia.tipo, 'estavel'); // Q1 -> Q1, não deve ser afetado pela queda do Combo1
});
