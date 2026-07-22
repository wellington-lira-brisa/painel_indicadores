import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import BarraProgresso from './BarraProgresso';
import BadgeFwa from './BadgeFwa';
import BadgePlanoAcao from './BadgePlanoAcao';
import IconeInfo from './IconeInfo';
import { formatarPercentual, formatarValor } from '../utils/format';
import { EXPLICACAO_META_REALIZADO_GERAL, EXPLICACAO_ATINGIMENTO } from '../utils/status';
import BadgeQuintil from './BadgeQuintil';

const COR_ACENTO_STATUS = {
  verde: 'border-l-emerald-400',
  amarelo: 'border-l-amber-400',
  vermelho: 'border-l-red-400',
  'sem-dado': 'border-l-slate-200',
};

/**
 * Card de cidade para o ranking em mobile. Substitui a linha de tabela
 * por um bloco tocável único (alvo de toque de página inteira). Mesmo
 * acento de status (borda esquerda colorida) e chip de posição do
 * top-3 usados na tabela desktop — consistência visual entre as duas.
 */
export default function CardRankingCidade({ cidade, posicao, resumo, rotaBase = '', sufixoRota = '' }) {
  return (
    <li>
      <Link
        to={`${rotaBase}/cidades/${cidade.id}${sufixoRota}`}
        className={`block rounded-xl border-y border-r border-l-2 border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700 ${
          COR_ACENTO_STATUS[cidade.status] ?? 'border-l-transparent'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {posicao <= 3 ? (
              <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold tabular-nums text-brand-700">
                {posicao}
              </span>
            ) : (
              <span className="mt-0.5 shrink-0 text-xs font-medium tabular-nums text-slate-400">{posicao}º</span>
            )}
            <div className="min-w-0">
              <p className="text-base font-bold leading-snug text-slate-900">{cidade.nome}</p>
              <p className="truncate text-sm text-slate-500">{cidade.gerente ?? '—'}</p>
            </div>
          </div>
          <StatusBadge status={cidade.status} />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <BarraProgresso percentual={resumo.atingimento} />
          </div>
          <span className="shrink-0 text-sm font-bold tabular-nums text-slate-800">
            {formatarPercentual(resumo.atingimento)}
          </span>
          <IconeInfo texto={EXPLICACAO_ATINGIMENTO} />
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-0.5 text-slate-500">
            {formatarValor(resumo.realizado)} / {formatarValor(resumo.meta)}{' '}
            <span className="text-xs">(meta)</span>
            <IconeInfo texto={EXPLICACAO_META_REALIZADO_GERAL} />
          </span>
          <BadgeQuintil registro={cidade.quintil} curto />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <BadgeFwa vendeFwa={cidade.vendeFwa} />
          <BadgePlanoAcao temPlanoAtivo={cidade.temPlanoAtivo} />
        </div>
      </Link>
    </li>
  );
}