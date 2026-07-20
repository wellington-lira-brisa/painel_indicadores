import { Building2, Filter } from 'lucide-react';
import { formatarValor, formatarPercentual } from '../utils/format';
import { classificarAtingimento, STATUS_COR_TEXTO } from '../utils/status';
import {
  EXPLICACAO_BASE_ATIVA_MEDIA,
  EXPLICACAO_META_MEDIA_PERIODO,
  EXPLICACAO_REALIZADO_MEDIA_PERIODO,
  EXPLICACAO_ATINGIMENTO_PERIODO,
  EXPLICACAO_META_GERAL_MEDIA_PERIODO,
  EXPLICACAO_REALIZADO_GERAL_MEDIA_PERIODO,
  EXPLICACAO_ATINGIMENTO_GERAL_PERIODO,
} from '../utils/mediaPeriodo';
import IconeInfo from './IconeInfo';

/** Cor da célula de atingimento por faixa — reaproveitada nos dois blocos (canal e geral), evita repetir a mesma classe condicional duas vezes. */
function classeAtingimento(valor) {
  return valor === null ? 'text-slate-400' : STATUS_COR_TEXTO[classificarAtingimento(valor)];
}

/**
 * Resumo das médias do período selecionado, por indicador: bloco "Por
 * canal" (ícone de filtro — meta/realizado/atingimento recortados pelo
 * canal selecionado no SeletorCanais, ou soma de todos sem filtro) e
 * bloco "Geral da cidade" (ícone de cidade — Meta Geral + realizado
 * SEMPRE da cidade inteira, ignora o filtro; conceito à parte, não
 * precisa bater com o bloco por canal). Mais a Base Ativa média.
 * Somente leitura — todo o cálculo já vem pronto de `usePeriodoAnalise`,
 * este componente só formata e exibe.
 *
 * Os dois blocos usam cor de fundo diferente (branco vs. `slate-50`) do
 * cabeçalho até a última linha, não só no header — rolando o olho pela
 * tabela inteira dá pra ver onde termina um bloco e começa o outro, sem
 * precisar lembrar o que cada cabeçalho dizia lá em cima.
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
          <tr className="text-white">
            <th rowSpan={2} className="bg-brand-900 px-3 py-2 text-left align-bottom font-semibold">
              Indicador
            </th>
            <th colSpan={3} className="border-l-2 border-brand-700 bg-brand-900 px-3 py-1.5 text-center">
              <span className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                <Filter className="size-3" aria-hidden="true" /> Por canal
              </span>
            </th>
            <th colSpan={3} className="border-l-2 border-brand-700 bg-brand-800 px-3 py-1.5 text-center">
              <span className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                <Building2 className="size-3" aria-hidden="true" /> Geral da cidade
              </span>
            </th>
          </tr>
          <tr className="text-white">
            <th className="border-l-2 border-brand-700 bg-brand-900 px-3 py-2 text-right font-semibold">
              <span className="inline-flex items-center justify-end gap-1">
                Meta <IconeInfo texto={EXPLICACAO_META_MEDIA_PERIODO} />
              </span>
            </th>
            <th className="bg-brand-900 px-3 py-2 text-right font-semibold">
              <span className="inline-flex items-center justify-end gap-1">
                Realizado <IconeInfo texto={EXPLICACAO_REALIZADO_MEDIA_PERIODO} />
              </span>
            </th>
            <th className="bg-brand-900 px-3 py-2 text-right font-semibold">
              <span className="inline-flex items-center justify-end gap-1">
                Atingimento <IconeInfo texto={EXPLICACAO_ATINGIMENTO_PERIODO} />
              </span>
            </th>
            <th className="border-l-2 border-brand-700 bg-brand-800 px-3 py-2 text-right font-semibold">
              <span className="inline-flex items-center justify-end gap-1">
                Meta <IconeInfo texto={EXPLICACAO_META_GERAL_MEDIA_PERIODO} />
              </span>
            </th>
            <th className="bg-brand-800 px-3 py-2 text-right font-semibold">
              <span className="inline-flex items-center justify-end gap-1">
                Realizado <IconeInfo texto={EXPLICACAO_REALIZADO_GERAL_MEDIA_PERIODO} />
              </span>
            </th>
            <th className="bg-brand-800 px-3 py-2 text-right font-semibold">
              <span className="inline-flex items-center justify-end gap-1">
                Atingimento <IconeInfo texto={EXPLICACAO_ATINGIMENTO_GERAL_PERIODO} />
              </span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr className="bg-brand-50/60">
            <td className="px-3 py-1.5 font-semibold text-slate-700">
              <span className="inline-flex items-center gap-1">
                Base Ativa (média) <IconeInfo texto={EXPLICACAO_BASE_ATIVA_MEDIA} />
              </span>
            </td>
            <td className="border-l-2 border-slate-200 px-3 py-1.5 text-right text-slate-300">—</td>
            <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-700">
              {formatarValor(mediaBaseAtiva)}
            </td>
            <td className="px-3 py-1.5 text-right text-slate-300">—</td>
            <td className="border-l-2 border-slate-200 bg-slate-100/70 px-3 py-1.5 text-right text-slate-300">—</td>
            <td className="bg-slate-100/70 px-3 py-1.5 text-right text-slate-300">—</td>
            <td className="bg-slate-100/70 px-3 py-1.5 text-right text-slate-300">—</td>
          </tr>
          {mediasPorIndicador.map(
            ({
              indicador,
              metaMedia,
              realizadoMedia,
              atingimentoPeriodo,
              quantidadeMesesApurados,
              quantidadeMesesNoPeriodo,
              metaGeralMedia,
              realizadoGeralMedia,
              atingimentoGeralPeriodo,
            }) => (
              <tr key={indicador.id}>
                <td className="px-3 py-1.5 font-medium text-slate-700">{indicador.nome}</td>
                <td className="border-l-2 border-slate-200 px-3 py-1.5 text-right tabular-nums text-slate-500">
                  {formatarValor(metaMedia, indicador.unidade)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-700">
                  {formatarValor(realizadoMedia, indicador.unidade)}
                  {quantidadeMesesApurados > 0 && quantidadeMesesApurados < quantidadeMesesNoPeriodo && (
                    <span className="ml-1 text-[10px] font-normal text-slate-400">
                      ({quantidadeMesesApurados}/{quantidadeMesesNoPeriodo})
                    </span>
                  )}
                </td>
                <td className={`px-3 py-1.5 text-right font-bold tabular-nums ${classeAtingimento(atingimentoPeriodo)}`}>
                  {formatarPercentual(atingimentoPeriodo)}
                </td>
                <td className="border-l-2 border-slate-200 bg-slate-50 px-3 py-1.5 text-right tabular-nums text-slate-500">
                  {formatarValor(metaGeralMedia, indicador.unidade)}
                </td>
                <td className="bg-slate-50 px-3 py-1.5 text-right tabular-nums font-medium text-slate-700">
                  {formatarValor(realizadoGeralMedia, indicador.unidade)}
                </td>
                <td className={`bg-slate-50 px-3 py-1.5 text-right font-bold tabular-nums ${classeAtingimento(atingimentoGeralPeriodo)}`}>
                  {formatarPercentual(atingimentoGeralPeriodo)}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
        Período: {mesesDisponiveis[mesInicial]}–{mesesDisponiveis[mesFinal]} ({quantidadeMeses}{' '}
        {quantidadeMeses === 1 ? 'mês' : 'meses'}). Meses sem apuração são ignorados nas médias.{' '}
        <span className="inline-flex items-center gap-1">
          <Filter className="size-3" aria-hidden="true" /> Por canal
        </span>{' '}
        respeita o filtro selecionado;{' '}
        <span className="inline-flex items-center gap-1">
          <Building2 className="size-3" aria-hidden="true" /> Geral da cidade
        </span>{' '}
        nunca muda com o filtro.
      </p>
    </div>
  );
}