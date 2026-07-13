import { parsearCsv } from '../shared/csvIndicadores';

// Enquanto não existe uma API real, a base fica versionada no próprio
// repositório e é publicada como arquivo estático pelo workflow
// (.github/workflows/atualizar-base.yml -> scripts/etl/gerarBase.mjs).
// `fetch` funciona igual em dev (servido pelo Vite a partir de `public/`)
// e em produção (GitHub Pages, mesmo `deploy.yml` de sempre).
//
// TROCA FUTURA PRA API: esta é a ÚNICA função que precisa mudar. Troque o
// corpo de `buscarLinhasCru` por uma chamada à API (ex.:
// `fetch('https://.../api/indicadores?tecnologia=' + tecnologia)`) devolvendo
// a mesma lista de objetos `{ cidade_slug, indicador_id, mes_ref, semana_mes, valor }`
// — todo o resto deste arquivo (indexação, cache, aplicação sobre a
// cidade) continua igual, e `cidadeService.js` nem precisa saber que a
// fonte mudou.
// import.meta.env.BASE_URL já vem com o `base` configurado em
// vite.config.js (necessário pro GitHub Pages, que serve o site numa
// subpasta) e termina com "/" — não hardcodar "/dados/..." direto, senão
// quebra em qualquer ambiente que não sirva o site na raiz do domínio.
const CAMINHO_CSV = `${import.meta.env.BASE_URL}dados/indicadores-realizados.csv`;

// Único conjunto de indicadores que a base real hoje sustenta, por
// tecnologia (ver RELATORIO.md, seção 5). Qualquer indicador fora daqui
// (meta, churn, cancelamento, crescimento — e toda a metainformação de
// cidade: gerente, regional, coordenador, ativação comercial) continua
// vindo do mock até existir uma fonte real pra ele. Este arquivo nunca
// decide inventar um valor pra fechar essa lacuna.
const INDICADORES_COM_DADO_REAL = {
  ftth: ['orcamento', 'efetivado', 'instalacao'],
  '5g': ['ativacao'],
};

function indiceDoMes(mesRefIso) {
  return Number(mesRefIso.slice(5, 7)) - 1; // 'YYYY-MM-DD' -> índice 0-based (jan=0)
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

/** cidadeSlug -> indicadorId -> { meses: Map(mesIndex->valor), semanas: Map(mesIndex->Map(numeroSemana->valor)) } */
function indexarPorCidade(linhas) {
  const indice = new Map();
  for (const l of linhas) {
    if (!l.cidade_slug) continue; // sem cidade mapeada: não há como exibir por cidade (fica só auditável no CSV)
    if (!indice.has(l.cidade_slug)) indice.set(l.cidade_slug, new Map());
    const porIndicador = indice.get(l.cidade_slug);
    if (!porIndicador.has(l.indicador_id)) {
      porIndicador.set(l.indicador_id, { meses: new Map(), semanas: new Map() });
    }
    const registro = porIndicador.get(l.indicador_id);
    const mesIndex = indiceDoMes(l.mes_ref);
    const valor = Number(l.valor);
    if (l.semana_mes === '') {
      registro.meses.set(mesIndex, valor);
    } else {
      const numeroSemana = Number(l.semana_mes);
      if (!registro.semanas.has(mesIndex)) registro.semanas.set(mesIndex, new Map());
      registro.semanas.get(mesIndex).set(numeroSemana, valor);
    }
  }
  return indice;
}

// Cache em memória por tecnologia, só pra não refazer o fetch a cada card
// renderizado na mesma sessão. `null` = ainda não carregado com sucesso
// nesta sessão (ver `aplicarRealizadosReais`: nesse estado os indicadores
// cobertos mostram "—", nunca o valor mockado).
const cachePorTecnologia = new Map();

/** Busca (ou reaproveita do cache) o índice de realizados reais para a tecnologia. */
export async function carregarIndiceRealizados(tecnologia) {
  const linhas = await buscarLinhasCru(tecnologia);
  const indice = indexarPorCidade(linhas);
  cachePorTecnologia.set(tecnologia, indice);
  return indice;
}

export function indiceEmCacheOuNulo(tecnologia) {
  return cachePorTecnologia.get(tecnologia) ?? null;
}

/**
 * Substitui, em `cidade.indicadores`, o `realizado` mensal e a quebra
 * semanal dos indicadores cobertos pela base real. Tudo o resto do
 * objeto (meta, gerente, regional, churn, cancelamento, crescimento,
 * base ativa) permanece exatamente como veio do mock — ver o comentário
 * no topo do arquivo.
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
            semanas: m.semanas.map((s) => ({ ...s, valor: semanasReais?.get(s.numero) ?? null })),
          };
        }),
      };
    }),
  };
}