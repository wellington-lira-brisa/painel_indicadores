import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import BarraProgresso from './BarraProgresso';
import BadgeFwa from './BadgeFwa';
import BadgePlanoAcao from './BadgePlanoAcao';
import IconeInfo from './IconeInfo';
import { formatarPercentual, formatarValor } from '../utils/format';
import { EXPLICACAO_PROJECAO_FECHAMENTO, EXPLICACAO_META_REALIZADO_GERAL, EXPLICACAO_ATINGIMENTO } from '../utils/status';

/**
 * Card de cidade para o ranking em mobile. Substitui a linha de tabela
 * por um bloco tocável único (alvo de toque de página inteira).
 */
export default function CardRankingCidade({ cidade, posicao, resumo, rotaBase = '', sufixoRota = '' }) {
  return (
    <li>
      <Link
        to={`${rotaBase}/cidades/${cidade.id}${sufixoRota}`}
        className={`block rounded-xl border bg-white p-4 shadow-sm active:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700 ${
          cidade.status === 'vermelho' ? 'border-red-200' : 'border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-400">{posicao}º lugar</p>
            <p className="truncate text-base font-bold text-slate-900">{cidade.nome}</p>
            <p className="truncate text-sm text-slate-500">{cidade.gerente ?? '—'}</p>
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
          <span className="font-semibold tabular-nums text-slate-700">
            {formatarValor(resumo.projecaoFechamento, resumo.unidade)}{' '}
            <span className="inline-flex items-center gap-0.5 text-xs font-normal text-slate-400">
              (projeção) <IconeInfo texto={EXPLICACAO_PROJECAO_FECHAMENTO} />
            </span>
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <BadgeFwa vendeFwa={cidade.vendeFwa} />
          <BadgePlanoAcao temPlanoAtivo={cidade.temPlanoAtivo} />
        </div>
      </Link>
    </li>
  );
}