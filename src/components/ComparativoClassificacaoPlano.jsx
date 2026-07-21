import { ArrowRight, TrendingDown, TrendingUp, Minus, HelpCircle, ChevronDown } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { compararClassificacoes } from '../utils/status';
import { formatarValor, formatarPercentual } from '../utils/format';

const INTERPRETACAO = {
  melhorou: {
    Icone: TrendingUp,
    classe: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    texto: 'A cidade melhorou de classificação desde a criação deste plano.',
  },
  piorou: {
    Icone: TrendingDown,
    classe: 'text-red-700 bg-red-50 border-red-200',
    texto: 'A cidade piorou de classificação desde a criação deste plano.',
  },
  igual: {
    Icone: Minus,
    classe: 'text-slate-600 bg-slate-50 border-slate-200',
    texto: 'Sem mudança de classificação desde a criação deste plano.',
  },
  indeterminado: {
    Icone: HelpCircle,
    classe: 'text-slate-500 bg-slate-50 border-slate-200',
    texto: 'Não é possível comparar — falta classificação de um dos dois momentos (plano criado antes desta funcionalidade existir, ou cidade sem meta cadastrada em algum dos momentos).',
  },
};

/**
 * Comparativo "então vs. agora": classificação da cidade quando o plano
 * foi criado (congelada em `plano.classificacaoNoMomento`, nunca muda)
 * contra a classificação ATUAL (`statusCidadeAgora`, recalculada toda
 * vez que a página carrega, a partir do CSV publicado). É a resposta
 * direta a "esse plano contribuiu pra melhoria?" — ver o pedido de
 * arquitetura original (medir efetividade sem perder o histórico).
 *
 * `plano.classificacaoNoMomento === null` cobre planos criados antes da
 * migration 20260720120000 existir — não dá pra reconstruir esse
 * contexto retroativamente, então o comparativo aparece como
 * "indeterminado", nunca inventa um valor.
 *
 * `indicadoresMotivadores`, quando presente, vira uma lista recolhível
 * com o detalhe por indicador (meta/realizado/atingimento) tal como
 * estava no momento da criação — o "porquê" por trás da classificação.
 */
export default function ComparativoClassificacaoPlano({ classificacaoNaCriacao, statusCidadeAgora, indicadoresMotivadores }) {
  const resultado = compararClassificacoes(classificacaoNaCriacao, statusCidadeAgora);
  const { Icone, classe, texto } = INTERPRETACAO[resultado];
  const indicadoresComDado = (indicadoresMotivadores ?? []).filter((i) => i.atingimento !== null);

  return (
    <div className={`rounded-xl border p-3 ${classe}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Quando criado
        </div>
        {classificacaoNaCriacao ? <StatusBadge status={classificacaoNaCriacao} /> : <span className="text-sm text-slate-400">Não registrado</span>}

        <ArrowRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />

        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Agora
        </div>
        {statusCidadeAgora ? <StatusBadge status={statusCidadeAgora} /> : <span className="text-sm text-slate-400">—</span>}
      </div>

      <p className="mt-2 flex items-start gap-1.5 text-sm font-medium">
        <Icone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {texto}
      </p>

      {indicadoresComDado.length > 0 && (
        <details className="mt-3 border-t border-current/10 pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-800">
            <ChevronDown className="size-3.5 shrink-0 transition-transform [details[open]_&]:rotate-180" aria-hidden="true" />
            Indicadores no momento da criação ({indicadoresComDado.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {indicadoresComDado.map((ind) => (
              <li key={ind.indicadorId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-white/60 px-2 py-1.5 text-xs">
                <span className="font-medium text-slate-700">{ind.nome}</span>
                <span className="tabular-nums text-slate-500">
                  {formatarValor(ind.realizado)} / {formatarValor(ind.meta)} · {formatarPercentual(ind.atingimento)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}