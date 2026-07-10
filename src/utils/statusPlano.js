/**
 * Status do plano de ação (fluxo de execução: não iniciado → concluído).
 * Domínio deliberadamente separado de `utils/status.js` (criticidade da
 * cidade: verde/amarelo/vermelho) — são conceitos diferentes que só
 * coincidem em nome ("status"); misturar os dois em um componente/arquivo
 * só criaria acoplamento indevido entre coisas que mudam por razões
 * diferentes.
 */
export const STATUS_PLANO = {
  NAO_INICIADO: 'nao_iniciado',
  EM_ANDAMENTO: 'em_andamento',
  AGUARDANDO: 'aguardando',
  PARADO: 'parado',
  CONCLUIDO: 'concluido',
};

/** Ordem de exibição no seletor — do estado inicial ao final. */
export const STATUS_PLANO_OPCOES = [
  { valor: STATUS_PLANO.NAO_INICIADO, rotulo: 'Não iniciado' },
  { valor: STATUS_PLANO.EM_ANDAMENTO, rotulo: 'Em andamento' },
  { valor: STATUS_PLANO.AGUARDANDO, rotulo: 'Aguardando' },
  { valor: STATUS_PLANO.PARADO, rotulo: 'Parado' },
  { valor: STATUS_PLANO.CONCLUIDO, rotulo: 'Concluído' },
];

export const STATUS_PLANO_ROTULOS = Object.fromEntries(
  STATUS_PLANO_OPCOES.map((o) => [o.valor, o.rotulo]),
);

/** Classes Tailwind do badge/seletor por status — mesmo padrão visual do StatusBadge de cidade. */
export const STATUS_PLANO_CORES = {
  [STATUS_PLANO.NAO_INICIADO]: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  [STATUS_PLANO.EM_ANDAMENTO]: 'bg-blue-100 text-blue-800 ring-blue-600/20',
  [STATUS_PLANO.AGUARDANDO]: 'bg-amber-100 text-amber-800 ring-amber-600/20',
  [STATUS_PLANO.PARADO]: 'bg-red-100 text-red-800 ring-red-600/20',
  [STATUS_PLANO.CONCLUIDO]: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
};

export function statusPlanoValido(valor) {
  return Object.values(STATUS_PLANO).includes(valor);
}

/**
 * Normaliza qualquer valor pra um status válido — planos criados antes
 * desta versão podem ter valores fora do enum novo (a migration já
 * reescreve o dado no banco, isto aqui é só uma segunda rede de segurança
 * no client, pro caso de a migration ainda não ter rodado no ambiente).
 * Nunca quebra a tela por causa de um valor inesperado.
 */
export function normalizarStatusPlano(valor) {
  return statusPlanoValido(valor) ? valor : STATUS_PLANO.NAO_INICIADO;
}