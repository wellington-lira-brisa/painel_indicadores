import { formatarValor } from '../utils/format';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rotuloMes(mesRef) {
  const [ano, mes] = mesRef.split('-');
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano}`;
}

function corDesvio(desvio) {
  if (desvio > 0) return 'text-emerald-600';
  if (desvio < 0) return 'text-red-500';
  return 'text-slate-500';
}

/**
 * Uma linha por canal: nome do canal em destaque, meta/realizado discretos,
 * desvio colorido em evidência. Área de toque confortável (min-h 44px).
 */
function LinhaCanal({ r, unidade }) {
  return (
    <li className="flex min-h-[44px] items-center justify-between gap-3 py-2.5">
      <span className="text-sm font-semibold text-slate-800">{r.canal}</span>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Meta</p>
          <p className="text-xs tabular-nums text-slate-500">{formatarValor(r.meta, unidade)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Realizado</p>
          <p className="text-xs tabular-nums text-slate-600">{formatarValor(r.realizado, unidade)}</p>
        </div>
        <div className="min-w-[3rem] text-right">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Desvio</p>
          <p className={`text-sm font-bold tabular-nums ${corDesvio(r.desvio)}`}>
            {r.desvio > 0 ? '+' : ''}{formatarValor(r.desvio, unidade)}
          </p>
        </div>
      </div>
    </li>
  );
}

function BlocoCanais({ linhas, unidade, titulo }) {
  if (!linhas?.length) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <ul className="divide-y divide-slate-100">
        {linhas.map((r) => <LinhaCanal key={r.canal} r={r} unidade={unidade} />)}
      </ul>
    </div>
  );
}

/**
 * Desvio por canal da cidade (realizado − meta) para o indicador principal
 * da tecnologia — mês atual e acumulado do ano.
 * Layout em lista vertical com hierarquia clara: canal em destaque,
 * meta/realizado discretos, desvio em cor e tamanho maiores.
 */
export default function CardDesvioPorCanal({ desvio, unidade }) {
  if (!desvio?.acumulado?.length) return null;

  const temMesAtual = desvio.mesAtual?.length > 0;
  const mesAtualLabel = temMesAtual ? rotuloMes(desvio.mesAtual[0].mesRef) : null;

  return (
    <section aria-label="Desvio por canal" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Impacto por canal
      </h3>
      <div className={`mt-3 ${temMesAtual ? 'grid grid-cols-1 gap-6 sm:grid-cols-2' : ''}`}>
        {temMesAtual && (
          <BlocoCanais linhas={desvio.mesAtual} unidade={unidade} titulo={mesAtualLabel} />
        )}
        <BlocoCanais linhas={desvio.acumulado} unidade={unidade} titulo="Acumulado no ano" />
      </div>
    </section>
  );
}