import { memo, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import PainelMetadadosImagem from './PainelMetadadosImagem';

/**
 * Visualização ampliada de uma evidência: imagem centralizada ocupando o
 * máximo de espaço à esquerda (proporção preservada, sem distorção) e
 * painel de metadados de largura fixa à direita — cada área com seu
 * próprio scroll independente, então uma foto em retrato nunca "empurra"
 * o painel pra fora da tela (era exatamente o bug da versão anterior:
 * imagem e painel na mesma coluna vertical, sem `min-h-0` no item da
 * imagem, então o flexbox não deixava ela encolher).
 *
 * Empilha verticalmente abaixo de `lg` (imagem em cima, painel embaixo,
 * modal inteiro rolável) — não dá pra manter duas colunas fixas em telas
 * estreitas sem espremer uma das duas.
 *
 * `React.memo`: evita re-render à toa se o componente-pai re-renderizar
 * por outro motivo (ex.: usuário digitando em outro campo do formulário)
 * enquanto o lightbox está aberto. Metadados nunca são buscados aqui —
 * chegam prontos via `itens` — então trocar de imagem ou reabrir nunca
 * dispara nova consulta.
 */
function LightboxImagem({ itens, indiceInicial, localizacaoEvidencia, criadoPor, aoFechar }) {
  const [indice, setIndice] = useState(indiceInicial);
  const temMultiplas = itens.length > 1;
  const item = itens[indice];

  function irParaAnterior() {
    setIndice((i) => (i - 1 + itens.length) % itens.length);
  }

  function irParaProxima() {
    setIndice((i) => (i + 1) % itens.length);
  }

  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === 'Escape') aoFechar();
      if (evento.key === 'ArrowRight' && temMultiplas) irParaProxima();
      if (evento.key === 'ArrowLeft' && temMultiplas) irParaAnterior();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temMultiplas, aoFechar]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95"
      role="dialog"
      aria-modal="true"
      aria-label={`Imagem ${indice + 1} de ${itens.length}`}
      onClick={aoFechar}
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-3 sm:px-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-medium text-white/70">
          {temMultiplas ? `Evidência ${indice + 1} de ${itens.length}` : 'Evidência'}
        </p>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar visualização"
          className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      {/* min-h-0 aqui é o que corrige o bug original: sem isso, o filho
          (área da imagem) não encolhe pra caber no espaço restante quando
          a imagem é mais alta que larga, e o painel de metadados acaba
          "empurrado" pra fora da tela. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6">
          {temMultiplas && (
            <button
              type="button"
              onClick={irParaAnterior}
              aria-label="Imagem anterior"
              className="absolute left-2 z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:left-4"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
          )}

          {item.url && (
            <img
              src={item.url}
              alt={`Evidência ${indice + 1} de ${itens.length}`}
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            />
          )}

          {temMultiplas && (
            <button
              type="button"
              onClick={irParaProxima}
              aria-label="Próxima imagem"
              className="absolute right-2 z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:right-4"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Painel lateral: largura fixa em telas grandes, scroll próprio
            (nunca o modal inteiro), independente do tamanho da imagem. */}
        <div
          className="w-full shrink-0 overflow-y-auto border-t border-white/10 bg-white lg:w-96 lg:border-l lg:border-t-0"
          onClick={(e) => e.stopPropagation()}
        >
          <PainelMetadadosImagem
            metadados={item.metadados}
            nomeArquivo={item.metadados?.nomeOriginal}
            criadoEm={item.criadoEm}
            criadoPor={criadoPor}
            localizacaoCapturada={localizacaoEvidencia}
          />
        </div>
      </div>
    </div>
  );
}

export default memo(LightboxImagem);