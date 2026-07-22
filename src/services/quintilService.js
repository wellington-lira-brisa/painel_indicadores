import { parsearCsv } from '../shared/csvIndicadores';
import { carregarCsvDados } from './dadosProtegidosService';

const NOME_ARQUIVO = 'quintis-por-cidade.csv';

let cache = null; // null = ainda não carregado com sucesso nesta sessão

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