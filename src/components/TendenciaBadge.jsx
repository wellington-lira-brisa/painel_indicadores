import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const ESTILOS = {
  alta: { Icone: TrendingUp, classes: 'text-emerald-600', rotulo: 'Alta' },
  estavel: { Icone: Minus, classes: 'text-slate-500', rotulo: 'Estável' },
  queda: { Icone: TrendingDown, classes: 'text-red-600', rotulo: 'Queda' },
};

export default function TendenciaBadge({ tendencia }) {
  const estilo = ESTILOS[tendencia];
  if (!estilo) return null;
  const { Icone, classes, rotulo } = estilo;
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${classes}`}>
      <Icone className="size-4" aria-hidden="true" />
      {rotulo}
    </span>
  );
}
