import test from 'node:test';
import assert from 'node:assert/strict';
import { atingimentoIndicador, scoreCidade, statusCidade, atingimentoMes, classificarAtingimento } from '../status.js';

function mes(overrides = {}) {
  return { mes: 'JAN', meta: null, metaIndicador: null, realizado: null, semanas: [], ...overrides };
}

function indicador(id, meses, melhorQuandoMaior = true) {
  return { id, nome: id, melhorQuandoMaior, meses };
}

test('classificarAtingimento: limites de 90/75', () => {
  assert.equal(classificarAtingimento(90), 'verde');
  assert.equal(classificarAtingimento(89.99), 'amarelo');
  assert.equal(classificarAtingimento(75), 'amarelo');
  assert.equal(classificarAtingimento(74.99), 'vermelho');
});

test('atingimentoIndicador: null quando nenhum mês tem realizado', () => {
  const ind = indicador('instalacao', [mes(), mes()]);
  assert.equal(atingimentoIndicador(ind), null);
});

test('atingimentoIndicador: null quando soma de meta é 0 (sem meta cadastrada)', () => {
  const ind = indicador('instalacao', [mes({ meta: 0, realizado: 10 })]);
  assert.equal(atingimentoIndicador(ind), null);
});

test('atingimentoIndicador: calcula realizado/meta, limitado a 150%', () => {
  const ind = indicador('instalacao', [mes({ meta: 100, realizado: 90 })]);
  assert.equal(atingimentoIndicador(ind), 90);

  const estourado = indicador('instalacao', [mes({ meta: 10, realizado: 1000 })]);
  assert.equal(atingimentoIndicador(estourado), 150);
});

test('atingimentoIndicador: campoMeta troca a fonte (meta vs metaIndicador)', () => {
  const ind = indicador('instalacao', [mes({ meta: 100, metaIndicador: 50, realizado: 50 })]);
  assert.equal(atingimentoIndicador(ind, 'meta'), 50);
  assert.equal(atingimentoIndicador(ind, 'metaIndicador'), 100);
});

test('atingimentoIndicador: "menor é melhor" inverte a razão', () => {
  const ind = indicador('churn', [mes({ meta: 5, realizado: 10 })], false);
  assert.equal(atingimentoIndicador(ind), 50); // meta/realizado = 5/10
});

/**
 * Regressão: `scoreCidade` chamava `cidade.indicadores.map(atingimentoIndicador)`
 * passando a função direto pro `.map()`. `Array.prototype.map` invoca
 * `fn(elemento, índice, array)` — o índice (0, 1, 2...) caía no parâmetro
 * `campoMeta` de `atingimentoIndicador`, fazendo `mes[0]`/`mes[1]`/`mes[2]`
 * (undefined, `mes` não é array) zerar toda meta e devolver `null` sempre.
 * Resultado em produção: `scoreCidade`/`statusCidade` sempre `null`/`'sem-dado'`
 * pra TODA cidade — filtros de Status, Meta Batida e o card "Atingimento
 * médio" da página principal ficavam sempre vazios. Este teste trava
 * explicitamente essa forma de chamada pra nunca mais regredir.
 */
test('scoreCidade: NÃO deve zerar por causa do índice implícito do .map() (regressão)', () => {
  const cidade = {
    indicadores: [
      indicador('orcamento', [mes({ meta: 100, realizado: 80 })]),
      indicador('efetivado', [mes({ meta: 100, realizado: 80 })]),
      indicador('instalacao', [mes({ meta: 100, realizado: 90 })]), // índice 2 — o que mais sofria com o bug
    ],
  };
  assert.equal(scoreCidade(cidade), (80 + 80 + 90) / 3);
});

test('scoreCidade: null quando nenhum indicador tem meta+realizado (cidade sem dado)', () => {
  const cidade = { indicadores: [indicador('orcamento', [mes()]), indicador('instalacao', [mes()])] };
  assert.equal(scoreCidade(cidade), null);
});

test('scoreCidade: média só dos indicadores com atingimento válido, ignora os null', () => {
  const cidade = {
    indicadores: [
      indicador('orcamento', [mes()]), // sem meta/realizado -> null, fora da média
      indicador('instalacao', [mes({ meta: 100, realizado: 75 })]),
    ],
  };
  assert.equal(scoreCidade(cidade), 75);
});

test('statusCidade: "sem-dado" quando score é null; classifica normalmente quando há score', () => {
  const semDado = { indicadores: [indicador('instalacao', [mes()])] };
  assert.equal(statusCidade(semDado), 'sem-dado');

  const saudavel = { indicadores: [indicador('instalacao', [mes({ meta: 100, realizado: 95 })])] };
  assert.equal(statusCidade(saudavel), 'verde');
});

test('atingimentoMes: null se mês não apurado ou sem meta; calcula normalmente quando tem os dois', () => {
  assert.equal(atingimentoMes(indicador('instalacao', []), mes({ meta: 100, realizado: null })), null);
  assert.equal(atingimentoMes(indicador('instalacao', []), mes({ meta: 0, realizado: 10 })), null);
  assert.equal(atingimentoMes(indicador('instalacao', []), mes({ meta: 100, realizado: 50 })), 50);
});
