export function formatarValor(valor, unidade) {
  if (valor === null || valor === undefined) return '—';
  switch (unidade) {
    case 'pct':
      return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
    case 'brl':
      return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    default:
      return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  }
}

export function formatarPercentual(valor, casas = 1) {
  if (valor === null || valor === undefined) return '—';
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`;
}

export function formatarDataHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Formata uma data pura (coluna DATE, formato YYYY-MM-DD, sem hora).
 * new Date('2026-07-08') é interpretado como UTC meia-noite — em fusos
 * negativos isso faz o dia exibido "andar" um pra trás. Fatiar a string
 * evita depender do fuso do navegador.
 */
export function formatarDataSimples(isoData) {
  if (!isoData) return '—';
  const [ano, mes, dia] = String(isoData).split('-');
  if (!ano || !mes || !dia) return '—';
  return `${dia}/${mes}/${ano}`;
}

/**
 * true só quando `atualizadoEm` é uma edição real, não o carimbo de
 * criação replicado. INSERT grava os dois timestamps praticamente juntos;
 * 1s de tolerância separa "acabou de ser criado" de "foi editado depois".
 */
export function foiAtualizado(criadoEm, atualizadoEm) {
  if (!criadoEm || !atualizadoEm) return false;
  return new Date(atualizadoEm).getTime() - new Date(criadoEm).getTime() > 1000;
}

export function formatarBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

/**
 * Remove marcação Markdown básica de um texto, pra uso em prévias em
 * texto puro (ex.: card de lista). Não faz parsing completo — só limpa
 * os símbolos mais comuns pra não vazar `**`, `#`, `- [ ]` etc. na UI.
 */
export function removerMarcacaoMarkdown(texto) {
  return String(texto ?? '')
    .replace(/^#{1,6}\s+/gm, '') // títulos
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '') // itens de checklist
    .replace(/^\s*[-*+]\s+/gm, '') // itens de lista
    .replace(/^\s*\d+\.\s+/gm, '') // itens numerados
    .replace(/^>\s?/gm, '') // citações
    .replace(/`{1,3}/g, '') // código
    .replace(/[*_~]{1,3}/g, '') // negrito/itálico/tachado
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links: mantém o texto
    .replace(/\s*\n\s*/g, ' ') // colapsa quebras de linha
    .trim();
}