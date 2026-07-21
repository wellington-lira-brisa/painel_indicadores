import { parsearCsv } from '../shared/csvIndicadores';
import { carregarCsvDados } from './dadosProtegidosService';

// Arquivo separado de `indicadores-realizados.csv` de propósito: é 1
// linha por cidade (gerência/gerente/coordenação), não 1 por
// indicador/semana — ver `normalizarMetadadosCidade` em
// src/shared/csvIndicadores.js e scripts/etl/gerarBase.mjs.
const NOME_ARQUIVO = 'cidades-metadados.csv';

/** Trata string vazia como "sem dado", pra não sobrescrever o mock com "". */
function paraNuloSeVazio(texto) {
  return texto === '' || texto === undefined ? null : texto;
}

/** cidadeSlug -> { gerenciaCidade, gerenteCidade, coordenacao } (cada campo `null` se não mapeado na base real). */
function indexarMetadadosPorCidade(linhas) {
  const indice = new Map();
  for (const l of linhas) {
    if (!l.cidade_slug) continue;
    indice.set(l.cidade_slug, {
      gerenciaCidade: paraNuloSeVazio(l.gerencia_cidade),
      gerenteCidade: paraNuloSeVazio(l.gerente_cidade),
      coordenacao: paraNuloSeVazio(l.coordenacao),
    });
  }
  return indice;
}

// Mesmo raciocínio de cache do indicadorRealizadoService.js: 1 fetch por
// sessão, `null` = ainda não carregado com sucesso.
let cache = null;

/**
 * Busca (ou reaproveita do cache) o índice de metadados de cidade.
 * `cache: 'no-store'` porque o arquivo é reescrito pelo workflow a
 * qualquer momento — mesmo raciocínio do `indicadorRealizadoService.js`.
 */
export async function carregarMetadadosCidades() {
  const texto = await carregarCsvDados(NOME_ARQUIVO);
  const indice = indexarMetadadosPorCidade(parsearCsv(texto));
  cache = indice;
  return indice;
}

export function metadadosCidadesEmCacheOuNulo() {
  return cache;
}