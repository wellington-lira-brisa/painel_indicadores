import { parsearCsv } from '../shared/csvIndicadores';
import { carregarCsvDados } from './dadosProtegidosService';

const NOME_ARQUIVO = 'desvio-por-canal.csv';

let cache = null;

function indexarDesvio(linhas) {
  // Map("cidadeSlug|tecnologia" -> lista de {canal, mesRef, meta, realizado, desvio})
  const indice = new Map();
  for (const l of linhas) {
    const chave = `${l.cidade_slug}|${l.tecnologia}`;
    if (!indice.has(chave)) indice.set(chave, []);
    indice.get(chave).push({
      canal: l.canal,
      mesRef: l.mes_ref,
      meta: Number(l.meta),
      realizado: Number(l.realizado),
      desvio: Number(l.desvio),
    });
  }
  return indice;
}

export async function carregarDesvioPorCanal() {
  const texto = await carregarCsvDados(NOME_ARQUIVO);
  const indice = indexarDesvio(parsearCsv(texto));
  cache = indice;
  return indice;
}

export function desvioPorCanalEmCacheOuNulo() {
  return cache;
}

/**
 * Retorna os registros de desvio de uma cidade na tecnologia, agrupados em
 * dois conjuntos: `mesAtual` (só o mês corrente) e `acumulado` (todos os
 * meses do ano, somados por canal). Devolve null se a cidade não tem dado.
 */
export function desvioDaCidade(indice, cidadeSlug, tecnologiaId) {
  const registros = indice?.get(`${cidadeSlug}|${tecnologiaId}`);
  if (!registros?.length) return null;

  const hoje = new Date();
  const mesAtualIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;

  // Mês atual: registros do mês corrente por canal
  const mesAtual = registros
    .filter((r) => r.mesRef === mesAtualIso)
    .sort((a, b) => a.desvio - b.desvio); // ordena do maior déficit ao maior superávit

  // Acumulado: soma por canal em todos os meses do ano
  const porCanal = new Map();
  for (const r of registros) {
    const atual = porCanal.get(r.canal) ?? { canal: r.canal, meta: 0, realizado: 0, desvio: 0 };
    atual.meta += r.meta;
    atual.realizado += r.realizado;
    atual.desvio += r.desvio;
    porCanal.set(r.canal, atual);
  }
  const acumulado = [...porCanal.values()]
    .map((r) => ({ ...r, meta: Math.round(r.meta * 100) / 100, realizado: Math.round(r.realizado * 100) / 100, desvio: Math.round(r.desvio * 100) / 100 }))
    .sort((a, b) => a.desvio - b.desvio);

  return { mesAtual, acumulado };
}