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
 */
export function indicador(id, nome, unidade, melhorQuandoMaior, metas, realizados) {
  const meses = MESES.map((mes, i) => {
    const realizado = realizados[i] ?? null;
    return {
      mes,
      meta: metas[i],
      realizado,
      semanas: distribuirValorPorSemanas(realizado, semanasDoMes(ANO_PAINEL, i)),
    };
  });

  return { id, nome, unidade, melhorQuandoMaior, meses }; // unidade: 'abs' | 'pct' | 'brl'
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