import { supabase } from "./supabaseClient";
import { tratarErro } from "./supabaseHelpers";
import {
  validarCamposSensiveis,
  mensagemBloqueioSensivel,
} from "../utils/validacaoConteudoSensivel";
import {
  normalizarStatusPlano,
  statusPlanoValido,
  STATUS_PLANO,
} from "../utils/statusPlano";
import { linkGoogleMaps } from "../utils/geolocalizacao";

/**
 * Status que contam como "plano de ação ativo" pro indicador do Ranking.
 * `concluido` fica de fora: um plano concluído já terminou — se a cidade
 * segue crítica, ela precisa de um plano novo, não faz sentido mostrar
 * como coberta por um que já encerrou. `parado` também fica de fora: é uma
 * ação estagnada, sinal de atenção, não de cobertura.
 */
const STATUS_PLANO_ATIVO = [
  STATUS_PLANO.NAO_INICIADO,
  STATUS_PLANO.EM_ANDAMENTO,
  STATUS_PLANO.AGUARDANDO,
];

/**
 * Mapa { [cidadeId]: boolean } indicando se a cidade tem pelo menos um
 * plano de ação ativo NAQUELA TECNOLOGIA. Uma única consulta pra todas as
 * cidades de uma vez — mesma estratégia de `listarStatusFwa` em
 * fwaService.js — evita 1 consulta por cidade no Ranking. `tecnologiaId` é
 * obrigatório: um plano de FTTH não pode contar como cobertura na tela do
 * 5G, mesmo sendo a mesma cidade. Escala automaticamente: cidade, plano ou
 * tecnologia novos aparecem no próximo carregamento, sem mudança de código.
 */
export async function listarStatusPlanosAtivosPorCidade(tecnologiaId) {
  if (!tecnologiaId) throw new Error("Tecnologia é obrigatória.");

  const { data, error } = await supabase
    .from("planos_acao")
    .select("cidade_id, status")
    .eq("tecnologia_id", tecnologiaId);
  tratarErro(error, "Não foi possível carregar o status dos planos de ação.");

  const ativoPorCidade = {};
  data.forEach((linha) => {
    if (STATUS_PLANO_ATIVO.includes(normalizarStatusPlano(linha.status))) {
      ativoPorCidade[linha.cidade_id] = true;
    }
  });
  return ativoPorCidade;
}

const BUCKET = "plano-evidencias";
const VALIDADE_URL_ASSINADA_SEGUNDOS = 300; // 5 min — suficiente pra visualizar a página, sem URL permanente
const EXTENSAO_POR_TIPO = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

// Mesmos limites das constraints CHECK da migration 20260708120000 — se um
// mudar, o outro precisa acompanhar.
export const LIMITE_O_QUE = 300;
export const LIMITE_COMO = 4000;
export const LIMITE_QUEM = 200;

// Listagens nunca precisam do path/metadados da imagem — só o detalhe exibe
// evidência e EXIF. Buscar isso na lista é over-fetch (jsonb pode ser grande).
// `tem_evidencias` é a exceção: é um boolean barato (mantido por trigger,
// ver migration 20260710120000), não uma imagem — cabe na lista porque é
// exatamente o que a listagem precisa pra sinalizar "evidência pendente"
// sem fazer join nenhum com planos_acao_evidencias.
const COLUNAS_PLANO_LISTA =
  "id, cidade_id, tecnologia_id, indicador_id, criado_por, descricao, o_que, como, quem, quando_previsto, status, tem_evidencias, criado_em, atualizado_em, " +
  "classificacao_no_momento, periodo_referencia_fim, canal, " +
  "colaboradores!criado_por(nome, matricula, cargo)";
const COLUNAS_PLANO_DETALHE =
  `${COLUNAS_PLANO_LISTA}, imagem_path, imagem_metadados, evidencia_latitude, evidencia_longitude, ` +
  "evidencia_precisao_metros, evidencia_endereco, evidencia_numero, evidencia_bairro, evidencia_cidade, " +
  "evidencia_estado, evidencia_cep, evidencia_pais, evidencia_capturada_em, indicadores_motivadores, " +
  "planos_acao_evidencias(id, imagem_path, imagem_metadados, ordem, criado_em, localizacao_id), " +
  "planos_acao_evidencia_localizacoes(id, latitude, longitude, precisao_metros, endereco, numero, bairro, cidade, estado, cep, pais, capturada_em)";

/**
 * Converte a linha do Postgres (snake_case) para o formato usado pelos
 * componentes. `evidencias` unifica dois formatos possíveis: planos novos
 * têm linhas em `planos_acao_evidencias` (0..N); planos criados antes desta
 * funcionalidade têm só as colunas legadas `imagem_path`/`imagem_metadados`
 * (0..1). Os componentes (galeria, lightbox) sempre leem `evidencias` — não
 * precisam saber qual dos dois formatos originou o dado.
 */
function mapearPlano(linha) {
  if (!linha) return null;

  // Histórico de localizações — 1 por lote de anexação (ver migration
  // 20260710130000), mais antiga primeiro: é a ordem que a tela usa pra
  // empilhar (nova localização aparece embaixo das anteriores).
  const localizacoesRelacionadas =
    linha.planos_acao_evidencia_localizacoes ?? [];
  const localizacoesEvidencia = [...localizacoesRelacionadas]
    .sort((a, b) => new Date(a.capturada_em) - new Date(b.capturada_em))
    .map((l) => mapearLocalizacao(l));

  const localizacaoPorId = Object.fromEntries(
    localizacoesEvidencia.map((l) => [l.id, l]),
  );

  const evidenciasRelacionadas = linha.planos_acao_evidencias ?? [];
  const evidencias =
    evidenciasRelacionadas.length > 0
      ? [...evidenciasRelacionadas]
          .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
          .map((e) => ({
            id: e.id,
            imagemPath: e.imagem_path,
            metadados: e.imagem_metadados ?? null,
            criadoEm: e.criado_em ?? linha.criado_em,
            // Localização do LOTE em que essa evidência específica foi
            // anexada — não necessariamente a mais recente do plano.
            // Evidências legadas (localizacao_id null) caem no fallback
            // abaixo (colunas legadas de planos_acao).
            localizacaoEvidencia: localizacaoPorId[e.localizacao_id] ?? null,
          }))
      : linha.imagem_path
        ? [
            {
              id: null,
              imagemPath: linha.imagem_path,
              metadados: linha.imagem_metadados ?? null,
              criadoEm: linha.criado_em,
              localizacaoEvidencia: null,
            },
          ]
        : [];

  // Fallback pras colunas legadas (evidencia_latitude etc. em planos_acao)
  // — cobre planos gravados antes da migration 20260710130000 existir, ou
  // um ambiente onde ela ainda não rodou. Nunca é a fonte principal pra
  // planos novos: esses já têm tudo em `localizacoesEvidencia`.
  const localizacaoLegada =
    linha.evidencia_latitude != null && linha.evidencia_longitude != null
      ? mapearLocalizacao({
          id: null,
          latitude: linha.evidencia_latitude,
          longitude: linha.evidencia_longitude,
          precisao_metros: linha.evidencia_precisao_metros,
          endereco: linha.evidencia_endereco,
          numero: linha.evidencia_numero,
          bairro: linha.evidencia_bairro,
          cidade: linha.evidencia_cidade,
          estado: linha.evidencia_estado,
          cep: linha.evidencia_cep,
          pais: linha.evidencia_pais,
          capturada_em: linha.evidencia_capturada_em,
        })
      : null;

  return {
    id: linha.id,
    cidadeId: linha.cidade_id,
    tecnologiaId: linha.tecnologia_id,
    indicadorId: linha.indicador_id,
    criadoPorId: linha.criado_por,
    // Planos legados (anteriores à versão estruturada) só têm `descricao`.
    // Planos novos só têm os 4 campos — descricao fica null pra eles.
    descricao: linha.descricao,
    oQue: linha.o_que,
    como: linha.como,
    quem: linha.quem,
    quandoPrevisto: linha.quando_previsto,
    estruturado: Boolean(
      linha.o_que || linha.como || linha.quem || linha.quando_previsto,
    ),
    // Normalizado no client como segunda rede de segurança — a migration
    // 20260708130000 já reescreve valores legados no banco, mas o front
    // não deve quebrar caso rode contra um ambiente sem a migration ainda.
    status: normalizarStatusPlano(linha.status),
    evidencias,
    // `tem_evidencias` vem pronto do banco (mantido por trigger — ver
    // migration 20260710120000); o fallback em `evidencias.length` só
    // cobre o caso defensivo de rodar contra um ambiente sem essa
    // migration ainda, mesmo padrão já usado em `status` acima.
    temEvidencias: linha.tem_evidencias ?? evidencias.length > 0,
    // Histórico completo — mais antiga primeiro. É o que a tela do plano
    // usa pra listar "uma localização por anexação".
    localizacoesEvidencia:
      localizacoesEvidencia.length > 0
        ? localizacoesEvidencia
        : localizacaoLegada
          ? [localizacaoLegada]
          : [],
    // Mantido por retrocompatibilidade com qualquer trecho que ainda
    // espere UMA localização (a mais recente) em vez do histórico —
    // sempre deriva do mesmo dado, nunca uma fonte própria.
    localizacaoEvidencia: localizacoesEvidencia.at(-1) ?? localizacaoLegada,
    criadoPor: linha.colaboradores,
    criadoEm: linha.criado_em,
    atualizadoEm: linha.atualizado_em,
    // Contexto de criação (snapshot imutável — ver migration
    // 20260720120000). `null` pra todo plano criado antes dessa
    // migration existir; não dá pra reconstruir contexto histórico que
    // nunca foi gravado.
    classificacaoNoMomento: linha.classificacao_no_momento ?? null,
    periodoReferenciaFim: linha.periodo_referencia_fim ?? null,
    indicadoresMotivadores: linha.indicadores_motivadores ?? null,
    // Canal ao qual o plano se refere — null = geral da cidade, não
    // afeta visibilidade (aparece na tela da cidade independente do
    // filtro de canal ativo), é só rótulo.
    canal: linha.canal ?? null,
  };
}

/** Formata uma linha de planos_acao_evidencia_localizacoes (ou o fallback legado) pro formato usado pelos componentes. */
function mapearLocalizacao(l) {
  return {
    id: l.id,
    latitude: l.latitude,
    longitude: l.longitude,
    precisaoMetros: l.precisao_metros ?? null,
    endereco: l.endereco ?? null,
    numero: l.numero ?? null,
    bairro: l.bairro ?? null,
    cidade: l.cidade ?? null,
    estado: l.estado ?? null,
    cep: l.cep ?? null,
    pais: l.pais ?? null,
    capturadaEm: l.capturada_em ?? null,
    // Derivado, nunca vem do banco — ver comentário em linkGoogleMaps.
    linkGoogleMaps: linkGoogleMaps(l.latitude, l.longitude),
  };
}

const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Rótulo usado em validarCamposSensiveis -> chave do campo no formulário.
// Só existe porque o detector genérico trabalha com rótulos de exibição
// (pensados pra mensagem), não com nomes de campo — esta é a única ponte
// entre os dois vocabulários, mantida num único lugar.
const ROTULO_SENSIVEL_PARA_CAMPO = {
  "O quê": "oQue",
  Como: "como",
  Quem: "quem",
};

function validarTextoCurto(errosPorCampo, chave, valorBruto, rotulo, limite) {
  const texto = String(valorBruto ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!texto) {
    errosPorCampo[chave] = `${rotulo} é obrigatório.`;
    return null;
  }
  if (texto.length > limite) {
    errosPorCampo[chave] = `${rotulo} não pode passar de ${limite} caracteres.`;
    return null;
  }
  return texto;
}

function validarData(errosPorCampo, chave, valorBruto) {
  const valor = String(valorBruto ?? "").trim();
  if (!valor || !PADRAO_DATA.test(valor)) {
    errosPorCampo[chave] =
      "Quando é obrigatório — informe a data prevista para execução.";
    return null;
  }
  return valor;
}

/**
 * Valida os 4 campos estruturados SEM lançar exceção — acumula um erro por
 * campo (obrigatoriedade OU dado sensível, o que for encontrado primeiro
 * pra aquele campo) e devolve tudo de uma vez. É o que permite a UI
 * destacar exatamente qual campo precisa de correção, em vez de uma
 * mensagem genérica só.
 *
 * Dado sensível só é verificado nos campos que já passaram na
 * obrigatoriedade — não faz sentido escanear campo vazio, e evita
 * sobrescrever o erro de obrigatoriedade de um campo com o de conteúdo.
 *
 * @returns {{ valido: boolean, errosPorCampo: Record<string,string>,
 *   valores: { oQue: string, como: string, quem: string, quandoPrevisto: string } | null }}
 */
export function validarCamposPlanoDetalhado({
  oQue,
  como,
  quem,
  quandoPrevisto,
}) {
  const errosPorCampo = {};

  const oQueValido = validarTextoCurto(
    errosPorCampo,
    "oQue",
    oQue,
    "O quê",
    LIMITE_O_QUE,
  );
  const comoValido = validarTextoCurto(
    errosPorCampo,
    "como",
    como,
    "Como",
    LIMITE_COMO,
  );
  const quemValido = validarTextoCurto(
    errosPorCampo,
    "quem",
    quem,
    "Quem",
    LIMITE_QUEM,
  );
  const quandoValido = validarData(
    errosPorCampo,
    "quandoPrevisto",
    quandoPrevisto,
  );

  const candidatosSensiveis = {};
  if (oQueValido) candidatosSensiveis["O quê"] = oQueValido;
  if (comoValido) candidatosSensiveis.Como = comoValido;
  if (quemValido) candidatosSensiveis.Quem = quemValido;

  const { ocorrencias } = validarCamposSensiveis(candidatosSensiveis);
  ocorrencias.forEach(({ rotulo }) => {
    const campo = ROTULO_SENSIVEL_PARA_CAMPO[rotulo];
    // Não citamos o tipo (CPF, RG, cartão...) na mensagem — ver comentário
    // em mensagemBloqueioSensivel sobre por que isso é deliberado.
    if (campo)
      errosPorCampo[campo] =
        "Este campo pode conter dados pessoais ou sensíveis. Revise o conteúdo antes de salvar.";
  });

  const valido = Object.keys(errosPorCampo).length === 0;
  return {
    valido,
    errosPorCampo,
    valores: valido
      ? {
          oQue: oQueValido,
          como: comoValido,
          quem: quemValido,
          quandoPrevisto: quandoValido,
        }
      : null,
  };
}

/**
 * Versão que lança — usada internamente pelo service antes de gravar no
 * Supabase (criarPlano/atualizarPlano). Casca fina sobre
 * `validarCamposPlanoDetalhado`: nenhuma regra é duplicada, só o formato
 * da resposta muda (exceção com a primeira mensagem, em vez de mapa por
 * campo). O client já deveria ter barrado antes de chegar aqui — isto é
 * a segunda camada, não a primeira.
 */
export function validarCamposPlano(dados) {
  const { valido, errosPorCampo, valores } = validarCamposPlanoDetalhado(dados);
  if (!valido) throw new Error(Object.values(errosPorCampo)[0]);
  return valores;
}

/** Gera signed URL por evidência, só quando necessário — nunca na listagem, só no detalhe. */
async function comSignedUrls(plano) {
  if (!plano || plano.evidencias.length === 0) return plano;

  const evidenciasComUrl = await Promise.all(
    plano.evidencias.map(async (evidencia) => {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(evidencia.imagemPath, VALIDADE_URL_ASSINADA_SEGUNDOS);
      return { ...evidencia, imagemUrl: data?.signedUrl ?? null };
    }),
  );

  return { ...plano, evidencias: evidenciasComUrl };
}

/** Lista paginada — nunca carrega a tabela inteira. */
/**
 * Listagem global (tela de gestão de planos, `/planos`) — cruza todas as
 * tecnologias por padrão, já que é uma visão administrativa geral.
 * `tecnologiaId` é opcional aqui (diferente de `listarPlanosPorCidade`,
 * onde é obrigatório) justamente porque essa tela precisa enxergar tudo.
 */
export async function listarPlanos({ limite = 100, tecnologiaId } = {}) {
  let consulta = supabase
    .from("planos_acao")
    .select(COLUNAS_PLANO_LISTA)
    .order("criado_em", { ascending: false })
    .range(0, limite - 1);

  if (tecnologiaId) consulta = consulta.eq("tecnologia_id", tecnologiaId);

  const { data, error } = await consulta;

  tratarErro(error, "Não foi possível carregar os planos de ação.");
  return data.map(mapearPlano);
}

/**
 * Planos de uma cidade NUMA tecnologia específica. `tecnologiaId` é
 * obrigatório: sem ele, um plano de FTTH apareceria na tela do 5G da mesma
 * cidade (e vice-versa) — exatamente o bug que motivou essa separação.
 */
export async function listarPlanosPorCidade(cidadeId, tecnologiaId) {
  if (!tecnologiaId) throw new Error("Tecnologia é obrigatória.");

  const { data, error } = await supabase
    .from("planos_acao")
    .select(COLUNAS_PLANO_LISTA)
    .eq("cidade_id", cidadeId)
    .eq("tecnologia_id", tecnologiaId)
    .order("criado_em", { ascending: false });

  tratarErro(
    error,
    "Não foi possível carregar os planos de ação desta cidade.",
  );
  return data.map(mapearPlano);
}

export async function buscarPlano(id) {
  const { data, error } = await supabase
    .from("planos_acao")
    .select(COLUNAS_PLANO_DETALHE)
    .eq("id", id)
    .maybeSingle();

  tratarErro(error, "Não foi possível carregar o plano de ação.");
  return comSignedUrls(mapearPlano(data));
}

/**
 * Localização é obrigatória sempre que houver ao menos uma evidência
 * anexada. Função pura e exportada pra ser a MESMA regra usada no client
 * (FormularioPlanoAcao, antes de habilitar o botão salvar) e no service
 * (criarPlano, como segunda camada antes de sequer tentar o upload) — a
 * fonte de verdade real continua sendo a RPC no banco
 * (criar_plano_com_evidencias), que aplica isso de novo,
 * independentemente do que o client mandar.
 */
export function localizacaoEvidenciaObrigatoria(
  quantidadeImagens,
  localizacaoEvidencia,
) {
  return quantidadeImagens > 0 && !localizacaoEvidencia;
}

/**
 * @param {{ cidadeId: string, tecnologiaId: string, indicadorId?: string,
 *   oQue: string, como: string, quem: string, quandoPrevisto: string,
 *   criadoPorId: string,
 *   classificacaoNoMomento: 'vermelho'|'amarelo'|'verde'|'sem-dado',
 *   periodoReferenciaFim: string,
 *   indicadoresMotivadores: Array<{ indicadorId: string, nome: string, meta: number|null, realizado: number|null, atingimento: number|null, status: string }>,
 *   canal?: string,
 *   imagens: Array<{ blob: Blob, metadados: object }>,
 *   localizacaoEvidencia: { latitude: number, longitude: number, precisaoMetros?: number, endereco?: string, capturadaEm?: string } | null,
 * }} dados
 */
export async function criarPlano(dados) {
  const { oQue, como, quem, quandoPrevisto } = validarCamposPlano(dados);

  if (!dados.cidadeId || !dados.criadoPorId) {
    throw new Error("Cidade e usuário autenticado são obrigatórios.");
  }
  if (!dados.tecnologiaId) {
    throw new Error("Tecnologia é obrigatória.");
  }
  // Contexto de criação (ver migration 20260720120000) é obrigatório pra
  // todo plano NOVO — é o que torna possível, no futuro, comparar "estava
  // crítica quando o plano nasceu" com "está crítica agora". Não dá pra
  // inferir depois; se o form não mandou, é bug no form, não algo pra
  // silenciosamente aceitar como null.
  if (!dados.classificacaoNoMomento) {
    throw new Error(
      "Classificação da cidade no momento da criação é obrigatória.",
    );
  }
  if (!dados.periodoReferenciaFim) {
    throw new Error("Período de referência é obrigatório.");
  }
  if (!dados.indicadoresMotivadores) {
    throw new Error("Indicadores que motivaram a criação são obrigatórios.");
  }

  const imagens = dados.imagens ?? [];
  if (
    localizacaoEvidenciaObrigatoria(imagens.length, dados.localizacaoEvidencia)
  ) {
    throw new Error("Localização é obrigatória quando há evidências anexadas.");
  }

  const id = crypto.randomUUID();
  const caminhosEnviados = [];

  try {
    const evidenciasParaRpc = [];
    for (let indice = 0; indice < imagens.length; indice += 1) {
      const { blob, metadados } = imagens[indice];
      const extensao = EXTENSAO_POR_TIPO[blob.type];
      if (!extensao) {
        // imagemUpload.js sempre re-encoda pra um dos tipos do mapa; blob fora
        // dele significa bypass do pipeline de imagem — rejeitar, não adivinhar.
        throw new Error("Tipo de imagem não suportado.");
      }
      const caminho = `${dados.criadoPorId}/${id}-${indice}.${extensao}`;

      const inicioUpload = performance.now();
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET)
        .upload(caminho, blob, { contentType: blob.type });
      if (erroUpload)
        throw new Error("Falha ao enviar uma das imagens. Tente novamente.");

      caminhosEnviados.push(caminho);
      evidenciasParaRpc.push({
        imagem_path: caminho,
        imagem_metadados: metadados
          ? {
              ...metadados,
              tempoUploadMs: Math.round(performance.now() - inicioUpload),
            }
          : null,
        ordem: indice,
      });
    }

    // Plano + evidências + localização são criados numa única transação no
    // banco (ver criar_plano_com_evidencias na migration 20260709130000) —
    // é lá, não aqui, que a regra "localização obrigatória com evidência"
    // realmente é garantida, mesmo que este service tenha um bug ou seja
    // contornado por outra via de escrita no futuro.
    const { error: erroRpc } = await supabase.rpc(
      "criar_plano_com_evidencias",
      {
        p_id: id,
        p_cidade_id: dados.cidadeId,
        p_tecnologia_id: dados.tecnologiaId,
        p_indicador_id: dados.indicadorId ?? null,
        p_o_que: oQue,
        p_como: como,
        p_quem: quem,
        p_quando_previsto: quandoPrevisto,
        p_classificacao_no_momento: dados.classificacaoNoMomento,
        p_periodo_referencia_fim: dados.periodoReferenciaFim,
        p_indicadores_motivadores: dados.indicadoresMotivadores,
        p_canal: dados.canal ?? null,
        p_evidencias: evidenciasParaRpc,
        p_evidencia_latitude: dados.localizacaoEvidencia?.latitude ?? null,
        p_evidencia_longitude: dados.localizacaoEvidencia?.longitude ?? null,
        p_evidencia_precisao_metros:
          dados.localizacaoEvidencia?.precisaoMetros ?? null,
        p_evidencia_endereco: dados.localizacaoEvidencia?.endereco ?? null,
        p_evidencia_capturada_em:
          dados.localizacaoEvidencia?.capturadaEm ?? null,
        p_evidencia_numero: dados.localizacaoEvidencia?.numero ?? null,
        p_evidencia_bairro: dados.localizacaoEvidencia?.bairro ?? null,
        p_evidencia_cidade: dados.localizacaoEvidencia?.cidade ?? null,
        p_evidencia_estado: dados.localizacaoEvidencia?.estado ?? null,
        p_evidencia_cep: dados.localizacaoEvidencia?.cep ?? null,
        p_evidencia_pais: dados.localizacaoEvidencia?.pais ?? null,
      },
    );

    if (erroRpc)
      throw new Error(
        erroRpc.message || "Não foi possível salvar o plano de ação.",
      );

    return await buscarPlano(id);
  } catch (excecao) {
    // Evita imagens órfãs no Storage se algo falhar depois do upload.
    if (caminhosEnviados.length > 0)
      await supabase.storage.from(BUCKET).remove(caminhosEnviados);
    throw excecao;
  }
}

const LIMITE_DESCRICAO_LEGADO = 8000;

/**
 * Anexa evidências a um plano JÁ EXISTENTE — o novo caminho de escrita
 * (ver migration 20260710120000), separado de `criarPlano` de propósito:
 * são operações diferentes (uma cria o plano, a outra só adiciona
 * evidência a um plano que já existe), então funções diferentes, cada uma
 * com sua própria responsabilidade — mistura-las forçaria `criarPlano` a
 * aceitar um `planoId` opcional e ramificar por dentro, mais confuso que
 * duas funções pequenas e diretas.
 *
 * Upload de imagem + rollback em caso de falha seguem exatamente o mesmo
 * padrão de `criarPlano`: imagens vão pro Storage primeiro; se a RPC
 * falhar depois, os arquivos já enviados são removidos, pra não sobrar
 * imagem órfã apontando pra um plano sem o registro da evidência.
 *
 * @param {string} planoId
 * @param {{ criadoPorId: string, imagens: Array<{ blob: Blob, metadados: object }>,
 *   localizacaoEvidencia: { latitude: number, longitude: number, precisaoMetros?: number,
 *     endereco?: string, numero?: string, bairro?: string, cidade?: string, estado?: string,
 *     cep?: string, pais?: string, capturadaEm?: string } }} dados
 */
export async function anexarEvidenciasPlano(planoId, dados) {
  if (!planoId) throw new Error("Plano é obrigatório.");

  const imagens = dados.imagens ?? [];
  if (imagens.length === 0)
    throw new Error("Selecione ao menos uma imagem para anexar.");
  if (
    localizacaoEvidenciaObrigatoria(imagens.length, dados.localizacaoEvidencia)
  ) {
    throw new Error("Localização é obrigatória quando há evidências anexadas.");
  }
  if (!dados.criadoPorId) throw new Error("Usuário autenticado é obrigatório.");

  const caminhosEnviados = [];

  try {
    const evidenciasParaRpc = [];
    for (let indice = 0; indice < imagens.length; indice += 1) {
      const { blob, metadados } = imagens[indice];
      const extensao = EXTENSAO_POR_TIPO[blob.type];
      if (!extensao) {
        // imagemUpload.js sempre re-encoda pra um dos tipos do mapa; blob fora
        // dele significa bypass do pipeline de imagem — rejeitar, não adivinhar.
        throw new Error("Tipo de imagem não suportado.");
      }
      // Prefixo com o próprio planoId (não só criadoPorId-timestamp) pra
      // ficar óbvio, só olhando o path no Storage, a quais evidências de
      // qual plano cada arquivo pertence — útil pra auditoria manual.
      const caminho = `${dados.criadoPorId}/${planoId}-${Date.now()}-${indice}.${extensao}`;

      const inicioUpload = performance.now();
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET)
        .upload(caminho, blob, { contentType: blob.type });
      if (erroUpload)
        throw new Error("Falha ao enviar uma das imagens. Tente novamente.");

      caminhosEnviados.push(caminho);
      evidenciasParaRpc.push({
        imagem_path: caminho,
        imagem_metadados: metadados
          ? {
              ...metadados,
              tempoUploadMs: Math.round(performance.now() - inicioUpload),
            }
          : null,
      });
    }

    const { error: erroRpc } = await supabase.rpc("anexar_evidencias_plano", {
      p_plano_id: planoId,
      p_evidencias: evidenciasParaRpc,
      p_evidencia_latitude: dados.localizacaoEvidencia?.latitude ?? null,
      p_evidencia_longitude: dados.localizacaoEvidencia?.longitude ?? null,
      p_evidencia_precisao_metros:
        dados.localizacaoEvidencia?.precisaoMetros ?? null,
      p_evidencia_endereco: dados.localizacaoEvidencia?.endereco ?? null,
      p_evidencia_numero: dados.localizacaoEvidencia?.numero ?? null,
      p_evidencia_bairro: dados.localizacaoEvidencia?.bairro ?? null,
      p_evidencia_cidade: dados.localizacaoEvidencia?.cidade ?? null,
      p_evidencia_estado: dados.localizacaoEvidencia?.estado ?? null,
      p_evidencia_cep: dados.localizacaoEvidencia?.cep ?? null,
      p_evidencia_pais: dados.localizacaoEvidencia?.pais ?? null,
      p_evidencia_capturada_em: dados.localizacaoEvidencia?.capturadaEm ?? null,
    });

    if (erroRpc)
      throw new Error(
        erroRpc.message || "Não foi possível anexar as evidências.",
      );

    return await buscarPlano(planoId);
  } catch (excecao) {
    if (caminhosEnviados.length > 0)
      await supabase.storage.from(BUCKET).remove(caminhosEnviados);
    throw excecao;
  }
}

/** Validação do campo livre legado — só usada ao editar planos criados antes da versão estruturada. */
function validarDescricaoLegado(valorBruto) {
  const descricao = String(valorBruto ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!descricao) throw new Error("Descrição do plano é obrigatória.");
  if (descricao.length > LIMITE_DESCRICAO_LEGADO) {
    throw new Error(
      `A descrição não pode passar de ${LIMITE_DESCRICAO_LEGADO} caracteres.`,
    );
  }

  const { valido, ocorrencias } = validarCamposSensiveis({
    Descrição: descricao,
  });
  if (!valido) throw new Error(mensagemBloqueioSensivel(ocorrencias));

  return descricao;
}

/** Recarrega o plano após uma RPC de escrita — RPCs de update retornam void por design (ver migration 20260708140000). */
async function buscarESincronizarPlano(planoId) {
  const { data, error } = await supabase
    .from("planos_acao")
    .select(COLUNAS_PLANO_DETALHE)
    .eq("id", planoId)
    .single();

  tratarErro(
    error,
    "Alteração salva, mas não foi possível recarregar o plano atualizado.",
  );
  return comSignedUrls(mapearPlano(data));
}

/**
 * Edição do plano. RLS decide quem pode (criador ou editar_plano_acao) —
 * front não precisa replicar essa regra, só refletir o resultado.
 * imagem/cidade não são editáveis aqui de propósito: mudar evidência ou
 * cidade de um plano já registrado é operação diferente, fora do escopo
 * desta função.
 *
 * Planos estruturados (o_que/como/quem/quando_previsto) editam os 4 campos;
 * planos legados (só `descricao`, criados antes desta versão) continuam
 * editando o texto livre — não força migração retroativa de conteúdo.
 *
 * Passa por RPC (não `.update()` direto) porque a trigger de histórico
 * (migration 20260708140000) lê o motivo de uma GUC de transação — as duas
 * coisas (setar o motivo e fazer o UPDATE) precisam estar na mesma
 * chamada/transação, o que só a RPC garante.
 *
 * @param {string} planoId
 * @param {object} dados - campos estruturados OU { descricao }, mais `motivo` opcional
 */
export async function atualizarPlano(planoId, dados) {
  if (!planoId) throw new Error("Plano é obrigatório.");

  const ehEdicaoEstruturada = ["oQue", "como", "quem", "quandoPrevisto"].some(
    (chave) => chave in dados,
  );
  const motivo = String(dados.motivo ?? "").trim() || null;

  let erroRpc;
  if (ehEdicaoEstruturada) {
    const { oQue, como, quem, quandoPrevisto } = validarCamposPlano(dados);
    ({ error: erroRpc } = await supabase.rpc("atualizar_plano_estruturado", {
      p_plano_id: planoId,
      p_o_que: oQue,
      p_como: como,
      p_quem: quem,
      p_quando_previsto: quandoPrevisto,
      p_motivo: motivo,
    }));
  } else {
    const descricaoValidada = validarDescricaoLegado(dados.descricao);
    ({ error: erroRpc } = await supabase.rpc("atualizar_plano_legado", {
      p_plano_id: planoId,
      p_descricao: descricaoValidada,
      p_motivo: motivo,
    }));
  }

  tratarErro(erroRpc, "Não foi possível salvar as alterações do plano.");
  return buscarESincronizarPlano(planoId);
}

/**
 * Troca só o status do plano — ação independente da edição de conteúdo.
 * Mesma RPC-com-motivo do restante do plano; `motivo` é opcional aqui
 * porque a troca de status é uma ação rápida (sem tela de confirmação
 * própria) — quem quiser justificar, usa o fluxo de edição de conteúdo,
 * que já tem espaço reservado pra isso.
 */
export async function atualizarStatusPlano(planoId, status, motivo = null) {
  if (!planoId) throw new Error("Plano é obrigatório.");
  if (!statusPlanoValido(status)) throw new Error("Status inválido.");

  const { error } = await supabase.rpc("atualizar_status_plano", {
    p_plano_id: planoId,
    p_status: status,
    p_motivo: motivo,
  });

  tratarErro(error, "Não foi possível atualizar o status do plano.");
  return buscarESincronizarPlano(planoId);
}

/**
 * Exclusão definitiva. Ordem importa: apaga a linha do banco primeiro
 * (protegida por RLS/permissão) — se falhar aí, nada foi tocado no
 * Storage. Se o Storage falhar depois, sobra um arquivo órfão (inofensivo,
 * inacessível pela UI), preferível a um registro quebrado no app.
 */
export async function excluirPlano(plano) {
  if (!plano?.id) throw new Error("Plano inválido.");

  const { error } = await supabase
    .from("planos_acao")
    .delete()
    .eq("id", plano.id);
  tratarErro(error, "Não foi possível excluir o plano de ação.");

  const caminhos = (plano.evidencias ?? [])
    .map((evidencia) => evidencia.imagemPath)
    .filter(Boolean);
  if (caminhos.length > 0) {
    const { error: erroStorage } = await supabase.storage
      .from(BUCKET)
      .remove(caminhos);
    if (erroStorage) {
      console.error(
        "Plano excluído, mas uma ou mais imagens de evidência não foram removidas do Storage:",
        erroStorage,
      );
    }
  }
}