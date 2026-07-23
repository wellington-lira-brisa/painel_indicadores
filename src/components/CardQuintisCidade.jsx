import { useId, useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import {
  QUINTIL_COR_BADGE,
  QUINTIL_COR_BARRA,
  QUINTIL_ROTULOS_CURTOS,
  EXPLICACAO_QUINTIL_CIDADE,
} from '../utils/quintil';
import { formatarPercentual, formatarValor } from '../utils/format';
import IconeInfo from './IconeInfo';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-07-01" -> "jul/2026" — só partes da string, sem Date (evita fuso). */
function rotuloMes(mesRef) {
  const [ano, mes] = mesRef.split('-');
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano}`;
}

function estiloLinha(quintil) {
  if (quintil === 5) return 'border-l-red-400 bg-red-50/30';
  if (quintil === 4) return 'border-l-orange-400 bg-orange-50/30';
  if (quintil === 1) return 'border-l-emerald-400';
  if (quintil === 2) return 'border-l-lime-400';
  if (quintil === 3) return 'border-l-amber-400';
  return 'border-l-slate-300';
}

function BadgeQuintilVendedor({ quintil }) {
  if (!quintil) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
        Sem meta
      </span>
    );
  }

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${QUINTIL_COR_BADGE[quintil]}`}>
      {QUINTIL_ROTULOS_CURTOS[quintil]}
    </span>
  );
}

function CanaisVendedor({ canais = [] }) {
  if (canais.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {canais.map((canal) => (
        <span
          key={canal}
          className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500"
        >
          {canal}
        </span>
      ))}
    </span>
  );
}

function ValorVendedor({ rotulo, valor, percentual = false, destaque = false }) {
  return (
    <div className="min-w-0">
      <span className="block text-[9px] font-medium uppercase tracking-wide text-slate-400 sm:sr-only">
        {rotulo}
      </span>
      <span className={`block truncate text-xs tabular-nums ${destaque ? 'font-bold text-slate-800' : 'font-medium text-slate-600'}`}>
        {valor === null
          ? '—'
          : percentual
            ? formatarPercentual(valor * 100)
            : formatarValor(valor, 'Qtd')}
      </span>
    </div>
  );
}

function TabelaVendedores({ vendedores = [] }) {
  const [expandida, setExpandida] = useState(true);
  const conteudoId = useId();

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className={`flex flex-wrap items-center justify-between gap-2 ${expandida ? 'mb-2.5' : ''}`}>
        <div>
          <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <Users className="size-3.5 text-slate-400" aria-hidden="true" />
            Colaboradores
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-500">Ordenados do melhor quintil para o que exige mais atenção.</p>
        </div>
        <div className="flex items-center gap-2">
          {vendedores.length > 0 && (
            <span className="text-[11px] tabular-nums text-slate-400">
              {vendedores.length} {vendedores.length === 1 ? 'vendedor' : 'vendedores'}
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpandida((valorAtual) => !valorAtual)}
            aria-expanded={expandida}
            aria-controls={conteudoId}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {expandida ? 'Recolher' : 'Expandir'}
            <ChevronDown
              className={`size-3.5 transition-transform duration-200 ${expandida ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {expandida && (
        <div id={conteudoId}>
          {vendedores.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
              Detalhamento individual ainda não disponível para este período.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="hidden grid-cols-[minmax(0,1.8fr)_5rem_6rem_6rem_7rem] gap-3 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:grid">
                <span>Colaborador</span>
                <span>Quintil</span>
                <span className="text-right">Meta</span>
                <span className="text-right">Realizado</span>
                <span className="text-right">Atingimento</span>
              </div>

              <ul className="divide-y divide-slate-100" aria-label="Desempenho dos colaboradores por quintil">
                {vendedores.map((vendedor, indice) => (
                  <li
                    key={`${vendedor.vendedor}-${indice}`}
                    className={`grid grid-cols-3 gap-x-3 gap-y-2 border-l-2 px-3 py-3 sm:grid-cols-[minmax(0,1.8fr)_5rem_6rem_6rem_7rem] sm:items-center sm:gap-3 sm:py-2.5 ${estiloLinha(vendedor.quintil)}`}
                  >
                    <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:col-span-1">
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-800" title={vendedor.vendedor}>
                        {vendedor.vendedor}
                      </span>
                      <CanaisVendedor canais={vendedor.canais} />
                    </span>
                    <span className="justify-self-end sm:justify-self-start">
                      <BadgeQuintilVendedor quintil={vendedor.quintil} />
                    </span>
                    <span className="sm:text-right">
                      <ValorVendedor rotulo="Meta" valor={vendedor.meta} />
                    </span>
                    <span className="sm:text-right">
                      <ValorVendedor rotulo="Realizado" valor={vendedor.realizado} />
                    </span>
                    <span className="sm:text-right">
                      <ValorVendedor rotulo="Atingimento" valor={vendedor.atingimento} percentual destaque />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Distribuição do time da cidade por quintil (TAM) — mesmo padrão visual
 * do CardDistribuicaoStatus do Ranking: barra segmentada proporcional +
 * legenda com contagens. Faixa "Sem meta" (cinza) entra na barra e na
 * legenda pra soma sempre bater com o total de vendedores — nenhum
 * vendedor "some" da visão.
 */
export default function CardQuintisCidade({ registro }) {
  const faixas = [
    { chave: 1, qtd: registro.q1 },
    { chave: 2, qtd: registro.q2 },
    { chave: 3, qtd: registro.q3 },
    { chave: 4, qtd: registro.q4 },
    { chave: 5, qtd: registro.q5 },
  ];
  const total = registro.totalVendedores;

  return (
    <section aria-label="Distribuição do time por quintil" className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Time por quintil · {rotuloMes(registro.mesRef)}
          <IconeInfo texto={EXPLICACAO_QUINTIL_CIDADE} />
        </h3>
        <span className="text-xs tabular-nums text-slate-500">
          {total} vendedor(es) · atingimento médio {Math.round(registro.atingimentoMedio * 100)}%
        </span>
      </div>

      <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Distribuição de ${total} vendedores por quintil`}>
        {faixas.map(({ chave, qtd }) =>
          qtd > 0 ? (
            <div key={chave} className={QUINTIL_COR_BARRA[chave]} style={{ width: `${(qtd / total) * 100}%` }} />
          ) : null,
        )}
        {registro.semMeta > 0 && <div className="bg-slate-300" style={{ width: `${(registro.semMeta / total) * 100}%` }} />}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {faixas.map(({ chave, qtd }) => (
          <li key={chave} className="inline-flex items-center gap-1.5 tabular-nums">
            <span className={`size-2 rounded-full ${QUINTIL_COR_BARRA[chave]}`} aria-hidden="true" />
            {QUINTIL_ROTULOS_CURTOS[chave]}: <strong className="font-semibold text-slate-800">{qtd}</strong>
          </li>
        ))}
        {registro.semMeta > 0 && (
          <li className="inline-flex items-center gap-1.5 tabular-nums">
            <span className="size-2 rounded-full bg-slate-300" aria-hidden="true" />
            Sem meta: <strong className="font-semibold text-slate-800">{registro.semMeta}</strong>
          </li>
        )}
      </ul>

      <TabelaVendedores vendedores={registro.vendedores} />
    </section>
  );
}