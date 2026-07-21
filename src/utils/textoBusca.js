/**
 * Normalização de texto para comparação em buscas por nome (cidade,
 * descrição, autor, etc.). Remove acento, caixa e diferenças de
 * espaçamento para que "sao paulo" encontre "São Paulo".
 *
 * Fonte única — antes havia 3 implementações idênticas duplicadas
 * (feriadosBusca.js, PaginaListaPlanos.jsx) e uma omissão
 * (useFiltrosCidades.js), o que causou cidades acentuadas ficarem
 * inencontráveis no filtro do Ranking. Qualquer novo campo de busca por
 * nome deve importar daqui, não reimplementar.
 */
export function normalizarTextoBusca(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}