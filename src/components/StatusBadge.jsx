const ESTILOS = {
  verde: { classes: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20', rotulo: 'Saudável' },
  amarelo: { classes: 'bg-amber-100 text-amber-800 ring-amber-600/20', rotulo: 'Atenção' },
  vermelho: { classes: 'bg-red-100 text-red-800 ring-red-600/20', rotulo: 'Crítico' },
};

export default function StatusBadge({ status }) {
  const estilo = ESTILOS[status];
  if (!estilo) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${estilo.classes}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {estilo.rotulo}
    </span>
  );
}
