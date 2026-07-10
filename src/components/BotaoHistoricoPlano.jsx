import { useState } from 'react';
import { History } from 'lucide-react';
import HistoricoPlanoModal from './HistoricoPlanoModal';

/** Abre a timeline de alterações do plano. Não carrega nada até ser clicado. */
export default function BotaoHistoricoPlano({ planoId }) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        aria-label="Ver histórico de alterações do plano"
      >
        <History className="size-3.5" aria-hidden="true" />
        Histórico
      </button>

      {aberto && <HistoricoPlanoModal planoId={planoId} aoFechar={() => setAberto(false)} />}
    </>
  );
}