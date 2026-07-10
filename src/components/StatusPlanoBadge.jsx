import { STATUS_PLANO_CORES, STATUS_PLANO_ROTULOS, normalizarStatusPlano } from '../utils/statusPlano';

/** Badge discreto de status do plano — usado onde o status só é exibido, não editado. */
export default function StatusPlanoBadge({ status }) {
  const statusValido = normalizarStatusPlano(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_PLANO_CORES[statusValido]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS_PLANO_ROTULOS[statusValido]}
    </span>
  );
}