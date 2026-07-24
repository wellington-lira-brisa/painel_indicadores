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
  'Classificação da cidade com base no atingimento de meta dos vendedores. ' +
  'Q1 = acima de 100% · Q2 = acima de 80% · Q3 = acima de 60% · Q4 = acima de 30% · Q5 = abaixo de 30%. ' +
  'Considera apenas vendedores desta tecnologia.';

/**
 * Nome completo do indicador (como vem do Dicionário de Metas e da fato
 * de vendedores) -> rótulo curto pra exibição na mini-tabela de
 * colaboradores. Só cobre os indicadores de INSTALAÇÃO FTTH — são os
 * únicos com quintil por indicador hoje (o cálculo em si vive em
 * shared/csvIndicadores.js; aqui é só o rótulo visual, mesmo padrão dos
 * outros exports deste arquivo). Indicador sem entrada aqui cai no
 * fallback do componente que consome este mapa (nome completo, feio mas
 * nunca quebra) — nunca lança.
 */
export const ROTULO_CURTO_INDICADOR_INSTALACAO = {
  'Vendas instaladas Combo 1 Chip - FTTH': 'Combo 1',
  'Vendas instaladas Combo 2+ Chip - FTTH': 'Combo 2+',
  'Vendas instalada Combo - FTTH': 'Combo',
  'Vendas instaladas avulso - FTHH': 'Avulso',
  'Vendas instaladas avulso - Banda Larga': 'Avulso',
};