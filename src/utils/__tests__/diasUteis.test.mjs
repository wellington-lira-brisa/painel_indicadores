import test from 'node:test';
import assert from 'node:assert/strict';
import { diasUteisNoIntervalo, ratearMetaPorSemanas, construirEstimadorPorCalendario, indexarDiasUteis } from '../diasUteis.js';

// Índice mínimo controlado (não depende do CSV real): janeiro/2026, CE e PE.
// Confirma a regra observada na base: seg-sex útil=1, sáb=0.5 (CE) / 0 (PE),
// dom e feriado=0.
function construirIndiceJaneiro2026() {
  const indice = new Map();
  const diasUteisPorData = {
    '2026-01-01': 0, // feriado (Ano Novo, quinta)
    '2026-01-02': 1, // sexta útil
    '2026-01-03': 0.5, // sábado
    '2026-01-04': 0, // domingo
    '2026-01-05': 1,
    '2026-01-06': 1,
    '2026-01-07': 1,
    '2026-01-08': 1,
    '2026-01-09': 1,
    '2026-01-10': 0.5, // sábado
    '2026-01-11': 0,
  };
  for (const [data, peso] of Object.entries(diasUteisPorData)) {
    indice.set(`CE|${data}`, peso);
    indice.set(`PE|${data}`, data.endsWith('-03') || data.endsWith('-10') ? 0 : peso); // PE: sábado sempre 0
  }
  return indice;
}

test('diasUteisNoIntervalo soma o intervalo correto (semana 1, dias 1-7)', () => {
  const indice = construirIndiceJaneiro2026();
  // CE: 01(feriado,0) + 02(1) + 03(sáb,0.5) + 04(dom,0) + 05,06,07(1 cada) = 4.5
  const { soma, temDiaProjetado } = diasUteisNoIntervalo(indice, 'CE', 2026, 0, 1, 7);
  assert.equal(soma, 4.5);
  assert.equal(temDiaProjetado, false);
});

test('PE conta sábado como 0 (não 0.5) — única exceção observada na base', () => {
  const indice = construirIndiceJaneiro2026();
  const ce = diasUteisNoIntervalo(indice, 'CE', 2026, 0, 8, 11); // 08,09(1)+10(sáb,0.5)+11(dom,0)=2.5
  const pe = diasUteisNoIntervalo(indice, 'PE', 2026, 0, 8, 11); // 08,09(1)+10(sáb,0)+11(dom,0)=2.0
  assert.equal(ce.soma, 2.5);
  assert.equal(pe.soma, 2.0);
});

test('dia ausente sem estimador conta como 0 (nunca inventa 1.0)', () => {
  const indice = construirIndiceJaneiro2026();
  // SE não tem nenhuma linha nesse índice de teste — todo dia cai no fallback 0.
  const { soma, temDiaProjetado } = diasUteisNoIntervalo(indice, 'SE', 2026, 0, 1, 7);
  assert.equal(soma, 0);
  assert.equal(temDiaProjetado, false);
});

test('ratearMetaPorSemanas fecha a soma exatamente com o total mensal', () => {
  const indice = construirIndiceJaneiro2026();
  const semanas = [
    { numero: 1, diaInicio: 1, diaFim: 7 },
    { numero: 2, diaInicio: 8, diaFim: 11 },
  ];
  const resultado = ratearMetaPorSemanas(100, semanas, 'CE', 2026, 0, indice);
  const soma = resultado.reduce((acc, s) => acc + s.valor, 0);
  assert.equal(Math.round(soma * 100) / 100, 100);
});

test('ratearMetaPorSemanas dá mais peso à semana com mais dias úteis', () => {
  const indice = construirIndiceJaneiro2026();
  const semanas = [
    { numero: 1, diaInicio: 1, diaFim: 7 }, // 4.5 dias úteis
    { numero: 2, diaInicio: 8, diaFim: 11 }, // 2.5 dias úteis
  ];
  const [semana1, semana2] = ratearMetaPorSemanas(100, semanas, 'CE', 2026, 0, indice);
  assert.ok(semana1.valor > semana2.valor);
});

test('mês inteiro sem cobertura na base E sem estimador retorna null — nunca 0 inventado', () => {
  const indice = construirIndiceJaneiro2026();
  const semanas = [{ numero: 1, diaInicio: 1, diaFim: 7 }];
  // Maio/2026 (mesIndice 4) não existe no índice de teste (nem no real, ainda).
  const resultado = ratearMetaPorSemanas(100, semanas, 'CE', 2026, 4, indice);
  assert.equal(resultado, null);
});

test('meta nula retorna null (nunca ratear um valor inexistente)', () => {
  const indice = construirIndiceJaneiro2026();
  const semanas = [{ numero: 1, diaInicio: 1, diaFim: 7 }];
  assert.equal(ratearMetaPorSemanas(null, semanas, 'CE', 2026, 0, indice), null);
});

test('cidade sem UF conhecida retorna null', () => {
  const indice = construirIndiceJaneiro2026();
  const semanas = [{ numero: 1, diaInicio: 1, diaFim: 7 }];
  assert.equal(ratearMetaPorSemanas(100, semanas, null, 2026, 0, indice), null);
});

// --- indexarDiasUteis: rastreia a última data (base é ledger, não calendário completo) ---

test('indexarDiasUteis calcula a última data presente, entre UFs diferentes', () => {
  const linhas = [
    { UF: 'CE', data: '2026-07-20', dias_trabalhado: '1' },
    { UF: 'SE', data: '2026-07-21', dias_trabalhado: '1' },
    { UF: 'CE', data: '2026-07-15', dias_trabalhado: '1' },
  ];
  const { ultimaData } = indexarDiasUteis(linhas);
  assert.equal(ultimaData, '2026-07-21');
});

// --- Projeção por calendário: só pra dia FUTURO (depois de ultimaData) ---

test('construirEstimadorPorCalendario: sábado=0.5 no geral, 0 em PE', () => {
  const estimadorCe = construirEstimadorPorCalendario(2026, 'CE');
  const estimadorPe = construirEstimadorPorCalendario(2026, 'PE');
  // 2026-08-01 é sábado.
  assert.equal(estimadorCe(7, 1), 0.5);
  assert.equal(estimadorPe(7, 1), 0);
});

test('construirEstimadorPorCalendario: domingo=0, dia de semana comum=1', () => {
  const estimador = construirEstimadorPorCalendario(2026, 'CE');
  assert.equal(estimador(7, 2), 0); // 2026-08-02, domingo
  assert.equal(estimador(7, 3), 1); // 2026-08-03, segunda
});

test('construirEstimadorPorCalendario: feriado nacional conhecido = 0', () => {
  const estimador = construirEstimadorPorCalendario(2026, 'CE');
  assert.equal(estimador(8, 7), 0); // 2026-09-07, Independência (terça)
});

test('dia FUTURO ausente (depois de ultimaData) vira projeção', () => {
  const indice = new Map([['CE|2026-08-03', 1]]); // só 1 dia real: segunda 03/08
  const estimador = construirEstimadorPorCalendario(2026, 'CE');
  const ultimaData = '2026-08-05'; // base "sabe" até dia 5
  // dia 10 (depois de ultimaData) é futuro de verdade: vira projeção
  const { soma, temDiaProjetado } = diasUteisNoIntervalo(indice, 'CE', 2026, 7, 10, 10, estimador, ultimaData);
  assert.equal(temDiaProjetado, true);
  assert.equal(soma, 1); // segunda-feira comum, sem feriado
});

test('BURACO NO PASSADO (ausente mas <= ultimaData) NUNCA vira projeção — caso real SE/AL', () => {
  const indice = new Map(); // SE sem nenhum registro nesse intervalo
  const estimador = construirEstimadorPorCalendario(2026, 'SE');
  const ultimaData = '2026-07-21'; // base já processou até 21/07 (dia 27/01 já passou)
  // 27/01/2026 é terça-feira comum que falta na base pra SE (achado real da auditoria) —
  // já aconteceu (é <= ultimaData), então NUNCA deve virar "projeção".
  const { soma, temDiaProjetado } = diasUteisNoIntervalo(indice, 'SE', 2026, 0, 27, 27, estimador, ultimaData);
  assert.equal(temDiaProjetado, false);
  assert.equal(soma, 0); // conta como 0, mas sem prometer que vai "chegar"
});

test('ratearMetaPorSemanas: semana 100% real não fica marcada como projeção', () => {
  const indice = new Map();
  for (let dia = 1; dia <= 7; dia += 1) indice.set(`CE|2026-01-0${dia}`, dia === 1 ? 0 : 1);
  const semanas = [{ numero: 1, diaInicio: 1, diaFim: 7 }];
  const [semana1] = ratearMetaPorSemanas(
    100,
    semanas,
    'CE',
    2026,
    0,
    indice,
    construirEstimadorPorCalendario(2026, 'CE'),
    '2026-01-07',
  );
  assert.equal(semana1.projecao, false);
});

test('ratearMetaPorSemanas: mês futuro sem NENHUM dado real vira projeção inteira, mas nunca null', () => {
  const indice = new Map(); // base real vazia pro mês
  const semanas = [
    { numero: 1, diaInicio: 1, diaFim: 7 },
    { numero: 2, diaInicio: 8, diaFim: 14 },
  ];
  const resultado = ratearMetaPorSemanas(
    100,
    semanas,
    'CE',
    2026,
    11,
    indice,
    construirEstimadorPorCalendario(2026, 'CE'),
    '2026-07-21', // base só sabe até julho — dezembro é 100% futuro
  );
  assert.notEqual(resultado, null);
  const soma = resultado.reduce((acc, s) => acc + s.valor, 0);
  assert.equal(Math.round(soma * 100) / 100, 100);
  assert.ok(resultado.every((s) => s.projecao === true));
});

test('ratearMetaPorSemanas: mês passado com buracos (SE/AL) nunca marca projeção, mesmo com estimador disponível', () => {
  const indice = new Map(); // simula SE sem nenhum dia registrado em janeiro (pior caso)
  const semanas = [{ numero: 1, diaInicio: 1, diaFim: 7 }];
  const resultado = ratearMetaPorSemanas(
    100,
    semanas,
    'SE',
    2026,
    0, // janeiro — mês já bem passado
    indice,
    construirEstimadorPorCalendario(2026, 'SE'),
    '2026-07-21',
  );
  // Sem nenhum dado real E sem projeção elegível (tudo no passado) -> peso total 0 -> null.
  assert.equal(resultado, null);
});
