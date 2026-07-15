import { cidadesMock } from '../data/mockCidades';
import { cidadesMock5g } from '../data/mockCidades5g';
import { DEFINICOES_INDICADORES_FTTH, DEFINICOES_INDICADORES_5G, indicadoresVazios } from '../data/mockHelpers';
import { scoreCidade, statusCidade, tendenciaCidade } from '../utils/status';
import { listarStatusFwa } from './fwaService';
import { listarStatusPlanosAtivosPorCidade } from './planoAcaoService';
import {
  carregarBaseReal,
  baseRealEmCacheOuNula,
  aplicarRealizadosReais,
  carregarCanaisDisponiveis as carregarCanaisDisponiveisDaTecnologia,
  carregarIndicePorCanal,
} from './indicadorRealizadoService';
import { carregarMetadadosCidades, metadadosCidadesEmCacheOuNulo } from './cidadeMetadadosService';
import { ehCidadePrioritaria } from '../config/cidadesPrioritarias';

const DEFINICOES_POR_TECNOLOGIA = { ftth: DEFINICOES_INDICADORES_FTTH, '5g': DEFINICOES_INDICADORES_5G };

/**
 * Indicadores realizados (ver INDICADORES_COM_DADO_REAL em
 * indicadorRealizadoService.js) são complementares no mesmo sentido que
 * FWA e plano de ação: uma falha ao buscar a base real não pode derrubar
 * a listagem de cidades. Na falha, reaproveita a última base carregada
 * com sucesso nesta sessão (se houver) — nunca mostra o valor mockado no
 * lugar do real, e nunca deixa de listar as cidades já mockadas.
 */
async function baseRealComFallback(tecnologiaId) {
  try {
    return await carregarBaseReal(tecnologiaId);
  } catch (excecao) {
    console.error(`Falha ao carregar dados reais de ${tecnologiaId}, mantendo última base conhecida:`, excecao);
    return baseRealEmCacheOuNula(tecnologiaId) ?? { indice: null, nomesOriginais: new Map() };
  }
}

/** Mesmo raciocínio do FWA (abaixo) e do plano de ação: metadado de cidade é complementar, nunca pode quebrar o Ranking. */
async function metadadosCidadesComFallback() {
  try {
    return await carregarMetadadosCidades();
  } catch (excecao) {
    console.error('Falha ao carregar metadados de cidade, mantendo última base conhecida:', excecao);
    return metadadosCidadesEmCacheOuNulo() ?? new Map();
  }
}

/**
 * Índice recortado por canal é complementar no mesmo sentido dos outros:
 * se o fetch (pesado, ~40x maior que o total) falhar, não pode derrubar
 * a tela — cai pro índice total (`indiceTotal`), como se nenhum canal
 * tivesse sido selecionado. Diferente do FWA/plano de ação, não guarda
 * "última base conhecida" de propósito: o resultado depende de QUAIS
 * canais estão selecionados agora, então reaproveitar um cache de uma
 * seleção anterior poderia mostrar o recorte errado sem avisar — melhor
 * cair pro total (visivelmente sem filtro) do que isso.
 */
async function indicePorCanalComFallback(tecnologiaId, canaisSelecionados, indiceTotal) {
  if (canaisSelecionados.length === 0) return indiceTotal;
  try {
    return await carregarIndicePorCanal(tecnologiaId, canaisSelecionados);
  } catch (excecao) {
    console.error('Falha ao carregar índice por canal, usando o total (sem filtro de canal):', excecao);
    return indiceTotal;
  }
}


/**
 * FWA é informação complementar: se a consulta falhar (RLS, rede, etc.),
 * a listagem de cidades não pode quebrar por causa dela. Degrada para
 * "nenhuma cidade com FWA configurado" e loga o erro real.
 */
async function statusFwaComFallback() {
  try {
    return await listarStatusFwa();
  } catch (excecao) {
    console.error('Falha ao carregar status de FWA, seguindo sem essa informação:', excecao);
    return {};
  }
}

/** Mesmo raciocínio do FWA: plano de ação é complementar, nunca pode quebrar o Ranking. */
async function statusPlanoAtivoComFallback(tecnologiaId) {
  try {
    return await listarStatusPlanosAtivosPorCidade(tecnologiaId);
  } catch (excecao) {
    console.error('Falha ao carregar status de plano de ação, seguindo sem essa informação:', excecao);
    return {};
  }
}

/**
 * "ARARIPINA / PE" -> { nome: "Araripina/PE", uf: "PE" }. Só formata pra
 * exibição (capitaliza) — o slug usado como `id` já foi calculado antes,
 * em `normalizarCidade()` (src/shared/csvIndicadores.js), na hora de
 * publicar o CSV. Se o texto não vier no formato esperado, devolve como
 * está em vez de quebrar — cidade sem UF reconhecível ainda é melhor
 * exibida do que omitida.
 */
function nomeEUfDoTextoOriginal(cidadeOrigem) {
  const partes = cidadeOrigem.split('/');
  if (partes.length !== 2) return { nome: cidadeOrigem.trim(), uf: null };
  const [nomeBruto, ufBruto] = partes.map((p) => p.trim());
  const nomeCapitalizado = nomeBruto.toLowerCase().replace(/(^|\s)\p{L}/gu, (letra) => letra.toUpperCase());
  return { nome: `${nomeCapitalizado}/${ufBruto.toUpperCase()}`, uf: ufBruto.toUpperCase() };
}

/**
 * Cidade que existe na base real mas nunca foi cadastrada no mock: sem
 * meta, sem gerente/regional/coordenador/data de ativação — tudo `null`,
 * nunca inventado. `enriquecer()` ainda roda por cima dela igual a
 * qualquer outra cidade: `aplicarRealizadosReais` preenche o `realizado`
 * dos indicadores cobertos, e `statusCidade` cai em `'sem-dado'` (não em
 * "Crítico") porque não existe meta pra comparar — ver utils/status.js.
 */
function criarCidadeSintetica(slug, cidadeOrigem, tecnologiaId) {
  const { nome, uf } = nomeEUfDoTextoOriginal(cidadeOrigem);
  return {
    id: slug,
    nome,
    uf,
    gerente: null,
    regional: null,
    coordenadorRegional: null,
    ativacaoComercial: null,
    indicadores: indicadoresVazios(DEFINICOES_POR_TECNOLOGIA[tecnologiaId]),
  };
}

/**
 * Sobrepõe `regional` e `gerente` com o dado real (colunas `gerencia_cidade`
 * e `gerente_cidade` da base), quando mapeado — real é mais confiável e
 * mais atual que o mock, então tem prioridade; cai no mock só quando a
 * base real não tem valor pra essa cidade (`null`, cidade sintética, ou
 * "NÃO MAPEADO" na origem). `coordenacaoRegional` é campo novo, só
 * existe na base real (grupo/território — ex. "FORTALEZA", "CEARA
 * CENTRO") — não confundir com `coordenadorRegional` do mock, que é
 * nome de pessoa; são dois conceitos diferentes, então nenhum sobrescreve
 * o outro.
 */
function aplicarMetadadosCidade(cidade, metadadosCidades) {
  const metadado = metadadosCidades.get(cidade.id);
  return {
    ...cidade,
    regional: metadado?.gerenciaCidade ?? cidade.regional,
    gerente: metadado?.gerenteCidade ?? cidade.gerente,
    coordenacaoRegional: metadado?.coordenacao ?? null,
  };
}

function enriquecer(cidade, statusFwa, statusPlanoAtivo, indiceRealizados, metadadosCidades, tecnologiaId) {
  const cidadeComDadosReais = aplicarRealizadosReais(
    aplicarMetadadosCidade(cidade, metadadosCidades),
    indiceRealizados,
    tecnologiaId,
  );
  return {
    ...cidadeComDadosReais,
    score: scoreCidade(cidadeComDadosReais),
    status: statusCidade(cidadeComDadosReais),
    tendencia: tendenciaCidade(cidadeComDadosReais),
    vendeFwa: statusFwa[cidade.id] ?? false,
    temPlanoAtivo: statusPlanoAtivo[cidade.id] ?? false,
    prioritaria: ehCidadePrioritaria(cidade.id),
  };
}

/**
 * Fábrica de serviço de cidades: recebe o dataset mockado e o id da
 * tecnologia correspondente, devolve o mesmo contrato de 3 funções
 * assíncronas. FWA não depende de tecnologia (é atributo da cidade em si);
 * plano de ação depende — por isso `tecnologiaId` é passado a
 * `listarStatusPlanosAtivosPorCidade`, garantindo que o badge "possui
 * plano" do Ranking do 5G nunca conte um plano de FTTH (e vice-versa).
 *
 * A lista de cidades é a UNIÃO de `cidadesMockDaTecnologia` (cadastradas,
 * com meta/gerente/regional) com as cidades que só existem na base real
 * (`criarCidadeSintetica`, sem meta) — ver RELATORIO.md, "O que continua
 * mockado". `enriquecer` roda igual pras duas: só o `realizado` dos
 * indicadores em INDICADORES_COM_DADO_REAL (indicadorRealizadoService.js)
 * vem da base real; o resto é mock, ou `null` quando não há cadastro.
 */
function criarServicoCidades(cidadesMockDaTecnologia, tecnologiaId) {
  const idsMockados = new Set(cidadesMockDaTecnologia.map((c) => c.id));

  function montarListaCompleta(nomesOriginais) {
    const cidadesSinteticas = [...nomesOriginais.entries()]
      .filter(([slug]) => !idsMockados.has(slug))
      .map(([slug, origem]) => criarCidadeSintetica(slug, origem, tecnologiaId));
    return [...cidadesMockDaTecnologia, ...cidadesSinteticas];
  }

  async function listarCidades(canaisSelecionados = []) {
    const [statusFwa, statusPlanoAtivo, { indice, nomesOriginais }, metadadosCidades] = await Promise.all([
      statusFwaComFallback(),
      statusPlanoAtivoComFallback(tecnologiaId),
      baseRealComFallback(tecnologiaId),
      metadadosCidadesComFallback(),
    ]);
    const indiceEfetivo = await indicePorCanalComFallback(tecnologiaId, canaisSelecionados, indice);
    return montarListaCompleta(nomesOriginais).map((cidade) =>
      enriquecer(cidade, statusFwa, statusPlanoAtivo, indiceEfetivo, metadadosCidades, tecnologiaId),
    );
  }

  async function listarRanking(canaisSelecionados = []) {
    const cidades = await listarCidades(canaisSelecionados);
    // cidade sem score (score null, status 'sem-dado') vai pro fim do
    // ranking — não faz sentido competir por posição num ranking de
    // atingimento sem ter meta pra atingir.
    return [...cidades].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }

  async function buscarCidade(id, canaisSelecionados = []) {
    const [statusFwa, statusPlanoAtivo, { indice, nomesOriginais }, metadadosCidades] = await Promise.all([
      statusFwaComFallback(),
      statusPlanoAtivoComFallback(tecnologiaId),
      baseRealComFallback(tecnologiaId),
      metadadosCidadesComFallback(),
    ]);
    const cidade = montarListaCompleta(nomesOriginais).find((c) => c.id === id);
    if (!cidade) return null;
    const indiceEfetivo = await indicePorCanalComFallback(tecnologiaId, canaisSelecionados, indice);
    return enriquecer(cidade, statusFwa, statusPlanoAtivo, indiceEfetivo, metadadosCidades, tecnologiaId);
  }

  return { listarCidades, listarRanking, buscarCidade, carregarCanaisDisponiveis: () => carregarCanaisDisponiveisDaTecnologia(tecnologiaId) };
}

// Serviço padrão (FTTH) — exports nomeados individuais mantidos por
// compatibilidade: todo import existente (`import { listarCidades, ... }
// from '../services/cidadeService'`) continua funcionando sem mudança.
const servicoFtth = criarServicoCidades(cidadesMock, 'ftth');
export const { listarCidades, listarRanking, buscarCidade, carregarCanaisDisponiveis } = servicoFtth;

/** Mesmo contrato do serviço padrão, operando sobre o dataset e a tecnologia do 5G. */
export const cidadeService5g = criarServicoCidades(cidadesMock5g, '5g');