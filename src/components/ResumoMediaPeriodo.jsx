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

function classeAtingimento(valor) {
  return valor === null ? 'text-slate-400' : STATUS_COR_TEXTO[classificarAtingimento(valor)];
}

/** Versão desktop: tabela de 7 colunas com dois blocos de cor. */
function TabelaDesktop({ mediasPorIndicador, mediaBaseAtiva, mesInicial, mesFinal, mesesDisponiveis, quantidadeMeses }) {
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
              <span className="inline-flex items-center justify-end gap-1">Meta <IconeInfo texto={EXPLICACAO_META_MEDIA_PERIODO} /></span>
            </th>
            <th className="bg-brand-900 px-3 py-2 text-right font-semibold">
              <span className="inline-flex items-center justify-end gap-1">Realizado <IconeInfo texto={EXPLICACAO_REALIZADO_MEDIA_PERIODO} /></span>
            </th>
            <th className="bg-brand-900 px-3 py-2 text-right font-semibold">
              <span className="inline-flex items-center justify-end gap-1">Atingimento <IconeInfo texto={EXPLICACAO_ATINGIMENTO_PERIODO} /></span>
            </th>
            <th className="border-l-2 border-brand-700 bg-brand-800 px-3 py-2 text-right font-semibold">
              <span className="inline-flex items-center justify-end gap-1">Meta <IconeInfo texto={EXPLICACAO_META_GERAL_MEDIA_PERIODO} /></span>
            </th>
            <th className="bg-brand-800 px-3 py-2 text-right font-semibold">
              <span className="inline-flex items-center justify-end gap-1">Realizado <IconeInfo texto={EXPLICACAO_REALIZADO_GERAL_MEDIA_PERIODO} /></span>
            </th>
            <th className="bg-brand-800 px-3 py-2 text-right font-semibold">
              <span className="inline-flex items-center justify-end gap-1">Atingimento <IconeInfo texto={EXPLICACAO_ATINGIMENTO_GERAL_PERIODO} /></span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          <tr className="bg-brand-50/60">
            <td className="px-3 py-1.5 font-semibold text-slate-700">
              <span className="inline-flex items-center gap-1">Base Ativa (média) <IconeInfo texto={EXPLICACAO_BASE_ATIVA_MEDIA} /></span>
            </td>
            <td className="border-l-2 border-slate-200 px-3 py-1.5 text-right text-slate-300">—</td>
            <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-700">{formatarValor(mediaBaseAtiva)}</td>
            <td className="px-3 py-1.5 text-right text-slate-300">—</td>
            <td className="border-l-2 border-slate-200 bg-slate-100/70 px-3 py-1.5 text-right text-slate-300">—</td>
            <td className="bg-slate-100/70 px-3 py-1.5 text-right text-slate-300">—</td>
            <td className="bg-slate-100/70 px-3 py-1.5 text-right text-slate-300">—</td>
          </tr>
          {mediasPorIndicador.map(({ indicador, metaMedia, realizadoMedia, atingimentoPeriodo, quantidadeMesesApurados, quantidadeMesesNoPeriodo, metaGeralMedia, realizadoGeralMedia, atingimentoGeralPeriodo }) => (
            <tr key={indicador.id}>
              <td className="px-3 py-1.5 font-medium text-slate-700">{indicador.nome}</td>
              <td className="border-l-2 border-slate-200 px-3 py-1.5 text-right tabular-nums text-slate-500">{formatarValor(metaMedia, indicador.unidade)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-700">
                {formatarValor(realizadoMedia, indicador.unidade)}
                {quantidadeMesesApurados > 0 && quantidadeMesesApurados < quantidadeMesesNoPeriodo && (
                  <span className="ml-1 text-[10px] font-normal text-slate-400">({quantidadeMesesApurados}/{quantidadeMesesNoPeriodo})</span>
                )}
              </td>
              <td className={`px-3 py-1.5 text-right font-bold tabular-nums ${classeAtingimento(atingimentoPeriodo)}`}>{formatarPercentual(atingimentoPeriodo)}</td>
              <td className="border-l-2 border-slate-200 bg-slate-50 px-3 py-1.5 text-right tabular-nums text-slate-500">{formatarValor(metaGeralMedia, indicador.unidade)}</td>
              <td className="bg-slate-50 px-3 py-1.5 text-right tabular-nums font-medium text-slate-700">{formatarValor(realizadoGeralMedia, indicador.unidade)}</td>
              <td className={`bg-slate-50 px-3 py-1.5 text-right font-bold tabular-nums ${classeAtingimento(atingimentoGeralPeriodo)}`}>{formatarPercentual(atingimentoGeralPeriodo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <RodapeMediaPeriodo mesInicial={mesInicial} mesFinal={mesFinal} mesesDisponiveis={mesesDisponiveis} quantidadeMeses={quantidadeMeses} />
    </div>
  );
}

/**
 * Versão mobile: card por indicador com dois blocos empilhados
 * (Por canal / Geral da cidade). Hierarquia clara, área de toque confortável,
 * zero rolagem horizontal — ilegível na tabela de 7 colunas em 375px.
 */
function CardsIndicadorMobile({ mediasPorIndicador, mediaBaseAtiva, mesInicial, mesFinal, mesesDisponiveis, quantidadeMeses }) {
  return (
    <div className="space-y-3">
      {/* Base Ativa */}
      <div className="rounded-xl border border-slate-200 bg-brand-50/60 px-4 py-3 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-slate-700 inline-flex items-center gap-1">
          Base Ativa (média) <IconeInfo texto={EXPLICACAO_BASE_ATIVA_MEDIA} />
        </p>
        <p className="text-lg font-bold tabular-nums text-slate-800">{formatarValor(mediaBaseAtiva)}</p>
      </div>

      {mediasPorIndicador.map(({ indicador, metaMedia, realizadoMedia, atingimentoPeriodo, quantidadeMesesApurados, quantidadeMesesNoPeriodo, metaGeralMedia, realizadoGeralMedia, atingimentoGeralPeriodo }) => (
        <div key={indicador.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Nome do indicador */}
          <div className="bg-brand-900 px-4 py-2">
            <p className="text-xs font-semibold text-white">{indicador.nome}</p>
          </div>

          <div className="divide-y divide-slate-100">
            {/* Por canal */}
            <div className="px-4 py-3">
              <p className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                <Filter className="size-3" aria-hidden="true" /> Por canal
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-slate-400 inline-flex items-center justify-center gap-0.5">Meta <IconeInfo texto={EXPLICACAO_META_MEDIA_PERIODO} /></p>
                  <p className="text-sm font-medium tabular-nums text-slate-600">{formatarValor(metaMedia, indicador.unidade)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 inline-flex items-center justify-center gap-0.5">Realizado <IconeInfo texto={EXPLICACAO_REALIZADO_MEDIA_PERIODO} /></p>
                  <p className="text-sm font-semibold tabular-nums text-slate-800">
                    {formatarValor(realizadoMedia, indicador.unidade)}
                    {quantidadeMesesApurados > 0 && quantidadeMesesApurados < quantidadeMesesNoPeriodo && (
                      <span className="ml-0.5 text-[10px] font-normal text-slate-400">({quantidadeMesesApurados}/{quantidadeMesesNoPeriodo})</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 inline-flex items-center justify-center gap-0.5">Ating. <IconeInfo texto={EXPLICACAO_ATINGIMENTO_PERIODO} /></p>
                  <p className={`text-sm font-bold tabular-nums ${classeAtingimento(atingimentoPeriodo)}`}>{formatarPercentual(atingimentoPeriodo)}</p>
                </div>
              </div>
            </div>

            {/* Geral da cidade */}
            <div className="bg-slate-50 px-4 py-3">
              <p className="mb-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Building2 className="size-3" aria-hidden="true" /> Geral da cidade
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-slate-400 inline-flex items-center justify-center gap-0.5">Meta <IconeInfo texto={EXPLICACAO_META_GERAL_MEDIA_PERIODO} /></p>
                  <p className="text-sm font-medium tabular-nums text-slate-600">{formatarValor(metaGeralMedia, indicador.unidade)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 inline-flex items-center justify-center gap-0.5">Realizado <IconeInfo texto={EXPLICACAO_REALIZADO_GERAL_MEDIA_PERIODO} /></p>
                  <p className="text-sm font-semibold tabular-nums text-slate-800">{formatarValor(realizadoGeralMedia, indicador.unidade)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 inline-flex items-center justify-center gap-0.5">Ating. <IconeInfo texto={EXPLICACAO_ATINGIMENTO_GERAL_PERIODO} /></p>
                  <p className={`text-sm font-bold tabular-nums ${classeAtingimento(atingimentoGeralPeriodo)}`}>{formatarPercentual(atingimentoGeralPeriodo)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      <RodapeMediaPeriodo mesInicial={mesInicial} mesFinal={mesFinal} mesesDisponiveis={mesesDisponiveis} quantidadeMeses={quantidadeMeses} />
    </div>
  );
}

function RodapeMediaPeriodo({ mesInicial, mesFinal, mesesDisponiveis, quantidadeMeses }) {
  return (
    <p className="px-3 py-2 text-[11px] text-slate-500">
      Período: {mesesDisponiveis[mesInicial]}–{mesesDisponiveis[mesFinal]} ({quantidadeMeses}{' '}
      {quantidadeMeses === 1 ? 'mês' : 'meses'}). Meses sem apuração são ignorados nas médias.{' '}
      <span className="inline-flex items-center gap-1"><Filter className="size-3" aria-hidden="true" /> Por canal</span>{' '}
      respeita o filtro selecionado;{' '}
      <span className="inline-flex items-center gap-1"><Building2 className="size-3" aria-hidden="true" /> Geral da cidade</span>{' '}
      nunca muda com o filtro.
    </p>
  );
}

/**
 * Resumo das médias do período selecionado, por indicador.
 * Desktop (sm+): tabela de 7 colunas com dois blocos de cor.
 * Mobile (<sm): cards por indicador com blocos empilhados (Por canal / Geral).
 */
export default function ResumoMediaPeriodo({ mediasPorIndicador, mediaBaseAtiva, mesInicial, mesFinal, mesesDisponiveis, quantidadeMeses }) {
  const props = { mediasPorIndicador, mediaBaseAtiva, mesInicial, mesFinal, mesesDisponiveis, quantidadeMeses };
  return (
    <>
      <div className="hidden sm:block">
        <TabelaDesktop {...props} />
      </div>
      <div className="sm:hidden">
        <CardsIndicadorMobile {...props} />
      </div>
    </>
  );
}