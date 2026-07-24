import { calcularQuintilVendedores, parsearCsv } from '../shared/csvIndicadores';
import {
  MESES_PADRAO_HISTORICO_QUINTIL,
  mesesConsecutivosAte,
  montarHistoricoVendedores,
} from '../utils/historicoQuintil';
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
 * Índice: Map("cidadeSlug|tecnologia" -> registro atual + histórico).
 * O mês corrente continua sendo preferido; na ausência dele, usa o mais
 * recente disponível. O histórico completo fica no mesmo registro, sem
 * nova carga ou consulta.
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
    const atual = doMesAtual ?? registros[registros.length - 1];
    indice.set(chave, { ...atual, historico: registros });
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
      // Vazio ('' do CSV) vira null — mesmo contrato de "sem indicador"
      // usado por calcularQuintilVendedores (5G e a linha-neutra do
      // vendedor ambíguo). String vazia e null nunca podem ser tratados
      // como indicadores DIFERENTES entre si.
      indicador: l.indicador || null,
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

/**
 * Cache simples por chamada de `buscarCidade` (não module-level — nunca
 * deve vazar entre cidades ou sessões). As três funções abaixo
 * (`quintilDaCidadePorCanais`, `vendedoresQuintilDaCidade`,
 * `historicoVendedoresQuintilDaCidade`) recalculavam o MESMO mês atual
 * até 3x quando havia filtro de canal: cada uma chamava
 * `calcularQuintilVendedores` do zero. `criarCacheQuintilVendedores()`
 * cria um cache descartável que o chamador (cidadeService) passa para as
 * três, garantindo no máximo 1 cálculo por (cidade, mês, tecnologia,
 * canais) dentro da mesma requisição.
 */
export function criarCacheQuintilVendedores() {
  return new Map();
}

function calcularQuintilVendedoresCacheado(cache, linhas, tecnologiaId, canaisSelecionados, chaveExtra) {
  const chave = `${chaveExtra}\u0001${tecnologiaId}\u0001${[...canaisSelecionados].sort().join(',')}`;
  if (cache?.has(chave)) return cache.get(chave);
  const resultado = calcularQuintilVendedores(linhas, tecnologiaId, canaisSelecionados);
  if (cache) cache.set(chave, resultado);
  return resultado;
}

export function quintilDaCidadePorCanais(indice, cidadeSlug, tecnologiaId, canaisSelecionados, cache = null) {
  const porMes = indice?.get(cidadeSlug) ?? new Map();
  if (!porMes) return null;

  const hoje = new Date();
  const mesAtualIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const historico = [...porMes.keys()]
    .sort()
    .map((mesRef) => {
      const calculado = calcularQuintilVendedoresCacheado(
        cache,
        porMes.get(mesRef) ?? [],
        tecnologiaId,
        canaisSelecionados,
        cidadeSlug + '\u0001' + mesRef,
      );
      if (!calculado) return null;
      const { vendedores: _vendedores, ...resumo } = calculado;
      return { ...resumo, mesRef };
    })
    .filter(Boolean);

  if (historico.length === 0) return null;
  const atual = historico.find((registro) => registro.mesRef === mesAtualIso) ?? historico.at(-1);
  return { ...atual, historico };
}

export function historicoVendedoresQuintilDaCidade(
  indice,
  cidadeSlug,
  tecnologiaId,
  mesRefAtual,
  canaisSelecionados = [],
  quantidadeMeses = MESES_PADRAO_HISTORICO_QUINTIL,
  cache = null,
) {
  if (!mesRefAtual) {
    return { meses: [], vendedores: [], movimentos: { melhoraram: 0, estaveis: 0, cairam: 0, semComparacao: 0 } };
  }

  const porMes = indice?.get(cidadeSlug) ?? new Map();
  const resultadosPorMes = new Map();
  for (const mesRef of mesesConsecutivosAte(mesRefAtual, quantidadeMeses)) {
    const calculado = calcularQuintilVendedoresCacheado(
      cache,
      porMes.get(mesRef) ?? [],
      tecnologiaId,
      canaisSelecionados,
      cidadeSlug + '\u0001' + mesRef,
    );
    if (calculado) resultadosPorMes.set(mesRef, calculado);
  }

  return montarHistoricoVendedores(resultadosPorMes, mesRefAtual, quantidadeMeses);
}

export function vendedoresQuintilDaCidade(
  indice,
  cidadeSlug,
  tecnologiaId,
  mesRef,
  canaisSelecionados = [],
  cache = null,
) {
  if (!mesRef) return [];
  return (
    calcularQuintilVendedoresCacheado(
      cache,
      indice?.get(cidadeSlug)?.get(mesRef) ?? [],
      tecnologiaId,
      canaisSelecionados,
      cidadeSlug + '\u0001' + mesRef,
    )?.vendedores ?? []
  );
}