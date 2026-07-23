import { ImageOff, Images, X } from "lucide-react";

/**
 * Grid responsivo de miniaturas das evidências anexadas. `aoRemover` é
 * opcional — quando ausente, a galeria vira somente-leitura (usada na
 * visualização de um plano já salvo).
 */
export default function GaleriaEvidencias({ itens, aoRemover, aoAbrirImagem }) {
  if (itens.length === 0) return null;

  return (
    <div>
      <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Images className="size-3.5" aria-hidden="true" />
        {itens.length}{" "}
        {itens.length === 1 ? "imagem anexada" : "imagens anexadas"}
      </p>
      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {itens.map((item, indice) => (
          <li
            key={item.id ?? indice}
            className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
          >
            <button
              type="button"
              onClick={() => aoAbrirImagem(indice)}
              className="block size-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
              aria-label={`Ver imagem ${indice + 1} de ${itens.length} em tamanho maior`}
            >
              {item.url ? (
                <img
                  src={item.url}
                  alt={`Evidência ${indice + 1}`}
                  decoding="async"
                  className="size-full object-cover transition hover:scale-105"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-slate-300">
                  <ImageOff className="size-6" aria-hidden="true" />
                </span>
              )}
            </button>

            {aoRemover && (
              <button
                type="button"
                onClick={() => aoRemover(item.id)}
                aria-label={`Remover imagem ${indice + 1}`}
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}