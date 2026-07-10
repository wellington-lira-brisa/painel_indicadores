export default function BadgeFwa({ vendeFwa }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        vendeFwa
          ? 'bg-emerald-100 text-emerald-800 ring-emerald-600/20'
          : 'bg-slate-100 text-slate-600 ring-slate-500/20'
      }`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {vendeFwa ? 'Vende FWA' : 'Não vende FWA'}
    </span>
  );
}