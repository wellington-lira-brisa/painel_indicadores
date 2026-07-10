export default function CardKpi({ titulo, valor, detalhe, destaque = false }) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        destaque ? 'border-brand-700 bg-brand-900 text-white' : 'border-slate-200 bg-white'
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${destaque ? 'text-brand-100' : 'text-slate-500'}`}>
        {titulo}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
      {detalhe && (
        <p className={`mt-1 text-xs ${destaque ? 'text-brand-100' : 'text-slate-500'}`}>{detalhe}</p>
      )}
    </div>
  );
}
