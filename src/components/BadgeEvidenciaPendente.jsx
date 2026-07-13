import { ImageOff } from 'lucide-react';

/**
 * Badge de pendência de evidência — domínio deliberadamente separado de
 * StatusPlanoBadge (status de execução: não iniciado → concluído). São
 * conceitos diferentes: um plano pode estar "em andamento" e ainda assim
 * sem nenhuma evidência anexada (fluxo normal: cria o plano numa reunião,
 * anexa a foto só depois de ir a campo) — misturar os dois no mesmo
 * domínio de status seria o mesmo erro que STATUS_PLANO já evita, de
 * propósito, em relação ao status de criticidade da cidade.
 *
 * `plano.temEvidencias` já vem pronto do service (mapearPlano) — este
 * componente só decide como mostrar, nunca recalcula a partir de
 * `evidencias.length` (evita o mesmo dado ser calculado em dois lugares
 * de formas potencialmente diferentes).
 */
export default function BadgeEvidenciaPendente({ temEvidencias }) {
  if (temEvidencias) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
      <ImageOff className="size-3.5" aria-hidden="true" />
      Evidências pendentes
    </span>
  );
}