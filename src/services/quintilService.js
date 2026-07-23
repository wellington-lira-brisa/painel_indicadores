import { calcularQuintilVendedores, parsearCsv } from '../shared/csvIndicadores';
import { carregarCsvDados } from './dadosProtegidosService';

const NOME_ARQUIVO = 'quintis-por-cidade.csv';
const NOME_ARQUIVO_VENDEDORES = 'quintis-vendedores.csv';

let cache = null; // null = ainda não carregado com sucesso nesta sessão
let cacheVendedores = null;

function paraInteiro(texto) {
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Índice: Map("cidadeSlug|tecnologia" -> registro do mês de referência).
 * O arquivo tem todos os meses; o painel mostra UM quintil por cidade —
 * o do mês corrente quando existir, senão o mês mais recente disponível
 * (cidade que ainda não apurou o mês novo continua mostrando o anterior,
 * com o mês explícito no registro pra UI indicar — nunca um quintil de
 * origem invisível).
 */
function indexarQuintis(linhas) {
  const porChave = new Map(); // "slug|tec" -> lista de registros
  for (const l of linhas) {
    const chave = `${l.cidade_slug}|${l.tecnologia}`;
    if (!porChave.has(chave)) porChave.set(chave, []);
    porChave.get(chave).push({
      mesRef: l.mes_ref,
      totalVendedores: paraInteiro(l.total_vendedores),
      q1: paraInteiro(l.q1),
      q2: paraInteiro(l.q2),
      q3: paraInteiro(l.q3),
      q4: paraInteiro(l.q4),
      q5: paraInteiro(l.q5),
      semMeta: paraInteiro(l.sem_meta),
      atingimentoMedio: Number(l.atingimento_medio),
      quintilCidade: paraInteiro(l.quintil_cidade) || null,
    });
  }

  const hoje = new Date();
  const mesAtualIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;

  const indice = new Map();
  for (const [chave, registros] of porChave) {
    registros.sort((a, b) => (a.mesRef < b.mesRef ? -1 : 1));
    const doMesAtual = registros.find((r) => r.mesRef === mesAtualIso);
    indice.set(chave, doMesAtual ?? registros[registros.length - 1]);
  }
  return indice;
}

export async function carregarQuintis() {
  const texto = await carregarCsvDados(NOME_ARQUIVO);
  const indice = indexarQuintis(parsearCsv(texto));
  cache = indice;
  return indice;
}

export function quintisEmCacheOuNulo() {
  return cache;
}

/** Registro de quintil da cidade na tecnologia, ou null se a cidade não tem dado. */
export function quintilDaCidade(indice, cidadeSlug, tecnologiaId) {
  return indice?.get(`${cidadeSlug}|${tecnologiaId}`) ?? null;
}

function indexarQuintisVendedores(linhas) {
  const indice = new Map();
  for (const l of linhas) {
    if (!l.cidade_slug || !l.mes_ref) continue;
    if (!indice.has(l.cidade_slug)) indice.set(l.cidade_slug, new Map());
    const porMes = indice.get(l.cidade_slug);
    if (!porMes.has(l.mes_ref)) porMes.set(l.mes_ref, []);
    porMes.get(l.mes_ref).push({
      vendedorId: l.vendedor_id || l.vendedor,
      vendedor: l.vendedor || 'Vendedor sem identificação',
      canal: l.canal || null,
      tecnologia: l.tecnologia,
      meta: l.meta,
      realizado: l.realizado,
    });
  }
  return indice;
}

/**
 * Detalhamento carregado na página da cidade e, no Ranking, somente
 * quando há filtro de canal. Sem filtro, o Ranking continua usando apenas
 * o agregado leve.
 */
export async function carregarQuintisVendedores() {
  if (cacheVendedores) return cacheVendedores;
  const texto = await carregarCsvDados(NOME_ARQUIVO_VENDEDORES);
  cacheVendedores = indexarQuintisVendedores(parsearCsv(texto));
  return cacheVendedores;
}

export function quintisVendedoresEmCacheOuNulo() {
  return cacheVendedores;
}

export function quintilDaCidadePorCanais(indice, cidadeSlug, tecnologiaId, canaisSelecionados) {
  const porMes = indice?.get(cidadeSlug);
  if (!porMes) return null;

  const hoje = new Date();
  const mesAtualIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const mesesDesc = [...porMes.keys()].sort((a, b) => (a < b ? 1 : -1));
  const candidatos = [mesAtualIso, ...mesesDesc.filter((mes) => mes !== mesAtualIso)];

  for (const mesRef of candidatos) {
    const calculado = calcularQuintilVendedores(
      porMes.get(mesRef) ?? [],
      tecnologiaId,
      canaisSelecionados,
    );
    if (calculado) return { ...calculado, mesRef };
  }
  return null;
}

export function vendedoresQuintilDaCidade(
  indice,
  cidadeSlug,
  tecnologiaId,
  mesRef,
  canaisSelecionados = [],
) {
  if (!mesRef) return [];
  return (
    calcularQuintilVendedores(
      indice?.get(cidadeSlug)?.get(mesRef) ?? [],
      tecnologiaId,
      canaisSelecionados,
    )?.vendedores ?? []
  );
}