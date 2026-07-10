import { X } from 'lucide-react';

/**
 * Estrutura comum de modal de formulário: overlay, header com título/fechar,
 * full-screen no mobile e dialog centralizado a partir de `sm`. O conteúdo
 * (geralmente um <form>) é passado como children.
 */
export default function ModalFormulario({ titulo, subtitulo, aoFechar, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/50 sm:items-start sm:overflow-y-auto sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-formulario"
    >
      <div className="flex w-full flex-col overflow-y-auto bg-white sm:my-8 sm:max-w-2xl sm:rounded-2xl sm:shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="titulo-modal-formulario" className="text-lg font-bold text-slate-900">
              {titulo}
            </h2>
            {subtitulo && <p className="truncate text-sm text-slate-500">{subtitulo}</p>}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
            aria-label="Fechar"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}