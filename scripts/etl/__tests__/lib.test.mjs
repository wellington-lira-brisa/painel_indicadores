import test from 'node:test';
import assert from 'node:assert/strict';
import { parsearCsv, validar, normalizar, normalizarCidade, paraCsv, normalizarMetadadosCidade, paraCsvMetadados, normalizarPorCanal, paraCsvPorCanal, normalizarMetasInstalacaoFtth, paraCsvMetasInstalacaoFtth, normalizarCidadesOficiais, paraCsvCidadesOficiais, COLUNAS_OBRIGATORIAS } from '../../../src/shared/csvIndicadores.js';

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

test('normalizar mantém 2025-07 e 2026-07 como registros separados (não colide por mês, só por mes_ref completo)', () => {
  const linhas = [COLUNAS_OBRIGATORIAS.join(',')];
  const linha = (mesRef, canal, valor) =>
    [
      mesRef, `${mesRef.slice(0, 7)}_S01`, '1', mesRef, mesRef, '25', '5', '5',
      'ARARIPINA / PE', 'INTERNET', canal, 'Instalado', 'WAVES', valor, valor,
    ].join(',');
  linhas.push(linha('2026-07-01', 'CANAL_2026', 119));
  linhas.push(linha('2025-07-01', 'CANAL_2025', 240));
  for (let i = 0; i < 98; i++) {
    linhas.push(
      ['2026-07-01', '2026-07_S01', '1', '2026-07-01', '2026-07-01', '25', '5', '5', 'ARARIPINA / PE',
        '5G', `CANAL_5G_${i}`, 'Assinado', '5G AVULSO', i, i].join(','),
    );
  }

  const registros = normalizar(parsearCsv(linhas.join('\n')));
  const mensal2026 = registros.find((r) => r.tecnologia === 'ftth' && r.mesRef === '2026-07-01' && r.semanaMes === null);
  const mensal2025 = registros.find((r) => r.tecnologia === 'ftth' && r.mesRef === '2025-07-01' && r.semanaMes === null);
  assert.equal(mensal2026.valor, 119);
  assert.equal(mensal2025.valor, 240);
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

test('normalizarMetadadosCidade extrai gerência/gerente/coordenação por cidade, 1 registro por cidade (não por linha)', () => {
  const linhas = [
    { cidade: 'ARARIPINA / PE', gerencia_cidade: 'G7', gerente_cidade: 'JECKSON DIOGO', coordenacao: 'PETROLINA' },
    { cidade: 'ARARIPINA / PE', gerencia_cidade: 'G7', gerente_cidade: 'JECKSON DIOGO', coordenacao: 'PETROLINA' },
    { cidade: 'NATAL / RN', gerencia_cidade: 'G3', gerente_cidade: 'TIAGO BRASILEIRO', coordenacao: 'RN LITORAL' },
  ];
  const { registros, avisos } = normalizarMetadadosCidade(linhas);
  assert.deepEqual(avisos, []);
  assert.equal(registros.length, 2);
  const araripina = registros.find((r) => r.cidadeSlug === 'araripina-pe');
  assert.deepEqual(araripina, {
    cidadeSlug: 'araripina-pe',
    cidadeOrigem: 'ARARIPINA / PE',
    gerenciaCidade: 'G7',
    gerenteCidade: 'JECKSON DIOGO',
    coordenacao: 'PETROLINA',
  });
});

test('normalizarMetadadosCidade trata "NÃO MAPEADO" e coluna ausente como sem dado, sem quebrar', () => {
  const linhas = [
    { cidade: 'ARARIPINA / PE', gerencia_cidade: 'NÃO MAPEADO', gerente_cidade: '', coordenacao: undefined },
  ];
  const { registros, avisos } = normalizarMetadadosCidade(linhas);
  assert.deepEqual(avisos, []);
  assert.deepEqual(registros[0], {
    cidadeSlug: 'araripina-pe',
    cidadeOrigem: 'ARARIPINA / PE',
    gerenciaCidade: null,
    gerenteCidade: null,
    coordenacao: null,
  });
});

test('normalizarMetadadosCidade avisa (sem quebrar) quando a mesma cidade tem valores divergentes, e mantém o primeiro', () => {
  const linhas = [
    { cidade: 'ARARIPINA / PE', gerencia_cidade: 'G7', gerente_cidade: 'JECKSON DIOGO', coordenacao: 'PETROLINA' },
    { cidade: 'ARARIPINA / PE', gerencia_cidade: 'G9', gerente_cidade: 'JECKSON DIOGO', coordenacao: 'PETROLINA' },
  ];
  const { registros, avisos } = normalizarMetadadosCidade(linhas);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /gerencia_cidade/);
  assert.equal(registros[0].gerenciaCidade, 'G7'); // primeiro valor visto, não o último
});

test('paraCsvMetadados + parsearCsv fazem roundtrip sem perda', () => {
  const { registros } = normalizarMetadadosCidade([
    { cidade: 'ARARIPINA / PE', gerencia_cidade: 'G7', gerente_cidade: 'JECKSON DIOGO', coordenacao: 'PETROLINA' },
  ]);
  const linhas = parsearCsv(paraCsvMetadados(registros));
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].cidade_slug, 'araripina-pe');
  assert.equal(linhas[0].gerencia_cidade, 'G7');
  assert.equal(linhas[0].gerente_cidade, 'JECKSON DIOGO');
  assert.equal(linhas[0].coordenacao, 'PETROLINA');
});

test('normalizarPorCanal mantém uma linha por canal (não soma canais entre si)', () => {
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
      status_venda: 'Instalado',
      origem: 'WAVES',
      ...overrides,
    };
    return COLUNAS_OBRIGATORIAS.map((c) => base[c]).join(',');
  };
  const linhas = parsearCsv(
    [
      CABECALHO,
      linhaBase({ canal_geral: 'PAP', realizado_semana: '10', realizado_mes: '10' }),
      linhaBase({ canal_geral: 'LOJA', realizado_semana: '5', realizado_mes: '5' }),
    ].join('\n'),
  );

  const porCanal = normalizarPorCanal(linhas);
  const mensalPorCanal = porCanal.filter((r) => r.semanaMes === null);
  assert.equal(mensalPorCanal.length, 2); // PAP e LOJA, não somados

  const pap = mensalPorCanal.find((r) => r.canal === 'PAP');
  const loja = mensalPorCanal.find((r) => r.canal === 'LOJA');
  assert.equal(pap.valor, 10);
  assert.equal(loja.valor, 5);

  // soma dos canais == total que normalizar() (agregado) produziria
  const totalNormalizar = normalizar(linhas).find((r) => r.semanaMes === null).valor;
  assert.equal(pap.valor + loja.valor, totalNormalizar);
});

test('normalizarPorCanal não duplica realizado_mes entre as semanas do mesmo mês (mesmo canal)', () => {
  const linhaBase = (overrides = {}) => {
    const base = {
      mes_ref: '2026-07-01',
      dias_uteis_mes: '25',
      dias_uteis_semana: '3.5',
      dias_trab_semana: '3.5',
      cidade: 'ARARIPINA / PE',
      servico: 'INTERNET',
      canal_geral: 'PAP',
      status_venda: 'Instalado',
      origem: 'WAVES',
      realizado_mes: '10',
      ...overrides,
    };
    return COLUNAS_OBRIGATORIAS.map((c) => base[c]).join(',');
  };
  const linhas = parsearCsv(
    [
      CABECALHO,
      linhaBase({ mes_semana: '2026-07_S01', semana_mes: '1', primeiro_dia_semana: '2026-07-01', ultimo_dia_semana: '2026-07-05', realizado_semana: '6' }),
      linhaBase({ mes_semana: '2026-07_S02', semana_mes: '2', primeiro_dia_semana: '2026-07-06', ultimo_dia_semana: '2026-07-12', realizado_semana: '4' }),
    ].join('\n'),
  );

  const porCanal = normalizarPorCanal(linhas);
  const mensal = porCanal.find((r) => r.semanaMes === null);
  assert.equal(mensal.valor, 10); // não 20 — realizado_mes contado uma vez só

  const semanais = porCanal.filter((r) => r.semanaMes !== null);
  assert.equal(semanais.length, 2);
  assert.equal(semanais.reduce((soma, r) => soma + r.valor, 0), 10); // 6 + 4
});

test('paraCsvPorCanal + parsearCsv fazem roundtrip sem perda, incluindo a coluna canal', () => {
  const registros = normalizarPorCanal(
    parsearCsv(
      [
        CABECALHO,
        [
          '2026-07-01', '2026-07_S01', '1', '2026-07-01', '2026-07-05', '25', '3.5', '3.5',
          'ARARIPINA / PE', 'INTERNET', 'PAP', 'Instalado', 'WAVES', '10', '10',
        ].join(','),
      ].join('\n'),
    ),
  );
  const linhas = parsearCsv(paraCsvPorCanal(registros));
  const mensal = linhas.find((l) => l.semana_mes === '');
  assert.equal(mensal.cidade_slug, 'araripina-pe');
  assert.equal(mensal.canal, 'PAP');
  assert.equal(mensal.valor, '10');
});

test('normalizarMetasInstalacaoFtth filtra só FTTH + Vendas Instaladas + venda + Ativo', () => {
  const linhas = [
    { data: '2026-01-01', cidade: 'ARARIPINA/PE', indicador_geral: 'Vendas Instaladas', servico: 'FTTH', meta: '119', categoria: 'venda', stutus: 'Ativo' },
    { data: '2026-01-01', cidade: 'ARARIPINA/PE', indicador_geral: 'Vendas Instaladas', servico: 'FWA', meta: '3', categoria: 'venda', stutus: 'Ativo' }, // outro serviço, ignora
    { data: '2026-01-01', cidade: 'NATAL/RN', indicador_geral: 'Vendas Efetivadas', servico: 'FTTH', meta: '50', categoria: 'venda', stutus: 'Ativo' }, // outro indicador, ignora
    { data: '2026-01-01', cidade: 'SOBRAL/CE', indicador_geral: 'Vendas Instaladas', servico: 'FTTH', meta: '80', categoria: 'venda', stutus: 'Inativo' }, // inativo, ignora
  ];
  const { registros, avisos } = normalizarMetasInstalacaoFtth(linhas);
  assert.deepEqual(avisos, []);
  assert.equal(registros.length, 1);
  assert.equal(registros[0].cidadeSlug, 'araripina-pe');
  assert.equal(registros[0].mesRef, '2026-01-01');
  assert.equal(registros[0].meta, 119);
});

test('normalizarMetasInstalacaoFtth avisa (sem quebrar) quando a mesma cidade/mês tem metas divergentes', () => {
  const linhas = [
    { data: '2026-01-01', cidade: 'ARARIPINA/PE', indicador_geral: 'Vendas Instaladas', servico: 'FTTH', meta: '119', categoria: 'venda', stutus: 'Ativo' },
    { data: '2026-01-01', cidade: 'ARARIPINA/PE', indicador_geral: 'Vendas Instaladas', servico: 'FTTH', meta: '200', categoria: 'venda', stutus: 'Ativo' },
  ];
  const { registros, avisos } = normalizarMetasInstalacaoFtth(linhas);
  assert.equal(avisos.length, 1);
  assert.equal(registros.length, 1);
  assert.equal(registros[0].meta, 119); // primeira, não a última
});

test('paraCsvMetasInstalacaoFtth + parsearCsv fazem roundtrip sem perda', () => {
  const { registros } = normalizarMetasInstalacaoFtth([
    { data: '2026-01-01', cidade: 'ARARIPINA/PE', indicador_geral: 'Vendas Instaladas', servico: 'FTTH', meta: '119', categoria: 'venda', stutus: 'Ativo' },
  ]);
  const linhas = parsearCsv(paraCsvMetasInstalacaoFtth(registros));
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].cidade_slug, 'araripina-pe');
  assert.equal(linhas[0].mes_ref, '2026-01-01');
  assert.equal(linhas[0].meta, '119');
});

test('normalizarCidadesOficiais classifica vendeFtth/vende5g/vendeFwa a partir de servico/fwa', () => {
  const linhas = [
    { atuais: 'PEREIRO/CE', cidades: 'PEREIRO/CE', servico: 'FTTH E 5G', fwa: 'VENDENDO' },
    { atuais: 'ACARI/RN', cidades: 'ACARI/RN', servico: '5G ONLY', fwa: 'PENDENTE' },
  ];
  const { registros, avisos } = normalizarCidadesOficiais(linhas);
  assert.deepEqual(avisos, []);
  assert.equal(registros.length, 2);

  const pereiro = registros.find((r) => r.cidadeSlug === 'pereiro-ce');
  assert.equal(pereiro.vendeFtth, true);
  assert.equal(pereiro.vende5g, true);
  assert.equal(pereiro.vendeFwa, true);

  const acari = registros.find((r) => r.cidadeSlug === 'acari-rn');
  assert.equal(acari.vendeFtth, false);
  assert.equal(acari.vende5g, true);
  assert.equal(acari.vendeFwa, false);
});

test('normalizarCidadesOficiais avisa (sem quebrar) em cidade duplicada, mantendo a primeira', () => {
  const linhas = [
    { atuais: 'PEREIRO/CE', cidades: 'PEREIRO/CE', servico: 'FTTH E 5G', fwa: 'VENDENDO' },
    { atuais: 'PEREIRO/CE', cidades: 'PEREIRO/CE', servico: '5G ONLY', fwa: 'PENDENTE' },
  ];
  const { registros, avisos } = normalizarCidadesOficiais(linhas);
  assert.equal(avisos.length, 1);
  assert.equal(registros.length, 1);
  assert.equal(registros[0].vendeFtth, true); // da primeira ocorrencia
});

test('paraCsvCidadesOficiais + parsearCsv fazem roundtrip sem perda', () => {
  const { registros } = normalizarCidadesOficiais([
    { atuais: 'PEREIRO/CE', cidades: 'PEREIRO/CE', servico: 'FTTH E 5G', fwa: 'VENDENDO' },
  ]);
  const linhas = parsearCsv(paraCsvCidadesOficiais(registros));
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].cidade_slug, 'pereiro-ce');
  assert.equal(linhas[0].vende_ftth, 'true');
  assert.equal(linhas[0].vende_5g, 'true');
  assert.equal(linhas[0].vende_fwa, 'true');
});

test('normalizarCidadesOficiais extrai lancamento_comercial quando yyyy-mm-dd válida', () => {
  const linhas = [
    { atuais: 'PEREIRO/CE', cidades: 'PEREIRO/CE', servico: 'FTTH E 5G', fwa: 'VENDENDO', lancamento_comercial: '2023-07-24' },
  ];
  const { registros, avisos } = normalizarCidadesOficiais(linhas);
  assert.deepEqual(avisos, []);
  assert.equal(registros[0].lancamentoComercial, '2023-07-24');
});

test('normalizarCidadesOficiais vira null (com aviso) em lancamento_comercial inválida, e null silencioso quando ausente', () => {
  const linhas = [
    { atuais: 'PEREIRO/CE', cidades: 'PEREIRO/CE', servico: 'FTTH E 5G', fwa: 'VENDENDO', lancamento_comercial: '24/07/2023' },
    { atuais: 'ACARI/RN', cidades: 'ACARI/RN', servico: '5G ONLY', fwa: 'PENDENTE' },
  ];
  const { registros, avisos } = normalizarCidadesOficiais(linhas);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /lancamento_comercial inválida/);

  const pereiro = registros.find((r) => r.cidadeSlug === 'pereiro-ce');
  assert.equal(pereiro.lancamentoComercial, null);
  const acari = registros.find((r) => r.cidadeSlug === 'acari-rn');
  assert.equal(acari.lancamentoComercial, null);
});

test('paraCsvCidadesOficiais + parsearCsv fazem roundtrip de lancamento_comercial sem perda', () => {
  const { registros } = normalizarCidadesOficiais([
    { atuais: 'PEREIRO/CE', cidades: 'PEREIRO/CE', servico: 'FTTH E 5G', fwa: 'VENDENDO', lancamento_comercial: '2023-07-24' },
  ]);
  const linhas = parsearCsv(paraCsvCidadesOficiais(registros));
  assert.equal(linhas[0].lancamento_comercial, '2023-07-24');
});
