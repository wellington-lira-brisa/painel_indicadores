import { CheckCircle2, XCircle } from 'lucide-react';

/**
 * Indica se a cidade tem pelo menos um plano de ação ativo (não iniciado,
 * em andamento ou aguardando — ver STATUS_PLANO_ATIVO em
 * planoAcaoService.js). `title` funciona como tooltip nativo em desktop e
 * mobile (toque prolongado), sem depender de nenhuma lib de tooltip.
 */
export default function BadgePlanoAcao({ temPlanoAtivo }) {
  return (
    <span
      title={
        temPlanoAtivo
          ? 'Cidade possui plano de ação em andamento.'
          : 'Cidade ainda não possui plano de ação em andamento.'
      }
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        temPlanoAtivo
          ? 'bg-emerald-100 text-emerald-800 ring-emerald-600/20'
          : 'bg-slate-100 text-slate-600 ring-slate-500/20'
      }`}
    >
      {temPlanoAtivo ? (
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
      ) : (
        <XCircle className="size-3.5" aria-hidden="true" />
      )}
      {temPlanoAtivo ? 'Com plano' : 'Sem plano'}
    </span>
  );
}