import test from 'node:test';
import assert from 'node:assert/strict';
import { diasUteisNoIntervalo, ratearMetaPorSemanas } from '../diasUteis.js';

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
  assert.equal(diasUteisNoIntervalo(indice, 'CE', 2026, 0, 1, 7), 4.5);
});

test('PE conta sábado como 0 (não 0.5) — única exceção observada na base', () => {
  const indice = construirIndiceJaneiro2026();
  const ceSemana2 = diasUteisNoIntervalo(indice, 'CE', 2026, 0, 8, 11); // 08,09(1)+10(sáb,0.5)+11(dom,0)=2.5
  const peSemana2 = diasUteisNoIntervalo(indice, 'PE', 2026, 0, 8, 11); // 08,09(1)+10(sáb,0)+11(dom,0)=2.0
  assert.equal(ceSemana2, 2.5);
  assert.equal(peSemana2, 2.0);
});

test('dia ausente no índice conta como 0 (nunca inventa 1.0)', () => {
  const indice = construirIndiceJaneiro2026();
  // SE não tem nenhuma linha nesse índice de teste — todo dia cai no fallback.
  assert.equal(diasUteisNoIntervalo(indice, 'SE', 2026, 0, 1, 7), 0);
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

test('mês inteiro sem cobertura na base retorna null — nunca 0 inventado', () => {
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
