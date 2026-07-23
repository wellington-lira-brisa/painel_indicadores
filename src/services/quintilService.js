import { parsearCsv } from '../shared/csvIndicadores';
import { carregarCsvDados } from './dadosProtegidosService';

const NOME_ARQUIVO = 'quintis-por-cidade.csv';
const NOME_ARQUIVO_VENDEDORES = 'quintis-vendedores.csv';

let cache = null; // null = ainda não carregado com sucesso nesta sessão
let cacheVendedores = null;

function paraInteiro(texto) {
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

function paraNumeroOpcional(texto) {
  if (texto === null || texto === undefined || texto === '') return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
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
    const chave = `${l.cidade_slug}|${l.tecnologia}|${l.mes_ref}`;
    if (!indice.has(chave)) indice.set(chave, []);
    indice.get(chave).push({
      vendedor: l.vendedor || 'Vendedor sem identificação',
      meta: paraNumeroOpcional(l.meta),
      realizado: paraNumeroOpcional(l.realizado),
      atingimento: paraNumeroOpcional(l.atingimento),
      quintil: paraInteiro(l.quintil) || null,
    });
  }

  for (const vendedores of indice.values()) {
    vendedores.sort(
      (a, b) =>
        (a.quintil ?? 99) - (b.quintil ?? 99) ||
        (b.atingimento ?? -1) - (a.atingimento ?? -1) ||
        a.vendedor.localeCompare(b.vendedor, 'pt-BR'),
    );
  }
  return indice;
}

/**
 * Detalhamento carregado somente na página da cidade. O Ranking continua
 * usando apenas o arquivo agregado e não paga o custo desta base.
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

export function vendedoresQuintilDaCidade(indice, cidadeSlug, tecnologiaId, mesRef) {
  if (!mesRef) return [];
  return indice?.get(`${cidadeSlug}|${tecnologiaId}|${mesRef}`) ?? [];
}