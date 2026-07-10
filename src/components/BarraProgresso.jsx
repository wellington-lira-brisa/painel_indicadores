import { classificarAtingimento } from '../utils/status';

const CORES = {
  verde: 'bg-emerald-500',
  amarelo: 'bg-amber-500',
  vermelho: 'bg-red-500',
};

export default function BarraProgresso({ percentual }) {
  const largura = Math.min(Math.max(percentual, 0), 100);
  const cor = CORES[classificarAtingimento(percentual)];
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
      role="progressbar"
      aria-valuenow={Math.round(percentual)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${largura}%` }} />
    </div>
  );
}
