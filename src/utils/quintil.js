/**
 * Exibição do Sistema de Quintil. As FAIXAS de classificação vivem em
 * classificarQuintil (shared/csvIndicadores.js) e rodam no ETL — aqui é
 * só o vocabulário visual, compartilhado por Ranking, card mobile e
 * página da cidade.
 *
 * Escala de 5 cores verde→vermelho: extensão natural do vocabulário já
 * usado no sistema (emerald/amber/red do status) com dois degraus
 * intermediários.
 */
export const QUINTIL_ROTULOS = { 1: '1º Quintil', 2: '2º Quintil', 3: '3º Quintil', 4: '4º Quintil', 5: '5º Quintil' };

export const QUINTIL_ROTULOS_CURTOS = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4', 5: 'Q5' };

/** Chip/badge (fundo suave + texto forte), por quintil. */
export const QUINTIL_COR_BADGE = {
  1: 'bg-emerald-100 text-emerald-800',
  2: 'bg-lime-100 text-lime-800',
  3: 'bg-amber-100 text-amber-800',
  4: 'bg-orange-100 text-orange-800',
  5: 'bg-red-100 text-red-800',
};

/** Segmento da barra de distribuição (cor cheia), por quintil. */
export const QUINTIL_COR_BARRA = {
  1: 'bg-emerald-500',
  2: 'bg-lime-500',
  3: 'bg-amber-500',
  4: 'bg-orange-500',
  5: 'bg-red-500',
};

export const EXPLICACAO_QUINTIL_CIDADE =
  'Quintil da cidade: classificação da média de atingimento individual dos vendedores da cidade na tecnologia ' +
  '(1º ≥100% · 2º ≥80% · 3º ≥60% · 4º ≥30% · 5º <30%). O atingimento de cada vendedor usa os mesmos indicadores ' +
  'de venda e multiplicadores do dicionário de metas. O time considerado aqui é só quem vende esta tecnologia ' +
  '(quem vende só a outra fica fora da conta). "Sem meta" = vendedor sem meta de venda em nenhuma tecnologia no mês.';