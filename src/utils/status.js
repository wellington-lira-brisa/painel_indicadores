/**
 * Regras de classificação de status por cidade/indicador.
 * Verde  : atingimento >= 90%
 * Amarelo: atingimento entre 75% e 89,99%
 * Vermelho: atingimento < 75%
 */
const STATUS = {
  VERDE: 'verde',
  AMARELO: 'amarelo',
  VERMELHO: 'vermelho',
};

const STATUS_LIMITES = { verde: 90, amarelo: 75 };

/** Classes Tailwind de cor de texto por status, usadas em tabelas e cards. */
export const STATUS_COR_TEXTO = {
  verde: 'text-emerald-700',
  amarelo: 'text-amber-700',
  vermelho: 'text-red-700',
};

export function classificarAtingimento(percentual) {
  if (percentual >= STATUS_LIMITES.verde) return STATUS.VERDE;
  if (percentual >= STATUS_LIMITES.amarelo) return STATUS.AMARELO;
  return STATUS.VERMELHO;
}

/** Razão realizado/meta (ou invertida, se "menor é melhor"), limitada a 150%. */
function razaoAtingimento(melhorQuandoMaior, realizado, meta) {
  const razao = melhorQuandoMaior ? realizado / meta : meta / Math.max(realizado, 0.0001);
  return Math.min(razao * 100, 150);
}

/**
 * Atingimento acumulado de um indicador (apenas meses com realizado informado).
 * Para indicadores onde "menor é melhor" (ex.: churn), o atingimento é invertido:
 * meta/realizado, limitado a 150% para não distorcer a média.
 *
 * `campoMeta` decide QUAL meta usar: `'meta'` (padrão, Meta Geral da Cidade —
 * usada em scoreCidade/Ranking) ou `'metaIndicador'` (Meta do Indicador,
 * usada na tabela da cidade — ver TabelaIndicadores.jsx). Enquanto
 * `metaIndicador` não tem fonte cadastrada (sempre `null`), a soma dá 0 e
 * isso devolve `null` — atingimento só aparece na tabela quando a meta do
 * indicador aparecer.
 */
export function atingimentoIndicador(indicador, campoMeta = 'meta', campoRealizado = 'realizado') {
  const meses = indicador.meses.filter((m) => m[campoRealizado] !== null);
  if (meses.length === 0) return null;

  const meta = meses.reduce((acc, m) => acc + (m[campoMeta] ?? 0), 0);
  const realizado = meses.reduce((acc, m) => acc + m[campoRealizado], 0);
  if (meta === 0) return null;

  return razaoAtingimento(indicador.melhorQuandoMaior, realizado, meta);
}

/**
 * Score da cidade: média simples dos atingimentos válidos dos indicadores.
 * `null` quando NENHUM indicador tem meta+realizado pra calcular — não é
 * "0%" (que seria "meta batida em 0%", ou seja, uma nota péssima real).
 * Cidades sem meta cadastrada (ex.: só existem na base real, nunca foram
 * cadastradas — ver cidadeService.js) caem aqui; distinguir isso de
 * "score baixo de verdade" é o que `statusCidade` usa pra não rotular uma
 * cidade sem meta como "Crítico".
 */
export function scoreCidade(cidade) {
  const valores = cidade.indicadores
    .map((ind) => atingimentoIndicador(ind))
    .filter((v) => v !== null);
  if (valores.length === 0) return null;
  return valores.reduce((acc, v) => acc + v, 0) / valores.length;
}

export function statusCidade(cidade) {
  const score = scoreCidade(cidade);
  return score === null ? 'sem-dado' : classificarAtingimento(score);
}

/**
 * Compara a classificação de quando um plano foi criado com a
 * classificação atual da cidade — é a pergunta central de efetividade
 * ("esse plano ajudou?"). `sem-dado` nunca entra na ordem (não é melhor
 * nem pior que as outras, é ausência de informação) — vira `indeterminado`
 * sempre que aparecer de um dos dois lados.
 */
const ORDEM_CLASSIFICACAO = { vermelho: 0, amarelo: 1, verde: 2 };

export function compararClassificacoes(classificacaoNaCriacao, classificacaoAtual) {
  if (
    classificacaoNaCriacao == null ||
    classificacaoAtual == null ||
    !(classificacaoNaCriacao in ORDEM_CLASSIFICACAO) ||
    !(classificacaoAtual in ORDEM_CLASSIFICACAO)
  ) {
    return 'indeterminado';
  }
  if (ORDEM_CLASSIFICACAO[classificacaoAtual] > ORDEM_CLASSIFICACAO[classificacaoNaCriacao]) return 'melhorou';
  if (ORDEM_CLASSIFICACAO[classificacaoAtual] < ORDEM_CLASSIFICACAO[classificacaoNaCriacao]) return 'piorou';
  return 'igual';
}

/**
 * Contexto de criação de um Plano de Ação: classificação da cidade,
 * índice (0-based, jan=0) do mês mais recente apurado entre TODOS os
 * indicadores da cidade, e o detalhe por indicador que compôs esse
 * score — pra gravar no plano no momento da criação (ver migration
 * 20260720120000, criarPlano em planoAcaoService.js). Não é recalculado
 * depois: é um snapshot, lido uma vez no instante do INSERT.
 *
 * Devolve o ÍNDICE do mês, não uma data formatada — converter pra data
 * (`${ANO_PAINEL}-${mes}-01`) é responsabilidade de quem chama (ver
 * FormularioPlanoAcao.jsx): status.js não depende de mockHelpers.js
 * (evita acoplar utilitário de cálculo a constante de outra camada, e
 * mantém este arquivo executável isoladamente pelos testes do Node, sem
 * arrastar a cadeia de imports de mockHelpers/semanas).
 *
 * `indicadoresMotivadores` usa `metaIndicador` (Meta por Canal), NUNCA
 * `meta` (Meta Geral da Cidade) — Meta Geral só existe pra UM indicador
 * por tecnologia (Instalação no FTTH, Ativação no 5G); os outros
 * (Orçamento, Efetivado) sempre teriam `meta` nula e sumiriam da lista
 * silenciosamente. `classificacaoNoMomento`, por outro lado, continua
 * vindo de `statusCidade()` (Meta Geral) de propósito — é o mesmo
 * critério usado no Ranking/StatusBadge em qualquer outro lugar do
 * painel, não deve divergir só porque este plano tem canal.
 */
export function contextoCriacaoPlano(cidade) {
  const indicesApurados = cidade.indicadores.flatMap((ind) =>
    ind.meses.reduce((acc, m, i) => (m.realizado !== null ? [...acc, i] : acc), []),
  );
  const indiceUltimoMesApurado = indicesApurados.length > 0 ? Math.max(...indicesApurados) : null;

  return {
    classificacaoNoMomento: statusCidade(cidade),
    indiceUltimoMesApurado,
    indicadoresMotivadores: cidade.indicadores.map((ind) => {
      const atingimento = atingimentoIndicador(ind, 'metaIndicador');
      const mesesApurados = ind.meses.filter((m) => m.realizado !== null);
      return {
        indicadorId: ind.id,
        nome: ind.nome,
        meta: mesesApurados.length > 0 ? mesesApurados.reduce((acc, m) => acc + (m.metaIndicador ?? 0), 0) : null,
        realizado: mesesApurados.length > 0 ? mesesApurados.reduce((acc, m) => acc + m.realizado, 0) : null,
        atingimento,
        status: atingimento === null ? null : classificarAtingimento(atingimento),
      };
    }),
  };
}

/** Último mês com realizado apurado de um indicador, ou null se nenhum. */
export function ultimoMesApurado(indicador) {
  const apurados = indicador.meses.filter((m) => m.realizado !== null);
  return apurados.length > 0 ? apurados[apurados.length - 1] : null;
}

/**
 * Atingimento (%) de um único mês do indicador, ou null se não apurado.
 * Mesmo `campoMeta` de atingimentoIndicador — padrão `'meta'` (Meta Geral).
 */
export function atingimentoMes(indicador, mes, campoMeta = 'meta') {
  const metaValor = mes[campoMeta];
  if (mes.realizado === null || !metaValor) return null;
  return razaoAtingimento(indicador.melhorQuandoMaior, mes.realizado, metaValor);
}

/** Textos dos tooltips (IconeInfo) do Ranking — um lugar só pra manter a explicação igual em toda tela que usa `resumoMetaRealizado`. */
export const EXPLICACAO_META_GERAL =
  'Meta Geral da Cidade: meta do indicador de referência (Instalação no FTTH, Ativação no 5G), acumulada até o último mês apurado do ano. Não é a meta de um indicador específico — essa fica só na tabela de indicadores dentro da cidade, quando existir.';

export const EXPLICACAO_REALIZADO_GERAL =
  'Realizado acumulado do ano até o último mês apurado, do mesmo indicador de referência da Meta Geral. Filtrar por canal recalcula esse número — a meta continua sendo a da cidade inteira.';

export const EXPLICACAO_META_REALIZADO_GERAL =
  'Realizado e Meta Geral da Cidade, acumulados do ano até o último mês apurado, do indicador de referência (Instalação no FTTH, Ativação no 5G). Filtrar por canal recalcula o realizado — a meta continua sendo a da cidade inteira.';

export const EXPLICACAO_ATINGIMENTO =
  'Realizado ÷ Meta Geral (colunas ao lado), do mesmo indicador de referência. Não é a média de todos os indicadores da cidade — só desse indicador.';