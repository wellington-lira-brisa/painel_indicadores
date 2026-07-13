import { memo, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Info, X, ZoomIn, ZoomOut } from 'lucide-react';
import PainelMetadadosImagem from './PainelMetadadosImagem';

/**
 * Visualização ampliada de uma evidência.
 *
 * Desktop (`lg+`): imagem à esquerda (proporção preservada, sem distorção)
 * e painel de metadados de largura fixa à direita — cada área com seu
 * próprio scroll independente.
 *
 * Mobile/tablet (abaixo de `lg`): imagem e painel de metadados NÃO dividem
 * a mesma coluna vertical. Esse era o bug da versão anterior — os dois
 * empilhados num único `flex-col` de altura fixa, com o painel em
 * `shrink-0`: o painel sempre ganhava toda a altura que o conteúdo dele
 * pedisse (várias seções de metadados costumam passar de 500px), sobrando
 * pouquíssimo espaço — às vezes poucos pixels — pro `flex-1 min-h-0` da
 * imagem. Resultado: imagem minúscula ou efetivamente invisível.
 * A correção troca o empilhamento por abas ("Imagem" / "Detalhes"): cada
 * aba ocupa 100% da área disponível abaixo do cabeçalho, então a imagem
 * nunca precisa disputar altura com o painel de metadados.
 *
 * Zoom (mobile): tocar na imagem alterna entre ajustada-à-tela e 2.5x:
 * `overflow-auto` + `touch-action: pan-x pan-y` no container deixa o
 * navegador cuidar do pan nativamente (arrastar/gesto), sem lib nova.
 *
 * `localizacaoEvidencia` vem DENTRO de cada item de `itens`, não como prop
 * única do lightbox inteiro: um plano pode ter várias localizações no
 * histórico (uma por lote de anexação — ver migration
 * 20260710130000), então cada evidência mostra a localização do lote em
 * que ELA foi anexada, não sempre a mesma pra toda foto do plano.
 *
 * `React.memo`: evita re-render à toa se o componente-pai re-renderizar
 * por outro motivo (ex.: usuário digitando em outro campo do formulário)
 * enquanto o lightbox está aberto. Metadados nunca são buscados aqui —
 * chegam prontos via `itens` — então trocar de imagem ou reabrir nunca
 * dispara nova consulta.
 */
function LightboxImagem({ itens, indiceInicial, criadoPor, aoFechar }) {
  const [indice, setIndice] = useState(indiceInicial);
  const [abaMobile, setAbaMobile] = useState('imagem');
  const [imagemAmpliada, setImagemAmpliada] = useState(false);
  const temMultiplas = itens.length > 1;
  const item = itens[indice];

  function irParaAnterior() {
    setImagemAmpliada(false);
    setIndice((i) => (i - 1 + itens.length) % itens.length);
  }

  function irParaProxima() {
    setImagemAmpliada(false);
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

  // Evidência trocada (setas ou paginação): sempre volta pra aba "Imagem"
  // no mobile, senão dá pra ficar preso na aba "Detalhes" navegando entre
  // fotos sem perceber que trocou.
  useEffect(() => {
    setAbaMobile('imagem');
  }, [indice]);

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

      {/* Abas só aparecem abaixo de `lg` — é a troca do empilhamento
          vertical (bug) por duas telas cheias alternáveis. Em `lg+` as
          duas áreas já convivem lado a lado, então as abas ficam ocultas
          e ambas renderizam ao mesmo tempo. */}
      {item.metadados && (
        <div className="flex shrink-0 gap-1 px-4 pb-2 sm:px-6 lg:hidden" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setAbaMobile('imagem')}
            aria-pressed={abaMobile === 'imagem'}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
              abaMobile === 'imagem' ? 'bg-white text-slate-900' : 'bg-white/10 text-white/70'
            }`}
          >
            Imagem
          </button>
          <button
            type="button"
            onClick={() => setAbaMobile('detalhes')}
            aria-pressed={abaMobile === 'detalhes'}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold ${
              abaMobile === 'detalhes' ? 'bg-white text-slate-900' : 'bg-white/10 text-white/70'
            }`}
          >
            <Info className="size-4" aria-hidden="true" />
            Detalhes
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row" onClick={(e) => e.stopPropagation()}>
        <div
          className={`relative min-h-0 flex-1 items-center justify-center overflow-auto p-4 [touch-action:pan-x_pan-y] sm:p-6 lg:flex ${
            abaMobile === 'imagem' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {temMultiplas && (
            <button
              type="button"
              onClick={irParaAnterior}
              aria-label="Imagem anterior"
              className="fixed left-2 top-1/2 z-10 flex size-10 shrink-0 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:left-4"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
          )}

          {item.url && (
            <button
              type="button"
              onClick={() => setImagemAmpliada((v) => !v)}
              aria-label={imagemAmpliada ? 'Reduzir imagem' : 'Ampliar imagem'}
              aria-pressed={imagemAmpliada}
              className="m-auto block cursor-zoom-in"
            >
              <img
                src={item.url}
                alt={`Evidência ${indice + 1} de ${itens.length}`}
                className={`rounded-lg object-contain shadow-2xl transition-transform duration-150 ${
                  imagemAmpliada ? 'max-w-none scale-[2.5] cursor-zoom-out' : 'max-h-[70vh] max-w-full lg:max-h-full'
                }`}
              />
            </button>
          )}

          {temMultiplas && (
            <button
              type="button"
              onClick={irParaProxima}
              aria-label="Próxima imagem"
              className="fixed right-2 top-1/2 z-10 flex size-10 shrink-0 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:right-4"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          )}

          {item.url && (
            <span className="pointer-events-none fixed bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-xs text-white/80 lg:flex">
              {imagemAmpliada ? <ZoomOut className="size-3.5" /> : <ZoomIn className="size-3.5" />}
              {imagemAmpliada ? 'Clique para reduzir' : 'Clique para ampliar'}
            </span>
          )}
        </div>

        {/* Painel lateral: largura fixa em telas grandes, scroll próprio
            (nunca o modal inteiro), independente do tamanho da imagem.
            No mobile some não renderiza junto — é a própria aba
            "Detalhes", com altura cheia garantida (nada de shrink-0
            competindo com a imagem). */}
        <div
          className={`w-full min-h-0 flex-1 overflow-y-auto border-t border-white/10 bg-white lg:block lg:w-96 lg:flex-none lg:border-l lg:border-t-0 ${
            abaMobile === 'detalhes' ? 'block' : 'hidden'
          }`}
        >
          <PainelMetadadosImagem
            metadados={item.metadados}
            nomeArquivo={item.metadados?.nomeOriginal}
            criadoEm={item.criadoEm}
            criadoPor={criadoPor}
            localizacaoCapturada={item.localizacaoEvidencia}
          />
        </div>
      </div>
    </div>
  );
}

export default memo(LightboxImagem);