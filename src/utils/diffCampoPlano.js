import { removerMarcacaoMarkdown } from './format';
import { diffTextoParaExibicao } from './diffTexto';
import { diffChecklist, extrairItensChecklist, removerLinhasChecklist } from './checklistMarkdown';

/**
 * Analisa a mudança de um campo longo (o_que/como/descricao), separando
 * duas coisas que exigem leitura diferente:
 * - mudancasChecklist: itens de checklist que mudaram de estado — cada um
 *   já é uma frase completa por si só, sempre vale a pena mostrar.
 * - diffProsa: diff palavra a palavra do texto restante (sem as linhas de
 *   checklist, que já foram tratadas acima) — null quando não sobrou
 *   nenhuma mudança real de prosa, pra não renderizar um "diff" vazio.
 *
 * As linhas de checklist são removidas do texto ANTES do diff de prosa
 * por dois motivos: não faz sentido comparar item de checklist palavra a
 * palavra (o estado do checkbox é o que importa, não o texto), e sem
 * remover, o texto do item apareceria de novo ali como conteúdo
 * "inalterado", duplicando informação.
 */
export function analisarDiffCampoLongo(de, para) {
  const itensAntes = extrairItensChecklist(de);
  const itensDepois = extrairItensChecklist(para);
  const mudancasChecklist = diffChecklist(itensAntes, itensDepois);

  const prosaAntes = removerMarcacaoMarkdown(removerLinhasChecklist(de));
  const prosaDepois = removerMarcacaoMarkdown(removerLinhasChecklist(para));
  const diffBruto = diffTextoParaExibicao(prosaAntes, prosaDepois);
  const houveMudancaDeProsa = diffBruto.some((parte) => parte.tipo !== 'igual');

  return {
    mudancasChecklist,
    diffProsa: houveMudancaDeProsa ? diffBruto : null,
  };
}