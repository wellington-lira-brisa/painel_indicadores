import { useState } from 'react';
import { ChevronDown, Copy, Pencil, Trash2 } from 'lucide-react';
import { alternarAtivoConvite, excluirConvite } from '../services/convitesAdminService';
import { formatarDataHora } from '../utils/format';
import { PAPEL_ROTULOS } from '../services/permissaoService';
import LinhaInfo from './LinhaInfo';

function statusConvite(convite) {
  if (!convite.ativo) return { rotulo: 'Inativo', classes: 'bg-slate-100 text-slate-600' };
  if (convite.expiraEm && new Date(convite.expiraEm) < new Date()) {
    return { rotulo: 'Expirado', classes: 'bg-slate-100 text-slate-600' };
  }
  if (convite.limiteUsos !== null && convite.usosAtuais >= convite.limiteUsos) {
    return { rotulo: 'Esgotado', classes: 'bg-slate-100 text-slate-600' };
  }
  return { rotulo: 'Ativo', classes: 'bg-emerald-100 text-emerald-800' };
}

export default function CardConvite({ convite, aoAtualizar, aoRemover, aoEditar }) {
  const [copiado, setCopiado] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [erro, setErro] = useState(null);

  const status = statusConvite(convite);

  async function aoCopiar() {
    await navigator.clipboard.writeText(convite.codigo);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  async function aoAlternarAtivo() {
    setErro(null);
    setProcessando(true);
    try {
      await alternarAtivoConvite(convite.codigo, !convite.ativo);
      aoAtualizar({ ...convite, ativo: !convite.ativo });
    } catch (excecao) {
      setErro(excecao.message);
    } finally {
      setProcessando(false);
    }
  }

  async function aoConfirmarExclusao() {
    setErro(null);
    setProcessando(true);
    try {
      await excluirConvite(convite.codigo);
      aoRemover(convite.codigo);
    } catch (excecao) {
      setErro(excecao.message);
      setProcessando(false);
    }
  }

  return (
    <details className="group rounded-xl border border-slate-200 bg-white shadow-sm open:shadow-md">
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold text-slate-800">{convite.codigo}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {convite.usosAtuais} / {convite.limiteUsos ?? '∞'} usos
            {convite.descricao ? ` · ${convite.descricao}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.classes}`}>
            {status.rotulo}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </div>
      </summary>

      <div className="border-t border-slate-100 px-4 py-4">
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-sm">
            {convite.codigo}
          </code>
          <button
            type="button"
            onClick={aoCopiar}
            className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Copy className="size-4" aria-hidden="true" />
            {copiado ? 'Copiado!' : 'Copiar'}
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <LinhaInfo rotulo="Perfil associado" valor={PAPEL_ROTULOS[convite.papelAssociado] ?? '—'} />
          <LinhaInfo rotulo="Matrícula permitida" valor={convite.matriculaPermitida ?? 'Qualquer uma'} />
          <LinhaInfo rotulo="Expira em" valor={convite.expiraEm ? formatarDataHora(convite.expiraEm) : 'Nunca'} />
          <LinhaInfo rotulo="Criado por" valor={convite.criadoPorNome ?? '—'} />
          <LinhaInfo rotulo="Criado em" valor={formatarDataHora(convite.criadoEm)} />
        </dl>

        {convite.observacoes && (
          <p className="mt-3 break-words rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {convite.observacoes}
          </p>
        )}

        {erro && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {erro}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => aoEditar(convite)}
            className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Pencil className="size-4" aria-hidden="true" />
            Editar
          </button>
          <button
            type="button"
            onClick={aoAlternarAtivo}
            disabled={processando}
            className="flex min-h-[40px] items-center rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {convite.ativo ? 'Desativar' : 'Ativar'}
          </button>

          {confirmandoExclusao ? (
            <>
              <button
                type="button"
                onClick={aoConfirmarExclusao}
                disabled={processando}
                className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Confirmar exclusão
              </button>
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(false)}
                disabled={processando}
                className="flex min-h-[40px] items-center rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmandoExclusao(true)}
              className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Excluir
            </button>
          )}
        </div>
      </div>
    </details>
  );
}