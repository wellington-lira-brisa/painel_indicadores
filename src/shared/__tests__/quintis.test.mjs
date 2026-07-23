import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularQuintilVendedores,
  classificarQuintil,
  normalizarQuintisPorCidade,
  paraCsvQuintisVendedores,
  parsearCsv,
} from '../csvIndicadores.js';

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

test('detalhamento individual reutiliza exatamente as somas do quintil agregado', () => {
  const linhas = [
    linha({ vendedor: 'Ana Lima', meta: '10', realizado: '5' }),
    linha({ vendedor: 'Ana Lima', indicador: 'Vendas instalada Combo - FTTH', meta: '10', realizado: '15' }),
  ];
  const { vendedores } = normalizarQuintisPorCidade(linhas, MULT_1);
  const ana = vendedores.find((v) => v.tecnologia === 'ftth');

  assert.equal(ana.vendedor, 'Ana Lima');
  assert.equal(ana.meta, 20);
  assert.equal(ana.realizado, 20);
  assert.equal(ana.atingimento, 1);
  assert.equal(ana.quintil, 1);
  assert.equal(ana.canal, 'LOJA');
  assert.equal(ana.vendedorId, 'v1');
});

test('CSV individual preserva canal, nome e métricas sem publicar hash ou matrícula', () => {
  const { vendedores } = normalizarQuintisPorCidade(
    [linha({ vendedor: 'José da Silva', meta: '10', realizado: '8' })],
    MULT_1,
  );
  const csv = paraCsvQuintisVendedores(vendedores);
  const [registro] = parsearCsv(csv);

  assert.equal(registro.vendedor_id, 'v1');
  assert.equal(registro.vendedor, 'José da Silva');
  assert.equal(registro.canal, 'LOJA');
  assert.equal(registro.meta, '10');
  assert.equal(registro.realizado, '8');
  assert.equal(registro.atingimento, '0.8');
  assert.equal(registro.quintil, '2');
  assert.equal('hash_user' in registro, false);
  assert.equal('matricula' in registro, false);
});

test('identificador público do vendedor permanece estável entre os meses', () => {
  const multiplicadores = new Map([
    ...MULT_1,
    ['2026-08-01\u0001Vendas instaladas Combo 1 Chip - FTTH', 1],
  ]);
  const { vendedores } = normalizarQuintisPorCidade(
    [
      linha({ hash_user: 'ana', vendedor: 'Ana', data: '2026-07-01' }),
      linha({ hash_user: 'bruno', vendedor: 'Bruno', data: '2026-07-01' }),
      linha({ hash_user: 'ana', vendedor: 'Ana', data: '2026-08-01' }),
    ],
    multiplicadores,
  );

  const idsAna = new Set(
    vendedores
      .filter((v) => v.vendedor === 'Ana' && v.tecnologia === 'ftth')
      .map((v) => v.vendedorId),
  );
  const idBruno = vendedores.find((v) => v.vendedor === 'Bruno' && v.tecnologia === 'ftth').vendedorId;

  assert.equal(idsAna.size, 1);
  assert.notEqual([...idsAna][0], idBruno);
});

test('filtro de um canal recalcula cada vendedor antes de classificar o quintil', () => {
  const linhas = [
    linha({ hash_user: 'ana', vendedor: 'Ana', canal: 'PAP', meta: '10', realizado: '10' }),
    linha({ hash_user: 'ana', vendedor: 'Ana', canal: 'LOJA', meta: '10', realizado: '0' }),
    linha({ hash_user: 'bruno', vendedor: 'Bruno', canal: 'PAP', meta: '10', realizado: '5' }),
    linha({ hash_user: 'bruno', vendedor: 'Bruno', canal: 'LOJA', meta: '10', realizado: '10' }),
  ];
  const { vendedores } = normalizarQuintisPorCidade(linhas, MULT_1);

  const pap = calcularQuintilVendedores(vendedores, 'ftth', ['PAP']);
  assert.equal(pap.totalVendedores, 2);
  assert.equal(pap.q1, 1); // Ana: 10/10
  assert.equal(pap.q4, 1); // Bruno: 5/10
  assert.equal(pap.quintilCidade, 3); // média simples: (100% + 50%) / 2 = 75%
  assert.deepEqual(pap.vendedores[0].canais, ['PAP']);

  const loja = calcularQuintilVendedores(vendedores, 'ftth', ['LOJA']);
  assert.equal(loja.q1, 1); // Bruno: 10/10
  assert.equal(loja.q5, 1); // Ana: 0/10
  assert.equal(loja.quintilCidade, 4); // média simples: 50%
  assert.deepEqual(loja.vendedores[0].canais, ['LOJA']);
});

test('filtro de múltiplos canais soma meta e realizado do vendedor antes de classificar', () => {
  const linhas = [
    linha({ hash_user: 'ana', vendedor: 'Ana', canal: 'PAP', meta: '10', realizado: '10' }),
    linha({ hash_user: 'ana', vendedor: 'Ana', canal: 'LOJA', meta: '10', realizado: '0' }),
  ];
  const { vendedores } = normalizarQuintisPorCidade(linhas, MULT_1);
  const filtrado = calcularQuintilVendedores(vendedores, 'ftth', ['PAP', 'LOJA']);

  assert.equal(filtrado.totalVendedores, 1);
  assert.equal(filtrado.vendedores[0].meta, 20);
  assert.equal(filtrado.vendedores[0].realizado, 10);
  assert.equal(filtrado.vendedores[0].atingimento, 0.5);
  assert.equal(filtrado.vendedores[0].quintil, 4);
  assert.deepEqual(filtrado.vendedores[0].canais, ['LOJA', 'PAP']);
});

test('Todos os canais reproduz exatamente a distribuição agregada publicada', () => {
  const linhas = [
    linha({ hash_user: 'ana', vendedor: 'Ana', canal: 'PAP', meta: '10', realizado: '10' }),
    linha({ hash_user: 'ana', vendedor: 'Ana', canal: 'LOJA', meta: '10', realizado: '0' }),
    linha({ hash_user: 'bruno', vendedor: 'Bruno', canal: 'PAP', meta: '10', realizado: '16' }),
    linha({ hash_user: 'sem-meta', vendedor: 'Carla', canal: 'PAP', indicador: 'Churn Safra - Banda Larga' }),
  ];
  const { registros, vendedores } = normalizarQuintisPorCidade(linhas, MULT_1);
  const agregado = registros.find((r) => r.tecnologia === 'ftth');
  const recalculado = calcularQuintilVendedores(vendedores, 'ftth');

  assert.deepEqual(
    {
      totalVendedores: recalculado.totalVendedores,
      q1: recalculado.q1,
      q2: recalculado.q2,
      q3: recalculado.q3,
      q4: recalculado.q4,
      q5: recalculado.q5,
      semMeta: recalculado.semMeta,
      atingimentoMedio: recalculado.atingimentoMedio,
      quintilCidade: recalculado.quintilCidade,
    },
    {
      totalVendedores: agregado.totalVendedores,
      q1: agregado.q1,
      q2: agregado.q2,
      q3: agregado.q3,
      q4: agregado.q4,
      q5: agregado.q5,
      semMeta: agregado.semMeta,
      atingimentoMedio: agregado.atingimentoMedio,
      quintilCidade: agregado.quintilCidade,
    },
  );
});

test('filtro não mistura tecnologias do mesmo vendedor entre canais', () => {
  const linhas = [
    linha({ hash_user: 'h1', canal: 'PAP', meta: '10', realizado: '10' }),
    linha({
      hash_user: 'h1',
      canal: 'LOJA',
      indicador: 'Ativação 5G avulso',
      meta: '10',
      realizado: '10',
    }),
  ];
  const { vendedores } = normalizarQuintisPorCidade(linhas, MULT_1);

  assert.equal(calcularQuintilVendedores(vendedores, '5g', ['PAP']), null);
  assert.equal(calcularQuintilVendedores(vendedores, 'ftth', ['LOJA']), null);
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

// Achado real na base (auditoria 2026-07): 18 vendedores publicados com
// hash_user vazio ("") na fonte, incluindo dois pares que colidiram no
// mesmo mês em cidades diferentes — MARIA JOSENIR (matrícula 30342) e
// RAYSA (matrícula 31778), ambas em 2026-07 com hash_user="". Antes do
// fix, as duas eram tratadas como o mesmo "vendedor" (mesma chave ''),
// somando meta/realizado de pessoas diferentes num quintil só.
test('hash_user vazio nunca funde vendedores diferentes no mesmo mês', () => {
  const linhas = [
    linha({
      hash_user: '',
      vendedor: 'MARIA JOSENIR PEREIRA DA SILVA',
      matricula: '30342',
      cidade: 'JOAO PESSOA / PB',
      meta: '10',
      realizado: '10', // 100% -> Q1
    }),
    linha({
      hash_user: '',
      vendedor: 'RAYSA D JULIA MENDES DOS SANTOS',
      matricula: '31778',
      cidade: 'SANTA RITA / PB',
      meta: '10',
      realizado: '1', // 10% -> Q5
    }),
  ];
  const { vendedores, avisos } = normalizarQuintisPorCidade(linhas, MULT_1);
  const ftth = vendedores.filter((v) => v.tecnologia === 'ftth');

  const maria = ftth.find((v) => v.vendedor === 'MARIA JOSENIR PEREIRA DA SILVA');
  const raysa = ftth.find((v) => v.vendedor === 'RAYSA D JULIA MENDES DOS SANTOS');

  assert.ok(maria, 'Maria deve aparecer como vendedor próprio');
  assert.ok(raysa, 'Raysa deve aparecer como vendedor próprio');
  assert.notEqual(maria.vendedorId, raysa.vendedorId); // nunca a mesma pessoa
  assert.equal(maria.meta, 10);
  assert.equal(maria.realizado, 10);
  assert.equal(maria.quintil, 1); // não pode virar (10+1)/(10+10)=52% -> Q4
  assert.equal(raysa.quintil, 5);
  assert.ok(avisos.some((a) => a.includes('hash_user vazio')));
});

// Mesmo hash_user vazio, mesma cidade e mesmo mês, só o nome muda: ainda
// assim precisa continuar separado (a chave de fallback é nome+cidade+mês,
// não só cidade+mês).
test('hash_user vazio: duas pessoas na MESMA cidade/mês continuam separadas', () => {
  const linhas = [
    linha({ hash_user: '', vendedor: 'ANA MAYARA', matricula: '11111', meta: '10', realizado: '10' }),
    linha({ hash_user: '', vendedor: 'BRUNA SILVA', matricula: '11111', meta: '10', realizado: '0' }),
  ];
  const { vendedores } = normalizarQuintisPorCidade(linhas, MULT_1);
  const ftth = vendedores.filter((v) => v.tecnologia === 'ftth');
  assert.equal(new Set(ftth.map((v) => v.vendedorId)).size, 2);
  assert.equal(ftth.find((v) => v.vendedor === 'ANA MAYARA').quintil, 1);
  assert.equal(ftth.find((v) => v.vendedor === 'BRUNA SILVA').quintil, 5);
});

// Achado real na base: hash_user NÃO-vazio "eb54f09d..." associado a duas
// matrículas diferentes (29790 e 29957) no mesmo mês (2026-02 e 2026-03).
// Aqui a chave de agrupamento permanece o hash (não há sinal suficiente
// pra decidir separar sem arriscar quebrar o caso são), mas o pipeline
// deve avisar — nunca falhar silenciosamente.
test('hash_user não-vazio com múltiplas matrículas no mesmo mês gera aviso (não bloqueia publicação)', () => {
  const linhas = [
    linha({ hash_user: 'colidiu', matricula: '29790', vendedor: 'Pessoa A', meta: '10', realizado: '10' }),
    linha({ hash_user: 'colidiu', matricula: '29957', vendedor: 'Pessoa B', meta: '10', realizado: '5' }),
  ];
  const { avisos, registros } = normalizarQuintisPorCidade(linhas, MULT_1);
  assert.ok(avisos.some((a) => a.includes('colidiu') && a.includes('mais de uma matrícula')));
  assert.ok(registros.length > 0); // aviso não bloqueia a publicação
});