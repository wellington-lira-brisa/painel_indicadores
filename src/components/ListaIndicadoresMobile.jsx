import { ChevronDown, Inbox } from 'lucide-react';
import { MESES, ANO_PAINEL } from '../data/mockCidades';
import {
  atingimentoIndicador,
  atingimentoMes,
  classificarAtingimento,
  ultimoMesApurado,
  STATUS_COR_TEXTO,
} from '../utils/status';
import { formatarValor, formatarPercentual } from '../utils/format';
import FeriadosMes from './FeriadosMes';

const COR_FUNDO = {
  verde: 'bg-emerald-50',
  amarelo: 'bg-amber-50',
  vermelho: 'bg-red-50',
};

/**
 * Versão mobile de TabelaIndicadores: Base Ativa em destaque no topo e um
 * card por indicador, com resumo do último mês apurado sempre visível e
 * detalhe mensal (com semanas e feriados, quando ligados) em <details>.
 * Evita tabela larga com scroll horizontal em telas pequenas.
 */
export default function ListaIndicadoresMobile({
  indicadores,
  baseAtiva,
  cidade,
  indicesVisiveis,
  mostrarSemanas,
  indiceMesAtual,
  className = '',
}) {
  if (!baseAtiva && indicadores.length === 0) {
    return (
      <div className={`flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center ${className}`}>
        <Inbox className="size-7 text-slate-300" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-600">Nenhum indicador configurado.</p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {baseAtiva && <CardBaseAtiva baseAtiva={baseAtiva} indicesVisiveis={indicesVisiveis} />}
      {indicadores.map((indicador) => (
        <CardIndicador
          key={indicador.id}
          indicador={indicador}
          cidade={cidade}
          indicesVisiveis={indicesVisiveis}
          mostrarSemanas={mostrarSemanas}
          indiceMesAtual={indiceMesAtual}
        />
      ))}
      <p className="px-1 text-xs text-slate-500">
        Toque em um indicador para ver o histórico mensal. Para churn e
        cancelamento, valores menores são melhores.
      </p>
    </div>
  );
}

function CardBaseAtiva({ baseAtiva, indicesVisiveis }) {
  const ultimoIndice = indicesVisiveis.at(-1);
  const valorAtual = baseAtiva[ultimoIndice]?.valor;

  return (
    <div className="rounded-xl border border-slate-200 bg-brand-50/60 px-4 py-3 shadow-sm">
      <p className="text-sm font-semibold text-slate-800">Base Ativa</p>
      <p className="mt-0.5 text-xs text-slate-500">
        {MESES[ultimoIndice]}: <span className="font-semibold text-slate-700">{formatarValor(valorAtual)}</span>
      </p>
    </div>
  );
}

function CardIndicador({ indicador, cidade, indicesVisiveis, mostrarSemanas, indiceMesAtual }) {
  const atingimentoGeral = atingimentoIndicador(indicador);
  const status = atingimentoGeral === null ? null : classificarAtingimento(atingimentoGeral);
  const ultimoMes = ultimoMesApurado(indicador);
  const ultimoMesEhAtual = ultimoMes?.mes === MESES[indiceMesAtual];

  return (
    <details className="group rounded-xl border border-slate-200 bg-white shadow-sm open:shadow-md">
      <summary
        className={`flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 [&::-webkit-details-marker]:hidden ${
          status ? COR_FUNDO[status] : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{indicador.nome}</p>
          {ultimoMes ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              {ultimoMesEhAtual && (
                <span className="rounded-full bg-brand-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  atual
                </span>
              )}
              {ultimoMes.mes}: meta {formatarValor(ultimoMes.meta, indicador.unidade)} · realizado{' '}
              <span className={STATUS_COR_TEXTO[classificarAtingimento(atingimentoMes(indicador, ultimoMes) ?? 0)]}>
                {formatarValor(ultimoMes.realizado, indicador.unidade)}
              </span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-400">Nenhum mês apurado</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`text-sm font-bold tabular-nums ${
              status ? STATUS_COR_TEXTO[status] : 'text-slate-400'
            }`}
          >
            {formatarPercentual(atingimentoGeral)}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </div>
      </summary>

      <div className="border-t border-slate-100 px-4 py-3">
        <ul className="divide-y divide-slate-100">
          {indicesVisiveis.map((i) => {
            const mes = indicador.meses[i];
            const atingimentoDoMes = atingimentoMes(indicador, mes);
            const emDestaque = i === indiceMesAtual;
            return (
              <li key={mes.mes} className={`py-2 text-sm ${emDestaque ? 'rounded-md bg-brand-50/50 px-1.5' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex shrink-0 items-center gap-1 font-medium text-slate-500">
                    {mes.mes}
                    <FeriadosMes
                      cidade={cidade}
                      ano={ANO_PAINEL}
                      mesIndice={i}
                      className="text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    />
                  </span>
                  <span className="flex-1 text-right tabular-nums text-slate-500">
                    meta {formatarValor(mes.meta, indicador.unidade)}
                  </span>
                  <span
                    className={`flex-1 text-right font-medium tabular-nums ${
                      atingimentoDoMes === null ? 'text-slate-400' : STATUS_COR_TEXTO[classificarAtingimento(atingimentoDoMes)]
                    }`}
                  >
                    {formatarValor(mes.realizado, indicador.unidade)}
                  </span>
                </div>

                {mostrarSemanas && (
                  <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-1 text-[11px] text-slate-400">
                    {mes.semanas.map((semana) => (
                      <li key={semana.numero} title={`Dias ${semana.diaInicio}–${semana.diaFim}`}>
                        S{semana.numero}: {formatarValor(semana.valor, indicador.unidade)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}