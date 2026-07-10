import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import TendenciaBadge from './TendenciaBadge';
import BarraProgresso from './BarraProgresso';
import BadgeFwa from './BadgeFwa';
import BadgePlanoAcao from './BadgePlanoAcao';
import { formatarPercentual } from '../utils/format';

/**
 * Card de cidade para o ranking em mobile. Substitui a linha de tabela
 * por um bloco tocável único (alvo de toque de página inteira).
 */
export default function CardRankingCidade({ cidade, posicao, resumo, rotaBase = '' }) {
  return (
    <li>
      <Link
        to={`${rotaBase}/cidades/${cidade.id}`}
        className={`block rounded-xl border bg-white p-4 shadow-sm active:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700 ${
          cidade.status === 'vermelho' ? 'border-red-200' : 'border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-400">{posicao}º lugar</p>
            <p className="truncate text-base font-bold text-slate-900">{cidade.nome}</p>
            <p className="truncate text-sm text-slate-500">{cidade.gerente}</p>
          </div>
          <StatusBadge status={cidade.status} />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <BarraProgresso percentual={cidade.score} />
          </div>
          <span className="shrink-0 text-sm font-bold tabular-nums text-slate-800">
            {formatarPercentual(cidade.score)}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            {resumo.realizado.toLocaleString('pt-BR')} / {resumo.meta.toLocaleString('pt-BR')}{' '}
            <span className="text-xs">(meta)</span>
          </span>
          <TendenciaBadge tendencia={cidade.tendencia} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <BadgeFwa vendeFwa={cidade.vendeFwa} />
          <BadgePlanoAcao temPlanoAtivo={cidade.temPlanoAtivo} />
        </div>
      </Link>
    </li>
  );
}