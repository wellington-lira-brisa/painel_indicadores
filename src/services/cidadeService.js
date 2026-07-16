import { DEFINICOES_INDICADORES_FTTH, DEFINICOES_INDICADORES_5G, indicadoresVazios } from '../data/mockHelpers';
import { scoreCidade, statusCidade } from '../utils/status';
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
import { carregarMetasInstalacaoFtth, metasInstalacaoFtthEmCacheOuNulo } from './metaInstalacaoFtthService';
import { carregarMetasAtivacao5g, metasAtivacao5gEmCacheOuNulo } from './metaAtivacao5gService';
import { carregarCidadesOficiais, cidadesOficiaisEmCacheOuNulo } from './cidadesOficiaisService';
import { ehCidadePrioritaria } from '../config/cidadesPrioritarias';

const DEFINICOES_POR_TECNOLOGIA = { ftth: DEFINICOES_INDICADORES_FTTH, '5g': DEFINICOES_INDICADORES_5G };

// Meta Geral da Cidade: qual indicador recebe o valor de metas-instalacao-ftth.csv/
// metas-ativacao-5g.csv, por tecnologia — ver aplicarMetaGeralCidade() abaixo.
const INDICADOR_META_GERAL_POR_TECNOLOGIA = { ftth: 'instalacao', '5g': 'ativacao' };

/**
 * Indicadores realizados (ver INDICADORES_COM_DADO_REAL em
 * indicadorRealizadoService.js) são complementares no mesmo sentido que
 * FWA e plano de ação: uma falha ao buscar a base real não pode derrubar
 * a listagem de cidades. Na falha, reaproveita a última base carregada
 * com sucesso nesta sessão (se houver) — sem isso a cidade fica sem
 * `realizado` (`null`, exibido como "—"), nunca some da lista.
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
 * Meta Geral da Cidade é informação complementar no mesmo sentido dos
 * outros: FTTH lê de metas-instalacao-ftth.csv, 5G de
 * metas-ativacao-5g.csv (mesmo arquivo de origem, dois normalizadores —
 * ver csvIndicadores.js). Falha no fetch cai pro cache da sessão, e na
 * ausência dele, mapa vazio (cidade fica sem meta esse ciclo — `null`,
 * exibido como "—" — nunca inventada). Só o VALOR da meta, não decide
 * quais cidades aparecem — isso é `cidadesOficiaisComFallback`, abaixo.
 */
async function metaGeralCidadeComFallback(tecnologiaId) {
  const carregar = tecnologiaId === 'ftth' ? carregarMetasInstalacaoFtth : carregarMetasAtivacao5g;
  const emCacheOuNulo = tecnologiaId === 'ftth' ? metasInstalacaoFtthEmCacheOuNulo : metasAtivacao5gEmCacheOuNulo;
  try {
    return await carregar();
  } catch (excecao) {
    console.error(`Falha ao carregar Meta Geral da Cidade (${tecnologiaId}), mantendo última base conhecida:`, excecao);
    return emCacheOuNulo() ?? new Map();
  }
}

/**
 * Lista oficial de cidades (FTTH/5G/FWA) — define ESCOPO do Ranking (ver
 * `montarListaCompleta`, abaixo). Falha no fetch cai pro cache da sessão;
 * na ausência dele, mapa vazio — nesse caso `montarListaCompleta` degrada
 * pra lista ampla (toda cidade com dado na base de vendas) em vez de
 * mostrar 0 cidades, mesmo raciocínio de `indicePorCanalComFallback`.
 */
async function cidadesOficiaisComFallback() {
  try {
    return await carregarCidadesOficiais();
  } catch (excecao) {
    console.error('Falha ao carregar lista de cidades oficiais, mantendo última base conhecida:', excecao);
    return cidadesOficiaisEmCacheOuNulo() ?? new Map();
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
 * Monta uma cidade a partir só do que existe na base real (nome/UF, mais
 * o slug já calculado em `normalizarCidade()` — src/shared/csvIndicadores.js)
 * e da data de ativação comercial já resolvida por `montarListaCompleta()`
 * (vem de `cidades-oficiais.csv`, coluna `lancamento_comercial` — `null`
 * quando a cidade não está na lista oficial, ou na lista de fallback,
 * quando o fetch falhou e não há cache). Tudo mais que não tem fonte real
 * ainda nasce `null` — nunca inventado — e é exibido como "—" pelos
 * formatters (ver utils/format.js). `enriquecer()` roda por cima disso:
 * `aplicarMetadadosCidade` preenche gerente/regional/coordenação quando
 * mapeados, `aplicarMetaGeralCidade` preenche a Meta Geral da Cidade
 * quando existe, `aplicarRealizadosReais` preenche o `realizado` dos
 * indicadores cobertos. O que nenhuma dessas fontes cobre (ex.: meta de
 * Orçamento/Efetivado) continua `null`, e `statusCidade` cai em
 * `'sem-dado'` (não em "Crítico") porque não existe meta pra comparar —
 * ver utils/status.js.
 */
function criarCidadeSintetica(slug, cidadeOrigem, tecnologiaId, ativacaoComercial = null) {
  const { nome, uf } = nomeEUfDoTextoOriginal(cidadeOrigem);
  return {
    id: slug,
    nome,
    uf,
    gerente: null,
    regional: null,
    coordenadorRegional: null,
    ativacaoComercial,
    indicadores: indicadoresVazios(DEFINICOES_POR_TECNOLOGIA[tecnologiaId]),
  };
}

/**
 * Aplica `regional` e `gerente` com o dado real (colunas `gerencia_cidade`
 * e `gerente_cidade` da base), quando mapeado; fica `null` (exibido como
 * "—") quando a base não tem valor pra essa cidade ou marca "NÃO MAPEADO"
 * na origem. `coordenacaoRegional` é o grupo/território (ex.: "FORTALEZA",
 * "CEARA CENTRO") — conceito diferente de "quem coordena", que hoje não
 * tem fonte de dado nenhuma.
 */
function aplicarMetadadosCidade(cidade, metadadosCidades) {
  const metadado = metadadosCidades.get(cidade.id);
  return {
    ...cidade,
    regional: metadado?.gerenciaCidade ?? null,
    gerente: metadado?.gerenteCidade ?? null,
    coordenacaoRegional: metadado?.coordenacao ?? null,
  };
}

/**
 * Preenche a Meta Geral da Cidade (`ind.meses[].meta`) com o dado real de
 * Instalação (FTTH), quando existe pra essa cidade/mês — continua `null`
 * (exibido como "—") pra quem não está coberto por esse arquivo ainda. É
 * essa troca que faz "Meta (vendas)"/"Atingimento Geral" no Ranking sair
 * de "Sem meta" pra um número real — ver resumoMetaRealizado() em
 * TabelaRanking.jsx. Alimenta score/atingimento e o Ranking; NUNCA a Meta
 * do Indicador (`ind.meses[].metaIndicador`) exibida na tabela da cidade
 * — essa é conceito à parte e ainda não tem fonte própria (ver
 * indicadoresVazios() em mockHelpers.js).
 */
/**
 * Preenche a Meta Geral da Cidade (`ind.meses[].meta`) com o dado real —
 * Instalação no FTTH, Ativação no 5G (`INDICADOR_META_GERAL_POR_TECNOLOGIA`,
 * topo do arquivo) — quando existe pra essa cidade/mês; continua `null`
 * (exibido como "—") pra quem não está coberto pelo arquivo de metas
 * ainda. É essa troca que faz "Meta (vendas)"/"Atingimento Geral" no
 * Ranking sair de "Sem meta" pra um número real — ver
 * resumoMetaRealizado() em TabelaRanking.jsx. Alimenta score/atingimento
 * e o Ranking; NUNCA a Meta do Indicador (`ind.meses[].metaIndicador`)
 * exibida na tabela da cidade — essa é conceito à parte e ainda não tem
 * fonte própria (ver indicadoresVazios() em mockHelpers.js).
 */
function aplicarMetaGeralCidade(cidade, metasCidadeTodas, tecnologiaId) {
  const idIndicadorMeta = INDICADOR_META_GERAL_POR_TECNOLOGIA[tecnologiaId];
  const metasCidade = metasCidadeTodas.get(cidade.id);
  if (!idIndicadorMeta || !metasCidade) return cidade;

  return {
    ...cidade,
    indicadores: cidade.indicadores.map((ind) => {
      if (ind.id !== idIndicadorMeta) return ind;
      return {
        ...ind,
        meses: ind.meses.map((m, mesIndex) => {
          const metaReal = metasCidade.metas.get(mesIndex);
          return metaReal !== undefined ? { ...m, meta: metaReal } : m;
        }),
      };
    }),
  };
}

function enriquecer(cidade, statusFwa, statusPlanoAtivo, indiceRealizados, metadadosCidades, metaGeralCidade, tecnologiaId) {
  const cidadeComDadosReais = aplicarRealizadosReais(
    aplicarMetaGeralCidade(aplicarMetadadosCidade(cidade, metadadosCidades), metaGeralCidade, tecnologiaId),
    indiceRealizados,
    tecnologiaId,
  );
  return {
    ...cidadeComDadosReais,
    score: scoreCidade(cidadeComDadosReais),
    status: statusCidade(cidadeComDadosReais),
    vendeFwa: statusFwa[cidade.id] ?? false,
    temPlanoAtivo: statusPlanoAtivo[cidade.id] ?? false,
    prioritaria: ehCidadePrioritaria(cidade.id),
  };
}

/**
 * Fábrica de serviço de cidades: recebe o id da tecnologia, devolve o
 * mesmo contrato de funções assíncronas. FWA não depende de tecnologia (é
 * atributo da cidade em si); plano de ação depende — por isso
 * `tecnologiaId` é passado a `listarStatusPlanosAtivosPorCidade`,
 * garantindo que o badge "possui plano" do Ranking do 5G nunca conte um
 * plano de FTTH (e vice-versa).
 *
 * **Escopo de cidades vem da lista oficial (`cidadesOficiais`), pras duas
 * tecnologias** — não da base de vendas. A base de vendas sozinha tem
 * ~920 cidades no FTTH (a maioria só com Orçamento/Efetivado, funil que
 * nunca virou venda) e passava de mil no 5G (incluindo cidade errada por
 * erro de digitação, fora da área de operação) — confirmado com o time
 * de negócio que a lista de quem realmente vende é a
 * `base_mesa_performace_ATUAL.csv` (`vende_ftth`/`vende_5g` por cidade).
 * A base de metas (`metaGeralCidade`) continua existindo, mas só pro
 * VALOR da Meta Geral (Instalação no FTTH, Ativação no 5G) — não decide
 * mais quais cidades aparecem.
 *
 * `enriquecer()` aplica por cima o que cada fonte real cobre hoje
 * (gerência/gerente/coordenação, Meta Geral da Cidade, realizado); o
 * que nenhuma fonte cobre fica `null`, exibido como "—".
 */
function criarServicoCidades(tecnologiaId) {
  function montarListaCompleta(nomesOriginais, cidadesOficiais) {
    const chaveVende = tecnologiaId === 'ftth' ? 'vendeFtth' : 'vende5g';
    const cidadesDoEscopo = [...cidadesOficiais.entries()].filter(([, c]) => c[chaveVende]);

    if (cidadesDoEscopo.length > 0) {
      return cidadesDoEscopo.map(([slug, { cidadeOrigem, lancamentoComercial }]) =>
        criarCidadeSintetica(slug, cidadeOrigem, tecnologiaId, lancamentoComercial),
      );
    }
    // Lista oficial vazia (fetch falhou e não há cache) — mostrar a lista
    // ampla (sem escopo) é mais seguro que mostrar 0 cidades.
    return [...nomesOriginais.entries()].map(([slug, origem]) => criarCidadeSintetica(slug, origem, tecnologiaId));
  }

  async function listarCidades(canaisSelecionados = []) {
    const [statusFwa, statusPlanoAtivo, { indice, nomesOriginais }, metadadosCidades, metaGeralCidade, cidadesOficiais] =
      await Promise.all([
        statusFwaComFallback(),
        statusPlanoAtivoComFallback(tecnologiaId),
        baseRealComFallback(tecnologiaId),
        metadadosCidadesComFallback(),
        metaGeralCidadeComFallback(tecnologiaId),
        cidadesOficiaisComFallback(),
      ]);
    const indiceEfetivo = await indicePorCanalComFallback(tecnologiaId, canaisSelecionados, indice);
    return montarListaCompleta(nomesOriginais, cidadesOficiais).map((cidade) =>
      enriquecer(cidade, statusFwa, statusPlanoAtivo, indiceEfetivo, metadadosCidades, metaGeralCidade, tecnologiaId),
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
    const [statusFwa, statusPlanoAtivo, { indice, nomesOriginais }, metadadosCidades, metaGeralCidade, cidadesOficiais] =
      await Promise.all([
        statusFwaComFallback(),
        statusPlanoAtivoComFallback(tecnologiaId),
        baseRealComFallback(tecnologiaId),
        metadadosCidadesComFallback(),
        metaGeralCidadeComFallback(tecnologiaId),
        cidadesOficiaisComFallback(),
      ]);
    const cidade = montarListaCompleta(nomesOriginais, cidadesOficiais).find((c) => c.id === id);
    if (!cidade) return null;
    const indiceEfetivo = await indicePorCanalComFallback(tecnologiaId, canaisSelecionados, indice);
    return enriquecer(cidade, statusFwa, statusPlanoAtivo, indiceEfetivo, metadadosCidades, metaGeralCidade, tecnologiaId);
  }

  return { listarCidades, listarRanking, buscarCidade, carregarCanaisDisponiveis: () => carregarCanaisDisponiveisDaTecnologia(tecnologiaId) };
}

// Serviço padrão (FTTH) — exports nomeados individuais mantidos por
// compatibilidade: todo import existente (`import { listarCidades, ... }
// from '../services/cidadeService'`) continua funcionando sem mudança.
const servicoFtth = criarServicoCidades('ftth');
export const { listarCidades, listarRanking, buscarCidade, carregarCanaisDisponiveis } = servicoFtth;

/** Mesmo contrato do serviço padrão, operando sobre a tecnologia 5G. */
export const cidadeService5g = criarServicoCidades('5g');