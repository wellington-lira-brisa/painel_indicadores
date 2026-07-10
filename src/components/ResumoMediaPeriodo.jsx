import { formatarValor, formatarPercentual } from '../utils/format';
import { classificarAtingimento, STATUS_COR_TEXTO } from '../utils/status';

/**
 * Resumo das médias do período selecionado: meta média, realizado médio e
 * atingimento recalculado para o recorte, por indicador, mais a Base Ativa
 * média. Somente leitura — todo o cálculo já vem pronto de
 * `usePeriodoAnalise`, este componente só formata e exibe.
 */
export default function ResumoMediaPeriodo({
  mediasPorIndicador,
  mediaBaseAtiva,
  mesInicial,
  mesFinal,
  mesesDisponiveis,
  quantidadeMeses,
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-brand-900 text-white">
            <th className="px-3 py-2 text-left font-semibold">Indicador</th>
            <th className="px-3 py-2 text-right font-semibold">Meta média</th>
            <th className="px-3 py-2 text-right font-semibold">Realizado médio</th>
            <th className="px-3 py-2 text-right font-semibold">Atingimento no período</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr className="bg-brand-50/60">
            <td className="px-3 py-1.5 font-semibold text-slate-700">Base Ativa (média)</td>
            <td className="px-3 py-1.5 text-right text-slate-300">—</td>
            <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-700">
              {formatarValor(mediaBaseAtiva)}
            </td>
            <td className="px-3 py-1.5 text-right text-slate-300">—</td>
          </tr>
          {mediasPorIndicador.map(
            ({ indicador, metaMedia, realizadoMedia, atingimentoPeriodo, quantidadeMesesApurados, quantidadeMesesNoPeriodo }) => (
              <tr key={indicador.id}>
                <td className="px-3 py-1.5 font-medium text-slate-700">{indicador.nome}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                  {formatarValor(metaMedia, indicador.unidade)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-700">
                  {formatarValor(realizadoMedia, indicador.unidade)}
                  {quantidadeMesesApurados > 0 && quantidadeMesesApurados < quantidadeMesesNoPeriodo && (
                    <span className="ml-1 text-[10px] font-normal text-slate-400">
                      ({quantidadeMesesApurados}/{quantidadeMesesNoPeriodo} apurados)
                    </span>
                  )}
                </td>
                <td
                  className={`px-3 py-1.5 text-right font-bold tabular-nums ${
                    atingimentoPeriodo === null
                      ? 'text-slate-400'
                      : STATUS_COR_TEXTO[classificarAtingimento(atingimentoPeriodo)]
                  }`}
                >
                  {formatarPercentual(atingimentoPeriodo)}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
        Período: {mesesDisponiveis[mesInicial]}–{mesesDisponiveis[mesFinal]} ({quantidadeMeses}{' '}
        {quantidadeMeses === 1 ? 'mês' : 'meses'}). Meses sem apuração são ignorados no realizado médio.
      </p>
    </div>
  );
}