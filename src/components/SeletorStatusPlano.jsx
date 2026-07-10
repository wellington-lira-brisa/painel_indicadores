import { useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { atualizarStatusPlano } from '../services/planoAcaoService';
import { STATUS_PLANO_CORES, STATUS_PLANO_OPCOES, normalizarStatusPlano } from '../utils/statusPlano';
import StatusPlanoBadge from './StatusPlanoBadge';

/**
 * Troca de status do plano de ação — ação independente da edição de
 * conteúdo (não precisa entrar no modo "Editar" pra mudar só o status).
 *
 * `podeAlterar` decide entre o <select> interativo e o badge estático;
 * a checagem real de permissão continua no banco (RLS da mesma policy de
 * UPDATE já usada pelo resto do plano) — isto aqui é só a UX, igual ao
 * padrão já usado em `podeEditar`/`podeExcluir` no restante da tela.
 */
export default function SeletorStatusPlano({ plano, podeAlterar, aoAtualizarPlano }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const statusAtual = normalizarStatusPlano(plano.status);

  async function aoMudarStatus(evento) {
    const novoStatus = evento.target.value;
    if (novoStatus === statusAtual) return;

    setErro(null);
    setSalvando(true);
    try {
      const atualizado = await atualizarStatusPlano(plano.id, novoStatus);
      aoAtualizarPlano(atualizado);
    } catch (excecao) {
      setErro(excecao.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!podeAlterar) {
    return <StatusPlanoBadge status={statusAtual} />;
  }

  return (
    <div className="min-w-0">
      <div className="relative inline-flex min-w-0 max-w-full">
        <select
          aria-label="Status do plano"
          value={statusAtual}
          onChange={aoMudarStatus}
          disabled={salvando}
          className={`min-h-[36px] appearance-none rounded-full py-1 pl-3 pr-8 text-xs font-semibold ring-1 ring-inset transition disabled:opacity-60 ${STATUS_PLANO_CORES[statusAtual]}`}
        >
          {STATUS_PLANO_OPCOES.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
        {salvando ? (
          <Loader2
            className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin"
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 opacity-70"
            aria-hidden="true"
          />
        )}
      </div>
      {erro && <p role="alert" className="mt-1 text-xs text-red-600">{erro}</p>}
    </div>
  );
}