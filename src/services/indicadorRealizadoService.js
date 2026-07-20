import { parsearCsv } from '../shared/csvIndicadores';
import { ANO_PAINEL } from '../data/mockHelpers';

// Enquanto não existe uma API real, a base fica versionada no próprio
// repositório e é publicada como arquivo estático pelo workflow
// (.github/workflows/atualizar-base.yml -> scripts/etl/gerarBase.mjs).
// `fetch` funciona igual em dev (servido pelo Vite a partir de `public/`)
// e em produção (GitHub Pages, mesmo `deploy.yml` de sempre).
//
// TROCA FUTURA PRA API: esta é a ÚNICA função que precisa mudar. Troque o
// corpo de `buscarLinhasCru` por uma chamada à API devolvendo a mesma
// lista de objetos `{ cidade_slug, cidade_origem, indicador_id, mes_ref, semana_mes, valor }`
// — todo o resto deste arquivo (indexação, cache, aplicação sobre a
// cidade) continua igual, e `cidadeService.js` nem precisa saber que a
// fonte mudou.
// import.meta.env.BASE_URL já vem com o `base` configurado em
// vite.config.js (necessário pro GitHub Pages, que serve o site numa
// subpasta) e termina com "/" — não hardcodar "/dados/..." direto, senão
// quebra em qualquer ambiente que não sirva o site na raiz do domínio.
const CAMINHO_CSV = `${import.meta.env.BASE_URL}dados/indicadores-realizados.csv`;

// Arquivo separado, ~40x maior que o total (ver normalizarPorCanal() em
// csvIndicadores.js) — só é buscado quando o filtro de canal é usado
// (ver linhasPorCanalComCache abaixo), nunca no carregamento padrão do
// Ranking/detalhe de cidade.
const CAMINHO_CSV_POR_CANAL = `${import.meta.env.BASE_URL}dados/indicadores-realizados-por-canal.csv`;

// Único conjunto de indicadores que a base real hoje sustenta, por
// tecnologia (ver RELATORIO.md, seção 5). Qualquer indicador fora daqui
// (meta — e toda a metainformação de
// cidade: gerente, regional, coordenador, ativação comercial) continua
// vindo do mock (ou fica `null`, pra cidade sem cadastro) até existir uma
// fonte real pra ele. Este arquivo nunca decide inventar um valor pra
// fechar essa lacuna.
const INDICADORES_COM_DADO_REAL = {
  ftth: ['orcamento', 'efetivado', 'instalacao'],
  '5g': ['ativacao'],
};

/** 'YYYY-MM-DD' -> índice 0-based do mês (jan=0), só quando o ano bate com ANO_PAINEL. `null` caso contrário. */
function indiceDoMesNoAnoDoPainel(mesRefIso) {
  const ano = Number(mesRefIso.slice(0, 4));
  if (ano !== ANO_PAINEL) return null;
  return Number(mesRefIso.slice(5, 7)) - 1;
}

/**
 * Busca e faz parsing do CSV publicado. `cache: 'no-store'` porque o
 * arquivo pode ser atualizado a qualquer momento pelo workflow — deixar o
 * navegador cachear geraria a mesma dessincronia que um dado "meio
 * atualizado" causaria num banco.
 */
async function buscarLinhasCru(tecnologia) {
  const resposta = await fetch(CAMINHO_CSV, { cache: 'no-store' });
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar ${CAMINHO_CSV} (HTTP ${resposta.status}).`);
  }
  const texto = await resposta.text();
  const todasAsLinhas = parsearCsv(texto);
  return todasAsLinhas.filter((l) => l.tecnologia === tecnologia);
}

/** '2026-07-05' -> 5. Usado pra extrair só o dia-do-mês das datas reais de semana (mesmo mês do mes_ref, sempre seguro fatiar assim). */
function diaDoMes(dataIso) {
  if (!dataIso) return null;
  return Number(dataIso.slice(8, 10));
}

/** cidadeSlug -> indicadorId -> { meses: Map(mesIndex->valor), semanas: Map(mesIndex->Map(numeroSemana->{valor, diaInicio, diaFim})) } */
function indexarValoresPorCidade(linhas) {
  const indice = new Map();
  for (const l of linhas) {
    if (!l.cidade_slug) continue; // sem cidade mapeada: não há como exibir por cidade (fica só auditável no CSV)
    if (!indice.has(l.cidade_slug)) indice.set(l.cidade_slug, new Map());
    const porIndicador = indice.get(l.cidade_slug);
    if (!porIndicador.has(l.indicador_id)) {
      porIndicador.set(l.indicador_id, { meses: new Map(), semanas: new Map() });
    }
    const registro = porIndicador.get(l.indicador_id);
    const mesIndex = indiceDoMesNoAnoDoPainel(l.mes_ref);
    if (mesIndex === null) continue; // ano fora do painel atual (ver comentário de indiceDoMesNoAnoDoPainel)
    const valor = Number(l.valor);
    if (l.semana_mes === '') {
      registro.meses.set(mesIndex, valor);
    } else {
      const numeroSemana = Number(l.semana_mes);
      if (!registro.semanas.has(mesIndex)) registro.semanas.set(mesIndex, new Map());
      // diaInicio/diaFim vêm de primeiro_dia_semana/ultimo_dia_semana da
      // base — NÃO dos blocos fixos de 7 dias que utils/semanas.js gera
      // pra semana fictícia. É essa troca que corrige o rótulo da coluna
      // de semana no front (ver RELATORIO.md, diagnóstico da divergência
      // de datas de semana).
      registro.semanas.get(mesIndex).set(numeroSemana, {
        valor,
        diaInicio: diaDoMes(l.primeiro_dia_semana),
        diaFim: diaDoMes(l.ultimo_dia_semana),
      });
    }
  }
  return indice;
}

/** cidadeSlug -> texto cru da cidade como veio na base ("ARARIPINA / PE"), primeira ocorrência. */
function indexarNomesOriginais(linhas) {
  const nomes = new Map();
  for (const l of linhas) {
    if (l.cidade_slug && !nomes.has(l.cidade_slug)) nomes.set(l.cidade_slug, l.cidade_origem);
  }
  return nomes;
}

/**
 * Mesmo formato de `indexarValoresPorCidade`, mas SOMA valores repetidos
 * pra mesma chave em vez de sobrescrever. O arquivo total (1 linha por
 * cidade/indicador/mês) nunca tem chave repetida, então lá sobrescrever
 * ou somar dá no mesmo — mas aqui a entrada já vem filtrada por um
 * subconjunto de canais, e pode haver mais de uma linha (um canal cada)
 * pra mesma cidade/indicador/mês: sobrescrever perderia todos os canais
 * menos o último.
 */
function indexarValoresPorCidadeSomando(linhas) {
  const indice = new Map();
  for (const l of linhas) {
    if (!l.cidade_slug) continue;
    if (!indice.has(l.cidade_slug)) indice.set(l.cidade_slug, new Map());
    const porIndicador = indice.get(l.cidade_slug);
    if (!porIndicador.has(l.indicador_id)) {
      porIndicador.set(l.indicador_id, { meses: new Map(), semanas: new Map() });
    }
    const registro = porIndicador.get(l.indicador_id);
    const mesIndex = indiceDoMesNoAnoDoPainel(l.mes_ref);
    if (mesIndex === null) continue;
    const valor = Number(l.valor);
    if (l.semana_mes === '') {
      registro.meses.set(mesIndex, (registro.meses.get(mesIndex) ?? 0) + valor);
    } else {
      const numeroSemana = Number(l.semana_mes);
      if (!registro.semanas.has(mesIndex)) registro.semanas.set(mesIndex, new Map());
      const semanas = registro.semanas.get(mesIndex);
      const anterior = semanas.get(numeroSemana);
      semanas.set(numeroSemana, {
        valor: (anterior?.valor ?? 0) + valor,
        // diaInicio/diaFim são os mesmos em qualquer canal daquela
        // semana (é a mesma semana civil) — só precisa do primeiro valor.
        diaInicio: anterior?.diaInicio ?? diaDoMes(l.primeiro_dia_semana),
        diaFim: anterior?.diaFim ?? diaDoMes(l.ultimo_dia_semana),
      });
    }
  }
  return indice;
}

async function buscarLinhasCruPorCanal(tecnologia) {
  const resposta = await fetch(CAMINHO_CSV_POR_CANAL, { cache: 'no-store' });
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar ${CAMINHO_CSV_POR_CANAL} (HTTP ${resposta.status}).`);
  }
  const texto = await resposta.text();
  const todasAsLinhas = parsearCsv(texto);
  return todasAsLinhas.filter((l) => l.tecnologia === tecnologia);
}

// Cache separado do total (`cachePorTecnologia`, abaixo): 1 fetch do
// arquivo pesado por tecnologia por sessão, e só acontece na primeira
// vez que o filtro de canal é usado (abrir o seletor ou aplicar o
// filtro) — nunca no carregamento padrão do Ranking.
const cachePorCanalPorTecnologia = new Map();

async function linhasPorCanalComCache(tecnologia) {
  if (!cachePorCanalPorTecnologia.has(tecnologia)) {
    cachePorCanalPorTecnologia.set(tecnologia, await buscarLinhasCruPorCanal(tecnologia));
  }
  return cachePorCanalPorTecnologia.get(tecnologia);
}

/**
 * Lista de canais distintos disponíveis pra uma tecnologia — popula o
 * seletor de canal. Dispara o fetch pesado na primeira chamada da
 * sessão; chamadas seguintes (qualquer tela, qualquer cidade) reaproveitam
 * o cache em memória.
 */
export async function carregarCanaisDisponiveis(tecnologia) {
  const linhas = await linhasPorCanalComCache(tecnologia);
  return [...new Set(linhas.map((l) => l.canal))].sort((a, b) => a.localeCompare(b));
}

/**
 * Índice de realizado (mesmo formato de `carregarBaseReal().indice`)
 * recalculado só com os canais selecionados — é o que alimenta
 * `aplicarRealizadosReais` quando o filtro de canal está ativo, tanto no
 * Ranking quanto no detalhe da cidade (mesma função, mesmo formato de
 * saída — nenhum dos dois precisa saber que a fonte mudou).
 *
 * `canaisSelecionados` vazio nunca deveria chegar aqui — nesse caso o
 * chamador (cidadeService.js) deve usar o índice total normal, que é mais
 * leve. Devolve índice vazio em vez de quebrar, por segurança.
 */
export async function carregarIndicePorCanal(tecnologia, canaisSelecionados) {
  if (canaisSelecionados.length === 0) return new Map();
  const todasAsLinhas = await linhasPorCanalComCache(tecnologia);
  const selecionados = new Set(canaisSelecionados);
  return indexarValoresPorCidadeSomando(todasAsLinhas.filter((l) => selecionados.has(l.canal)));
}

// Cache em memória por tecnologia, só pra não refazer o fetch a cada card
// renderizado na mesma sessão. `null` = ainda não carregado com sucesso
// nesta sessão (ver `aplicarRealizadosReais`: nesse estado os indicadores
// cobertos mostram "—", nunca o valor mockado).
const cachePorTecnologia = new Map();

/**
 * Busca (ou reaproveita do cache) a base real inteira pra uma tecnologia:
 * o índice de valores e o mapa de cidades conhecidas. Um único fetch
 * alimenta os dois, porque são a mesma linha de CSV lida de duas formas.
 */
export async function carregarBaseReal(tecnologia) {
  const linhas = await buscarLinhasCru(tecnologia);
  const resultado = {
    indice: indexarValoresPorCidade(linhas),
    nomesOriginais: indexarNomesOriginais(linhas),
  };
  cachePorTecnologia.set(tecnologia, resultado);
  return resultado;
}

export function baseRealEmCacheOuNula(tecnologia) {
  return cachePorTecnologia.get(tecnologia) ?? null;
}

/**
 * Substitui, em `cidade.indicadores`, o `realizado` mensal e a quebra
 * semanal dos indicadores cobertos pela base real. Tudo o resto do
 * objeto (meta, gerente, regional, base ativa) permanece exatamente como
 * veio do mock (ou `null`, pra cidade sintetizada — ver cidadeService.js)
 * — ver o comentário no topo do arquivo.
 *
 * Se `indice` for `null` (nenhum carregamento bem-sucedido ainda nesta
 * sessão), os indicadores cobertos ficam com `realizado: null` em vez do
 * valor mockado: mostrar um número que parece real mas não veio da base
 * real seria pior do que mostrar "—".
 */
export function aplicarRealizadosReais(cidade, indice, tecnologia) {
  const cobertos = new Set(INDICADORES_COM_DADO_REAL[tecnologia] ?? []);
  const porIndicador = indice?.get(cidade.id) ?? null;

  return {
    ...cidade,
    indicadores: cidade.indicadores.map((ind) => {
      if (!cobertos.has(ind.id)) return ind;
      const registro = porIndicador?.get(ind.id) ?? null;
      return {
        ...ind,
        meses: ind.meses.map((m, mesIndex) => {
          const realizado = registro?.meses.get(mesIndex) ?? null;
          const semanasReais = registro?.semanas.get(mesIndex);
          return {
            ...m,
            realizado,
            semanas: m.semanas.map((s) => {
              const real = semanasReais?.get(s.numero);
              if (!real) return { ...s, valor: null };
              return {
                ...s,
                valor: real.valor,
                diaInicio: real.diaInicio ?? s.diaInicio,
                diaFim: real.diaFim ?? s.diaFim,
              };
            }),
          };
        }),
      };
    }),
  };
}