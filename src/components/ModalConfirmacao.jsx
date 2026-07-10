import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import ModalFormulario from './ModalFormulario';

/**
 * Confirmação de ação destrutiva e irreversível (ex.: exclusão definitiva).
 * `aoConfirmar` deve retornar uma Promise; se ela rejeitar, o erro é
 * exibido inline e o modal permanece aberto pra nova tentativa.
 */
export default function ModalConfirmacao({
  titulo,
  mensagem,
  rotuloConfirmar = 'Confirmar',
  aoConfirmar,
  aoFechar,
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState(null);

  async function aoClicarConfirmar() {
    setErro(null);
    setConfirmando(true);
    try {
      await aoConfirmar();
    } catch (excecao) {
      setErro(excecao.message);
      setConfirmando(false);
    }
  }

  return (
    <ModalFormulario titulo={titulo} aoFechar={confirmando ? () => {} : aoFechar}>
      <div className="px-4 py-5 sm:px-6">
        <div className="flex gap-3 rounded-lg bg-red-50 p-3 text-red-800">
          <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
          <p className="text-sm">{mensagem}</p>
        </div>

        {erro && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={aoFechar}
            disabled={confirmando}
            className="flex min-h-[44px] items-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={aoClicarConfirmar}
            disabled={confirmando}
            className="flex min-h-[44px] items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            {confirmando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {confirmando ? 'Excluindo…' : rotuloConfirmar}
          </button>
        </div>
      </div>
    </ModalFormulario>
  );
}