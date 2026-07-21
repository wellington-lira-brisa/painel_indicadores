import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTextoBusca } from '../textoBusca.js';

test('remove acentos: busca sem acento encontra nome acentuado', () => {
  assert.ok(normalizarTextoBusca('São Gonçalo').includes(normalizarTextoBusca('sao goncalo')));
});

test('remove acentos no sentido inverso: busca acentuada encontra base sem acento', () => {
  assert.ok(normalizarTextoBusca('Sao Goncalo').includes(normalizarTextoBusca('São Gonçalo')));
});

test('iguala caixa', () => {
  assert.equal(normalizarTextoBusca('FORTALEZA'), normalizarTextoBusca('fortaleza'));
});

test('remove espaços das bordas e colapsa espaços internos', () => {
  assert.equal(normalizarTextoBusca('  São  Paulo  '), 'sao paulo');
});

test('não cria falso positivo com espaço no meio do termo', () => {
  assert.ok(!normalizarTextoBusca('Fortaleza').includes(normalizarTextoBusca('forta leza')));
});

test('entrada nula/indefinida vira string vazia, nunca lança', () => {
  assert.equal(normalizarTextoBusca(null), '');
  assert.equal(normalizarTextoBusca(undefined), '');
});

test('preserva caracteres não alfabéticos relevantes (barra de UF, hífen)', () => {
  assert.equal(normalizarTextoBusca('Araripina/PE'), 'araripina/pe');
  assert.equal(normalizarTextoBusca('Juazeiro-BA'), 'juazeiro-ba');
});
