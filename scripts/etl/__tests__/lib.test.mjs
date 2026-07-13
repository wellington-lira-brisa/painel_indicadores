import test from 'node:test';
import assert from 'node:assert/strict';
import { parsearCsv, validar, normalizar, normalizarCidade, paraCsv, COLUNAS_OBRIGATORIAS } from '../../../src/shared/csvIndicadores.js';

const CABECALHO = COLUNAS_OBRIGATORIAS.join(',');

function csvValido() {
  const linhaBase = (overrides = {}) => {
    const base = {
      mes_ref: '2026-07-01',
      mes_semana: '2026-07_S01',
      semana_mes: '1',
      primeiro_dia_semana: '2026-07-01',
      ultimo_dia_semana: '2026-07-05',
      dias_uteis_mes: '25',
      dias_uteis_semana: '3.5',
      dias_trab_semana: '3.5',
      cidade: 'ARARIPINA / PE',
      servico: 'INTERNET',
      canal_geral: 'PAP',
      status_venda: 'Instalado',
      origem: 'WAVES',
      realizado_semana: '10',
      realizado_mes: '10',
      ...overrides,
    };
    return COLUNAS_OBRIGATORIAS.map((c) => base[c]).join(',');
  };
  // gera >100 linhas válidas (mínimo de volume) + garante FTTH e 5G presentes
  const linhas = [CABECALHO];
  for (let i = 0; i < 60; i++) {
    linhas.push(linhaBase({ canal_geral: `CANAL_${i}`, realizado_semana: String(i), realizado_mes: String(i) }));
  }
  for (let i = 0; i < 60; i++) {
    linhas.push(
      linhaBase({
        servico: '5G',
        status_venda: 'Assinado',
        canal_geral: `CANAL_5G_${i}`,
        origem: '5G AVULSO',
        realizado_semana: String(i),
        realizado_mes: String(i),
      }),
    );
  }
  return linhas.join('\n');
}

test('normalizarCidade converte "NOME / UF" para slug "nome-uf"', () => {
  assert.equal(normalizarCidade('ARARIPINA / PE'), 'araripina-pe');
  assert.equal(normalizarCidade('Juazeiro do Norte / CE'), 'juazeiro-do-norte-ce');
  assert.equal(normalizarCidade(''), null);
  assert.equal(normalizarCidade('SEM BARRA'), null);
});

test('parsearCsv lê cabeçalho e linhas corretamente', () => {
  const linhas = parsearCsv(csvValido());
  assert.equal(linhas.length, 120);
  assert.equal(linhas[0].cidade, 'ARARIPINA / PE');
  assert.equal(linhas[0].servico, 'INTERNET');
});

test('validar aceita uma base bem formada', () => {
  const { erros } = validar(parsearCsv(csvValido()));
  assert.deepEqual(erros, []);
});

test('validar rejeita coluna obrigatória ausente', () => {
  const csvSemColuna = csvValido().split('\n').map((l, i) => (i === 0 ? l.replace('cidade,', '') : l));
  // como a coluna sumiu do header mas os valores continuam na linha, o parser vai desalinhar —
  // isso por si só já deve ser pego como erro de coluna ausente
  const { erros } = validar(parsearCsv(csvSemColuna.join('\n')));
  assert.ok(erros.some((e) => e.includes('Coluna obrigatória ausente')));
});

test('validar rejeita valor negativo', () => {
  const csv = csvValido().split('\n');
  csv[1] = csv[1].replace(/,0,0$/, ',0,-5');
  const { erros } = validar(parsearCsv(csv.join('\n')));
  assert.ok(erros.some((e) => e.includes('negativo')));
});

test('validar rejeita combinação servico/status desconhecida', () => {
  const csv = csvValido().split('\n');
  csv[1] = csv[1].replace('INTERNET', '5G').replace('Instalado', 'Instalado'); // 5G+Instalado não existe no mapa
  const { erros } = validar(parsearCsv(csv.join('\n')));
  assert.ok(erros.some((e) => e.includes('não reconhecida')));
});

test('validar rejeita divergência entre soma semanal e realizado_mes', () => {
  const linhas = [CABECALHO];
  const linha = (semana, mensal) =>
    [
      '2026-07-01', '2026-07_S01', '1', '2026-07-01', '2026-07-05', '25', '3.5', '3.5',
      'ARARIPINA / PE', 'INTERNET', 'PAP', 'Instalado', 'WAVES', semana, mensal,
    ].join(',');
  linhas.push(linha(10, 999)); // mensal não bate com a soma da(s) semana(s)
  // completa volume mínimo com linhas válidas (FTTH + 5G) que não conflitam
  for (let i = 0; i < 60; i++) {
    linhas.push(
      ['2026-07-01', '2026-07_S02', '2', '2026-07-06', '2026-07-12', '25', '5', '5', '',
        'INTERNET', 'ONLINE', 'Efetivado', 'WAVES', i, i].join(','),
    );
  }
  for (let i = 0; i < 60; i++) {
    linhas.push(
      ['2026-07-01', '2026-07_S02', '2', '2026-07-06', '2026-07-12', '25', '5', '5', '',
        '5G', 'ONLINE', 'Assinado', '5G AVULSO', i, i].join(','),
    );
  }
  const { erros } = validar(parsearCsv(linhas.join('\n')));
  assert.ok(erros.some((e) => e.includes('diverge')));
});

test('normalizar agrega canais e gera linha mensal + semanal', () => {
  const linhas = parsearCsv(csvValido());
  const registros = normalizar(linhas);
  const mensalFtth = registros.find((r) => r.tecnologia === 'ftth' && r.semanaMes === null);
  assert.ok(mensalFtth);
  assert.equal(mensalFtth.indicadorId, 'instalacao');
  assert.equal(mensalFtth.cidadeSlug, 'araripina-pe');
  // soma de 0..59 = 1770
  assert.equal(mensalFtth.valor, 1770);

  const semanalCincoG = registros.find((r) => r.tecnologia === '5g' && r.semanaMes === 1);
  assert.ok(semanalCincoG);
  assert.equal(semanalCincoG.indicadorId, 'ativacao');
});

test('paraCsv + parsearCsv fazem um roundtrip sem perda (é o que gerarBase.mjs escreve e o front lê)', () => {
  const registros = normalizar(parsearCsv(csvValido()));
  const csvGerado = paraCsv(registros);
  const linhasRelidas = parsearCsv(csvGerado);
  assert.equal(linhasRelidas.length, registros.length);

  const mensalFtth = linhasRelidas.find((l) => l.tecnologia === 'ftth' && l.semana_mes === '');
  assert.equal(mensalFtth.cidade_slug, 'araripina-pe');
  assert.equal(mensalFtth.valor, '1770');
});

test('datas reais da semana (primeiro_dia_semana/ultimo_dia_semana) sobrevivem ao roundtrip — é isso que corrige o rótulo errado da coluna de semana no front', () => {
  const linhas = [COLUNAS_OBRIGATORIAS.join(',')];
  const linha = (canal, semanaMes, primeiroDia, ultimoDia, valor) =>
    [
      '2026-07-01', `2026-07_S0${semanaMes}`, String(semanaMes), primeiroDia, ultimoDia, '25', '3.5', '3.5',
      'ARARIPINA / PE', 'INTERNET', canal, 'Instalado', 'WAVES', valor, valor,
    ].join(',');
  // semana 1 real vai de 01 a 05 (5 dias, não 7) — é exatamente o caso que
  // quebrava com o esquema fixo de blocos de 7 dias do app
  linhas.push(linha('CANAL_A', 1, '2026-07-01', '2026-07-05', 10));
  for (let i = 0; i < 99; i++) linhas.push(linha(`CANAL_5G_${i}`, 1, '2026-07-01', '2026-07-05', i).replace('INTERNET', '5G').replace('Instalado', 'Assinado').replace('WAVES', '5G AVULSO'));

  const registros = normalizar(parsearCsv(linhas.join('\n')));
  const csvGerado = paraCsv(registros);
  const relinhas = parsearCsv(csvGerado);

  const semanaFtth = relinhas.find((l) => l.tecnologia === 'ftth' && l.semana_mes === '1');
  assert.equal(semanaFtth.primeiro_dia_semana, '2026-07-01');
  assert.equal(semanaFtth.ultimo_dia_semana, '2026-07-05');
});

test('parsearCsv detecta ";" como delimitador e a base aceita decimal com vírgula (formato real do export Spark)', () => {
  const cabecalho = COLUNAS_OBRIGATORIAS.join(';');
  const linha = (canal, semana, mensal) =>
    [
      '2026-07-01', '2026-07_S01', '1', '2026-07-01', '2026-07-05', '25', '3,5', '3,5',
      'ARARIPINA / PE', 'INTERNET', canal, 'Instalado', 'WAVES', semana, mensal,
    ].join(';');

  const linhas = [cabecalho];
  for (let i = 0; i < 60; i++) linhas.push(linha(`CANAL_${i}`, `${i},5`, `${i},5`));
  for (let i = 0; i < 60; i++) {
    linhas.push(
      [
        '2026-07-01', '2026-07_S01', '1', '2026-07-01', '2026-07-05', '25', '3,5', '3,5',
        'ARARIPINA / PE', '5G', `CANAL_5G_${i}`, 'Assinado', '5G AVULSO', `${i},5`, `${i},5`,
      ].join(';'),
    );
  }

  const linhasParsed = parsearCsv(linhas.join('\n'));
  assert.equal(linhasParsed[0].cidade, 'ARARIPINA / PE');
  assert.equal(linhasParsed[0].dias_uteis_semana, '3,5'); // string crua preservada — só validar()/normalizar() convertem

  const { erros } = validar(linhasParsed);
  assert.deepEqual(erros, []);

  const registros = normalizar(linhasParsed);
  const mensalFtth = registros.find((r) => r.tecnologia === 'ftth' && r.semanaMes === null);
  // soma de 0,5 + 1,5 + ... + 59,5 = soma(0..59) + 60*0.5 = 1770 + 30 = 1800
  assert.equal(mensalFtth.valor, 1800);
});
