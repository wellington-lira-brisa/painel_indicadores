import test from 'node:test';
import assert from 'node:assert/strict';
import { atingimentoIndicador, scoreCidade, statusCidade, atingimentoMes, classificarAtingimento, contextoCriacaoPlano, compararClassificacoes } from '../status.js';

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

test('contextoCriacaoPlano: classificacaoNoMomento reflete statusCidade, indiceUltimoMesApurado é o mais recente entre TODOS os indicadores', () => {
  const cidade = {
    indicadores: [
      indicador('instalacao', [
        mes({ meta: 100, realizado: 90 }), // jan, apurado
        mes({ meta: 100, realizado: 95 }), // fev, apurado
        mes(), // mar, não apurado
      ]),
      indicador('efetivado', [
        mes({ meta: 50, realizado: 40 }), // jan
        mes(), // fev, não apurado
        mes({ meta: 50, realizado: 45 }), // mar, apurado — mais recente que instalacao
      ]),
    ],
  };
  const contexto = contextoCriacaoPlano(cidade);
  assert.equal(contexto.classificacaoNoMomento, statusCidade(cidade));
  assert.equal(contexto.indiceUltimoMesApurado, 2); // mar (índice 2), mesmo só em "efetivado"
});

test('contextoCriacaoPlano: indiceUltimoMesApurado é null quando nenhum indicador tem mês apurado', () => {
  const cidade = { indicadores: [indicador('instalacao', [mes(), mes()])] };
  const contexto = contextoCriacaoPlano(cidade);
  assert.equal(contexto.indiceUltimoMesApurado, null);
  assert.equal(contexto.classificacaoNoMomento, 'sem-dado');
});

test('contextoCriacaoPlano: indicadoresMotivadores soma metaIndicador (Meta por Canal)/realizado só dos meses apurados, atingimento null quando não dá pra calcular', () => {
  const cidade = {
    indicadores: [
      indicador('instalacao', [
        mes({ metaIndicador: 100, realizado: 90 }),
        mes({ metaIndicador: 100, realizado: 80 }),
        mes(),
      ]),
      indicador('efetivado', [mes(), mes()]), // nunca apurado
    ],
  };
  const contexto = contextoCriacaoPlano(cidade);
  const instalacao = contexto.indicadoresMotivadores.find((i) => i.indicadorId === 'instalacao');
  assert.equal(instalacao.meta, 200);
  assert.equal(instalacao.realizado, 170);
  assert.equal(instalacao.atingimento, 85);
  assert.equal(instalacao.status, 'amarelo');

  const efetivado = contexto.indicadoresMotivadores.find((i) => i.indicadorId === 'efetivado');
  assert.equal(efetivado.meta, null);
  assert.equal(efetivado.realizado, null);
  assert.equal(efetivado.atingimento, null);
  assert.equal(efetivado.status, null);
});

test('compararClassificacoes: melhorou/piorou/igual seguem a ordem vermelho < amarelo < verde', () => {
  assert.equal(compararClassificacoes('verde', 'vermelho'), 'piorou');
  assert.equal(compararClassificacoes('vermelho', 'verde'), 'melhorou');
  assert.equal(compararClassificacoes('amarelo', 'amarelo'), 'igual');
  assert.equal(compararClassificacoes('vermelho', 'amarelo'), 'melhorou');
  assert.equal(compararClassificacoes('verde', 'amarelo'), 'piorou');
});

test('compararClassificacoes: indeterminado quando falta classificação ou é "sem-dado" de algum lado', () => {
  assert.equal(compararClassificacoes(null, 'verde'), 'indeterminado');
  assert.equal(compararClassificacoes('verde', null), 'indeterminado');
  assert.equal(compararClassificacoes('sem-dado', 'verde'), 'indeterminado');
  assert.equal(compararClassificacoes('verde', 'sem-dado'), 'indeterminado');
});

test('contextoCriacaoPlano: indicador SEM Meta Geral (só metaIndicador — caso real de Orçamento/Efetivado) não fica excluído', () => {
  // meta (Meta Geral) propositalmente ausente — só metaIndicador (Meta por Canal), igual à realidade de orcamento/efetivado.
  const cidade = {
    indicadores: [
      indicador('orcamento', [mes({ meta: null, metaIndicador: 274, realizado: 674 })]),
      indicador('efetivado', [mes({ meta: null, metaIndicador: 239, realizado: 499 })]),
    ],
  };
  const contexto = contextoCriacaoPlano(cidade);
  assert.equal(contexto.indicadoresMotivadores.length, 2); // as duas aparecem, nenhuma some por falta de Meta Geral
  const orcamento = contexto.indicadoresMotivadores.find((i) => i.indicadorId === 'orcamento');
  assert.equal(orcamento.meta, 274);
  assert.equal(orcamento.atingimento, 150); // limitado a 150%, realizado bem acima da meta por canal
});
