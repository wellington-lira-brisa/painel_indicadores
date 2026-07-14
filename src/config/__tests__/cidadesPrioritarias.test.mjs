import test from 'node:test';
import assert from 'node:assert/strict';
import { SLUGS_CIDADES_PRIORITARIAS, ehCidadePrioritaria } from '../cidadesPrioritarias.js';

test('gera exatamente 78 slugs (lista enviada por José Amorim), sem duplicata por normalização', () => {
  assert.equal(SLUGS_CIDADES_PRIORITARIAS.size, 78);
});

test('reconhece slug conhecido da lista', () => {
  assert.ok(ehCidadePrioritaria('araripina-pe'));
  assert.ok(ehCidadePrioritaria('maceio-al'));
  // grafia sem apóstrofo da base real (ver comentário no arquivo de config)
  assert.ok(ehCidadePrioritaria('olho-dagua-das-flores-al'));
});

test('não reconhece cidade fora da lista', () => {
  assert.equal(ehCidadePrioritaria('fortaleza-ce'), false);
  assert.equal(ehCidadePrioritaria('cidade-inexistente-xx'), false);
});