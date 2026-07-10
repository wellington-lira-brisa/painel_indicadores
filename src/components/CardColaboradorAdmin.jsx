import { useState } from 'react';
import { ChevronDown, Loader2, Trash2 } from 'lucide-react';
import {
  PAPEL_ROTULOS,
  PERMISSAO_ROTULOS,
  PERMISSOES,
  alternarPermissao,
  permissoesEfetivas,
  temPermissao,
} from '../services/permissaoService';
import { atualizarPermissoes, excluirColaborador } from '../services/adminService';
import LinhaInfo from './LinhaInfo';
import ModalConfirmacao from './ModalConfirmacao';

const TODAS_PERMISSOES = Object.values(PERMISSOES);

export default function CardColaboradorAdmin({ colaborador, usuarioLogado, aoAtualizar, aoExcluir }) {
  const [rascunho, setRascunho] = useState({
    permissoesExtras: colaborador.permissoes_extras ?? [],
    permissoesRevogadas: colaborador.permissoes_revogadas ?? [],
  });
  const [salvando, setSalvando] = useState(false);
  const [salvoRecentemente, setSalvoRecentemente] = useState(false);
  const [erro, setErro] = useState(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const ehSuperAdmin = colaborador.papel === 'super_administrador';
  const ehVocêMesmo = usuarioLogado.id === colaborador.id;
  const nivelInsuficiente = usuarioLogado.nivel <= colaborador.nivel;
  const podeEditar = !ehSuperAdmin && !ehVocêMesmo && !nivelInsuficiente;
  const podeExcluir = podeEditar && temPermissao(usuarioLogado, PERMISSOES.EXCLUIR_COLABORADOR);

  const colaboradorComRascunho = { ...colaborador, ...rascunho };
  const efetivas = permissoesEfetivas(colaboradorComRascunho);
  const houveMudanca =
    JSON.stringify([...rascunho.permissoesExtras].sort()) !==
      JSON.stringify([...(colaborador.permissoes_extras ?? [])].sort()) ||
    JSON.stringify([...rascunho.permissoesRevogadas].sort()) !==
      JSON.stringify([...(colaborador.permissoes_revogadas ?? [])].sort());

  function aoAlternar(permissao, concedida) {
    setSalvoRecentemente(false);
    setRascunho(alternarPermissao(colaboradorComRascunho, permissao, concedida));
  }

  async function aoSalvar() {
    setErro(null);
    setSalvando(true);
    try {
      const atualizado = await atualizarPermissoes(colaborador.id, rascunho);
      aoAtualizar(atualizado);
      setSalvoRecentemente(true);
      setTimeout(() => setSalvoRecentemente(false), 2500);
    } catch (excecao) {
      setErro(excecao.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <details className="group rounded-xl border border-slate-200 bg-white shadow-sm open:shadow-md">
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{colaborador.nome}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            Matrícula {colaborador.matricula} · {PAPEL_ROTULOS[colaborador.papel] ?? colaborador.papel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BadgeStatus status={colaborador.status} />
          <ChevronDown
            className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </div>
      </summary>

      <div className="border-t border-slate-100 px-4 py-4">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <LinhaInfo rotulo="Cargo" valor={colaborador.cargo ?? '—'} />
          <LinhaInfo rotulo="Regional" valor={colaborador.regional ?? '—'} />
        </dl>

        <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Permissões
        </h4>

        {ehSuperAdmin ? (
          <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
            Super Administrador tem acesso total a todas as permissões por padrão. Não editável.
          </p>
        ) : (
          !podeEditar && (
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {ehVocêMesmo
                ? 'Você não pode alterar suas próprias permissões nesta tela.'
                : 'Nível hierárquico insuficiente para editar este colaborador.'}
            </p>
          )
        )}

        <ul className="mt-2 space-y-1">
          {TODAS_PERMISSOES.map((permissao) => (
            <li key={permissao}>
              <label
                className={`flex min-h-[44px] items-center gap-3 rounded-lg px-2 text-sm ${
                  podeEditar ? 'cursor-pointer hover:bg-slate-50' : 'text-slate-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={efetivas.includes(permissao)}
                  disabled={!podeEditar}
                  onChange={(e) => aoAlternar(permissao, e.target.checked)}
                  className="size-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-700 disabled:opacity-50"
                />
                {PERMISSAO_ROTULOS[permissao] ?? permissao}
              </label>
            </li>
          ))}
        </ul>

        {erro && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {erro}
          </p>
        )}

        {podeEditar && (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={aoSalvar}
              disabled={!houveMudanca || salvando}
              className="flex min-h-[44px] items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            >
              {salvando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
            {salvoRecentemente && (
              <span className="text-sm font-medium text-emerald-700">Salvo.</span>
            )}
          </div>
        )}

        {podeExcluir && (
          <div className="mt-5 border-t border-dashed border-red-200 pt-4">
            <button
              type="button"
              onClick={() => setConfirmandoExclusao(true)}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Excluir colaborador definitivamente
            </button>
          </div>
        )}
      </div>

      {confirmandoExclusao && (
        <ModalConfirmacao
          titulo="Excluir colaborador"
          mensagem={`Isso remove ${colaborador.nome} (matrícula ${colaborador.matricula}) do sistema e do login permanentemente. Não pode ser desfeito.`}
          rotuloConfirmar="Excluir definitivamente"
          aoFechar={() => setConfirmandoExclusao(false)}
          aoConfirmar={async () => {
            await excluirColaborador(colaborador.id);
            aoExcluir(colaborador.id);
          }}
        />
      )}
    </details>
  );
}

function BadgeStatus({ status }) {
  const ativo = status === 'ativo';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
      }`}
    >
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  );
}