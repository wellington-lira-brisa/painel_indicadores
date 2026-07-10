/**
 * Checklist markdown (`- [ ] texto` / `- [x] texto`) merece um diff próprio,
 * item a item — não um diff de palavras do texto inteiro. Isolado aqui
 * porque é a mesma sintaxe usada em qualquer campo markdown do plano
 * (o_que/como/descricao), então a lógica não deve viver dentro do
 * componente nem se repetir por campo.
 */
const REGEX_ITEM_CHECKLIST = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/gm;
const REGEX_LINHA_CHECKLIST = /^\s*[-*+]\s+\[[ xX]\]\s+/;

function normalizarTextoItem(texto) {
  return String(texto ?? '').trim().replace(/\s+/g, ' ');
}

/** Extrai os itens de checklist de um texto markdown, na ordem em que aparecem. */
export function extrairItensChecklist(texto) {
  const itens = [];
  for (const encontrado of String(texto ?? '').matchAll(REGEX_ITEM_CHECKLIST)) {
    const textoItem = normalizarTextoItem(encontrado[2]);
    if (textoItem) itens.push({ texto: textoItem, concluido: encontrado[1].toLowerCase() === 'x' });
  }
  return itens;
}

/** Remove as linhas de checklist de um texto — usado antes do diff de prosa, pra não repetir o item ali como texto "inalterado". */
export function removerLinhasChecklist(texto) {
  return String(texto ?? '')
    .split('\n')
    .filter((linha) => !REGEX_LINHA_CHECKLIST.test(linha))
    .join('\n');
}

/**
 * Compara duas listas de itens de checklist casando por texto normalizado.
 * Retorna só o que realmente mudou — item igual nos dois lados não entra
 * no resultado, seguindo a mesma ideia de "só a diferença" do resto do
 * histórico.
 *
 * @returns {{ texto: string, tipo: 'concluido' | 'pendente' | 'adicionado' | 'removido' }[]}
 */
export function diffChecklist(itensAntes, itensDepois) {
  const mapaAntes = new Map(itensAntes.map((item) => [item.texto, item]));
  const mapaDepois = new Map(itensDepois.map((item) => [item.texto, item]));
  const mudancas = [];

  for (const [texto, itemDepois] of mapaDepois) {
    const itemAntes = mapaAntes.get(texto);
    if (!itemAntes) {
      mudancas.push({ texto, tipo: 'adicionado' });
    } else if (itemAntes.concluido !== itemDepois.concluido) {
      mudancas.push({ texto, tipo: itemDepois.concluido ? 'concluido' : 'pendente' });
    }
  }

  for (const [texto] of mapaAntes) {
    if (!mapaDepois.has(texto)) mudancas.push({ texto, tipo: 'removido' });
  }

  return mudancas;
}