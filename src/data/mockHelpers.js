import { semanasDoMes } from '../utils/semanas';

/** Meses do painel — mesma estrutura pra qualquer tecnologia. */
export const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** Ano de referência do painel — usado para calcular semanas e feriados reais do calendário. */
export const ANO_PAINEL = 2026;

/**
 * Distribui `valorTotal` pelas semanas do mês de forma determinística (sem
 * aleatoriedade). A última semana absorve o resto da divisão, garantindo
 * que a soma das semanas feche exatamente com o `realizado` do mês.
 * Chamada com `valorTotal: null` (todo indicador nasce assim — ver
 * `indicadoresVazios()` abaixo) cai direto no primeiro `if` e devolve
 * semanas com `valor: null`, sem distribuir nada.
 */
function distribuirValorPorSemanas(valorTotal, semanasDoMesArr) {
  if (valorTotal === null) {
    return semanasDoMesArr.map((semana) => ({ ...semana, valor: null }));
  }

  const pesos = semanasDoMesArr.map((_, i) => 1 + 0.08 * Math.sin(i + 1));
  const somaPesos = pesos.reduce((acc, p) => acc + p, 0);

  let acumulado = 0;
  return semanasDoMesArr.map((semana, i) => {
    const ehUltima = i === semanasDoMesArr.length - 1;
    const valor = ehUltima
      ? Math.round((valorTotal - acumulado) * 100) / 100
      : Math.round(((valorTotal * pesos[i]) / somaPesos) * 100) / 100;
    acumulado += valor;
    return { ...semana, valor };
  });
}

/**
 * Monta um indicador no formato que todo o front espera (meses + quebra
 * semanal). Compartilhado entre todas as tecnologias (FTTH, 5G, e as que
 * vierem depois): a única coisa que muda de uma tecnologia pra outra é
 * qual `id`/`nome` é passado (ex.: 'instalacao'/'Instalação' vs
 * 'ativacao'/'Ativação'), nunca a lógica de montagem em si.
 *
 * `possuiSemanas` (default true): quando false, as semanas do indicador
 * ficam com `valor: null` — a própria tabela já trata valor nulo como
 * "—" (ver formatarValor), então nenhum componente de exibição precisa
 * saber quais indicadores têm quebra semanal real; só a origem do dado
 * decide isso. Existe porque nem todo indicador é apurado por semana
 * (ex.: 5G só quebra Ativação por semana; os demais só fecham no fim do
 * mês).
 */
export function indicador(id, nome, unidade, melhorQuandoMaior, metas, realizados, possuiSemanas = true) {
  const meses = MESES.map((mes, i) => {
    const realizado = realizados[i] ?? null;
    const semanasDoMesAtual = semanasDoMes(ANO_PAINEL, i);
    return {
      mes,
      meta: metas[i],
      realizado,
      semanas: possuiSemanas
        ? distribuirValorPorSemanas(realizado, semanasDoMesAtual)
        : semanasDoMesAtual.map((semana) => ({ ...semana, valor: null })),
    };
  });

  return { id, nome, unidade, melhorQuandoMaior, meses }; // unidade: 'abs' | 'pct' | 'brl'
}

/**
 * Metadados dos indicadores por tecnologia (id, nome, unidade, se "maior é
 * melhor", se tem quebra semanal) — única fonte de verdade de quais
 * indicadores cada tecnologia tem. Alimenta `indicadoresVazios()` abaixo,
 * que é como toda cidade nasce hoje (ver cidadeService.js).
 */
export const DEFINICOES_INDICADORES_FTTH = [
  { id: 'orcamento', nome: 'Orçamento (vendas)', unidade: 'abs', melhorQuandoMaior: true, possuiSemanas: true },
  { id: 'efetivado', nome: 'Efetivado', unidade: 'abs', melhorQuandoMaior: true, possuiSemanas: true },
  { id: 'instalacao', nome: 'Instalação', unidade: 'abs', melhorQuandoMaior: true, possuiSemanas: true },
];

export const DEFINICOES_INDICADORES_5G = [
  { id: 'crescimento', nome: 'Crescimento (base)', unidade: 'abs', melhorQuandoMaior: true, possuiSemanas: false },
  { id: 'ativacao', nome: 'Ativação', unidade: 'abs', melhorQuandoMaior: true, possuiSemanas: true },
];

/**
 * Gera os indicadores de uma cidade recém-criada a partir da base real —
 * meta e realizado nascem `null` em todo mês. `aplicarRealizadosReais`
 * (indicadorRealizadoService.js) preenche depois o `realizado` dos
 * indicadores cobertos pela base real; `aplicarMetaInstalacaoFtth`
 * (cidadeService.js) preenche a meta de Instalação quando existe pra essa
 * cidade. O que nenhuma fonte cobre continua `null` — e é exatamente por
 * isso que `atingimentoIndicador` (utils/status.js) devolve `null` pra
 * esses indicadores mesmo com realizado preenchido: sem meta não existe
 * "atingimento", só o número bruto.
 */
export function indicadoresVazios(definicoes) {
  const metasNulas = MESES.map(() => null);
  const realizadosNulos = MESES.map(() => null);
  return definicoes.map((d) =>
    indicador(d.id, d.nome, d.unidade, d.melhorQuandoMaior, metasNulas, realizadosNulos, d.possuiSemanas),
  );
}