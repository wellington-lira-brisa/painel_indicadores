import { semanasDoMes } from '../utils/semanas';

/** Meses do painel — mesma estrutura pra qualquer tecnologia. */
export const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** Ano de referência do painel — usado para calcular semanas e feriados reais do calendário. */
export const ANO_PAINEL = 2026;

/**
 * Distribui `valorTotal` pelas semanas do mês de forma determinística (sem
 * aleatoriedade, pra manter o mock reproduzível). A última semana absorve o
 * resto da divisão, garantindo que a soma das semanas feche exatamente com
 * o `realizado` do mês — a mesma invariante que os dados reais precisarão
 * respeitar.
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
 * Cria um indicador mockado, com quebra semanal fictícia (`semanas`) só
 * para validar layout/legibilidade antes da integração com a base real.
 * Compartilhado entre todas as tecnologias (FTTH, 5G, e as que vierem
 * depois): a única coisa que muda de uma tecnologia pra outra é qual
 * `id`/`nome` é passado (ex.: 'instalacao'/'Instalação' vs
 * 'ativacao'/'Ativação'), nunca a lógica de geração em si.
 *
 * `possuiSemanas` (default true, preserva o comportamento de sempre):
 * quando false, as semanas do indicador ficam com `valor: null` — a
 * própria tabela já trata valor nulo como "—" (ver formatarValor), então
 * nenhum componente de exibição precisa saber quais indicadores têm
 * quebra semanal real; só a origem do dado decide isso. Existe porque
 * nem todo indicador é apurado por semana (ex.: 5G só quebra Ativação
 * por semana; os demais só fecham no fim do mês).
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
 * melhor", se tem quebra semanal) — extraídos dos mesmos valores já usados
 * em cada `indicador(...)` de `cidadesMock`/`cidadesMock5g`, só que como
 * dado isolado, sem meta/realizado. Existem só pra alimentar
 * `indicadoresVazios()` abaixo; as cidades mockadas continuam com seus
 * blocos originais intactos (duplicar essa metadata aqui foi a troca
 * deliberada por não mexer num dataset que já funciona).
 */
export const DEFINICOES_INDICADORES_FTTH = [
  { id: 'orcamento', nome: 'Orçamento (vendas)', unidade: 'abs', melhorQuandoMaior: true, possuiSemanas: true },
  { id: 'efetivado', nome: 'Efetivado', unidade: 'abs', melhorQuandoMaior: true, possuiSemanas: true },
  { id: 'instalacao', nome: 'Instalação', unidade: 'abs', melhorQuandoMaior: true, possuiSemanas: true },
  { id: 'churn', nome: 'Churn Rate', unidade: 'pct', melhorQuandoMaior: false, possuiSemanas: true },
  { id: 'cancelamento', nome: 'Cancelamento', unidade: 'abs', melhorQuandoMaior: false, possuiSemanas: true },
  { id: 'crescimento', nome: 'Crescimento (base)', unidade: 'abs', melhorQuandoMaior: true, possuiSemanas: true },
];

export const DEFINICOES_INDICADORES_5G = [
  { id: 'crescimento', nome: 'Crescimento (base)', unidade: 'abs', melhorQuandoMaior: true, possuiSemanas: false },
  { id: 'ativacao', nome: 'Ativação', unidade: 'abs', melhorQuandoMaior: true, possuiSemanas: true },
  { id: 'churn', nome: 'Churn Rate', unidade: 'pct', melhorQuandoMaior: false, possuiSemanas: false },
  { id: 'cancelamento', nome: 'Cancelamento', unidade: 'abs', melhorQuandoMaior: false, possuiSemanas: false },
];

/**
 * Gera os indicadores de uma cidade que não tem cadastro no mock (existe
 * na base real, mas nunca foi cadastrada com meta/gerente/regional) — meta
 * e realizado nascem `null` em todo mês. `aplicarRealizadosReais`
 * (indicadorRealizadoService.js) preenche depois o `realizado` dos
 * indicadores cobertos pela base real; a meta continua `null` porque
 * nenhuma fonte hoje fornece meta — e é exatamente por isso que
 * `atingimentoIndicador` (utils/status.js) devolve `null` pra esses
 * indicadores mesmo com realizado preenchido: sem meta não existe
 * "atingimento", só o número bruto.
 */
export function indicadoresVazios(definicoes) {
  const metasNulas = MESES.map(() => null);
  const realizadosNulos = MESES.map(() => null);
  return definicoes.map((d) =>
    indicador(d.id, d.nome, d.unidade, d.melhorQuandoMaior, metasNulas, realizadosNulos, d.possuiSemanas),
  );
}

/**
 * Base Ativa mês a mês, derivada do indicador "Crescimento (base)": cada
 * mês soma o `realizado` de crescimento daquele mês a um valor inicial da
 * cidade. Meses ainda não apurados ficam `null`. Como percorre
 * `crescimento.meses` (já preparado para novos meses via MESES), a Base
 * Ativa acompanha automaticamente qualquer mês novo adicionado depois —
 * pra qualquer tecnologia que reutilize este helper.
 */
export function comBaseAtiva(cidade, baseInicial) {
  const crescimento = cidade.indicadores.find((i) => i.id === 'crescimento');
  let acumulado = baseInicial;

  const baseAtiva = crescimento.meses.map((mes) => {
    if (mes.realizado === null) return { mes: mes.mes, valor: null };
    acumulado += mes.realizado;
    return { mes: mes.mes, valor: acumulado };
  });

  return { ...cidade, baseAtiva };
}