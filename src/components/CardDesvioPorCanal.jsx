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

function CelulaDesvio({ valor, unidade }) {
  return (
    <span className={`tabular-nums font-semibold ${corDesvio(valor)}`}>
      {valor > 0 ? '+' : ''}{formatarValor(valor, unidade)}
    </span>
  );
}

function TabelaDesvio({ linhas, unidade, titulo }) {
  if (!linhas?.length) return <p className="text-xs text-slate-400 italic">Sem dado para {titulo}.</p>;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-400">
            <th className="pb-1 font-medium">Canal</th>
            <th className="pb-1 text-right font-medium">Meta</th>
            <th className="pb-1 text-right font-medium">Realizado</th>
            <th className="pb-1 text-right font-medium">Desvio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {linhas.map((r) => (
            <tr key={r.canal}>
              <td className="py-1.5 font-medium text-slate-700">{r.canal}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-500">{formatarValor(r.meta, unidade)}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-600">{formatarValor(r.realizado, unidade)}</td>
              <td className="py-1.5 text-right"><CelulaDesvio valor={r.desvio} unidade={unidade} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Desvio por canal da cidade (realizado − meta) para o indicador principal
 * da tecnologia — mês atual e acumulado do ano lado a lado.
 * Se não houver dado do mês atual (cidade sem atualização recente),
 * mostra só o acumulado. Oculta o card apenas se não houver nenhum dado.
 */
export default function CardDesvioPorCanal({ desvio, unidade }) {
  if (!desvio?.acumulado?.length) return null;

  const temMesAtual = desvio.mesAtual?.length > 0;
  const mesAtualLabel = temMesAtual
    ? rotuloMes(desvio.mesAtual[0].mesRef)
    : 'Mês atual';

  return (
    <section aria-label="Desvio por canal" className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Impacto por canal
      </h3>
      <div className={`mt-3 grid grid-cols-1 gap-5 ${temMesAtual ? 'sm:grid-cols-2' : ''}`}>
        {temMesAtual && (
          <TabelaDesvio linhas={desvio.mesAtual} unidade={unidade} titulo={mesAtualLabel} />
        )}
        <TabelaDesvio linhas={desvio.acumulado} unidade={unidade} titulo="Acumulado no ano" />
      </div>
    </section>
  );
}