export const JANELAS_HISTORICO = {
  ATUAL: 'atual',
  ULTIMOS_3: 'ultimos_3',
  TODOS: 'todos',
};

/**
 * Índice (0-based) do mês corrente real, ancorado ao ano do painel.
 *
 * Fonte: relógio do sistema (`Date` nativo, fuso local do navegador) — não
 * os dados mockados. A versão anterior inferia "mês atual" do último mês
 * com `realizado` apurado nos indicadores; isso é frágil (o mês mais
 * recente com dado carregado nem sempre é o mês corrente de verdade — ex.:
 * apuração atrasada) e foi o que causava destacar um mês errado.
 *
 * Se o ano do painel não for o ano corrente (navegando um histórico
 * passado ou futuro), não existe "mês atual" de verdade nesse contexto:
 * cai em dezembro como referência neutra em vez de destacar um mês ao
 * acaso.
 */
export function indiceMesAtual(anoPainel) {
  const hoje = new Date();
  return hoje.getFullYear() === anoPainel ? hoje.getMonth() : 11;
}

/**
 * Índices dos meses a exibir, conforme a janela de histórico escolhida.
 * Recorte puro sobre os meses já carregados — nunca dispara nova consulta.
 */
export function indicesMesesVisiveis(totalMeses, janela, indiceAtual) {
  const ultimo = indiceAtual;

  if (janela === JANELAS_HISTORICO.ATUAL) return [ultimo];

  if (janela === JANELAS_HISTORICO.ULTIMOS_3) {
    const inicio = Math.max(0, ultimo - 2);
    return Array.from({ length: ultimo - inicio + 1 }, (_, i) => inicio + i);
  }

  return Array.from({ length: totalMeses }, (_, i) => i);
}