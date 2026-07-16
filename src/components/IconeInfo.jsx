import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * Ícone "i" com popover próprio — NÃO usa o `title` nativo do navegador
 * (caixa preta feia, sem controle de posição/largura, e não abre com
 * toque na maioria dos navegadores mobile). Clique/toque alterna
 * aberto/fechado; clique fora ou Esc fecha. Funciona igual em desktop e
 * mobile, sem depender de hover.
 *
 * Popover sempre ancorado pela direita (`right-0`, cresce pra esquerda) —
 * todo uso atual (cabeçalho de tabela, rótulo de card) tem o ícone perto
 * da borda direita do próprio elemento, nunca da esquerda.
 */
export default function IconeInfo({ texto }) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;

    function aoInteragirFora(evento) {
      if (containerRef.current && !containerRef.current.contains(evento.target)) setAberto(false);
    }
    function aoPressionarTecla(evento) {
      if (evento.key === 'Escape') setAberto(false);
    }

    document.addEventListener('mousedown', aoInteragirFora);
    document.addEventListener('touchstart', aoInteragirFora);
    document.addEventListener('keydown', aoPressionarTecla);
    return () => {
      document.removeEventListener('mousedown', aoInteragirFora);
      document.removeEventListener('touchstart', aoInteragirFora);
      document.removeEventListener('keydown', aoPressionarTecla);
    };
  }, [aberto]);

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={(evento) => {
          evento.preventDefault();
          evento.stopPropagation();
          setAberto((atual) => !atual);
        }}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
        aria-label="Mais informações"
        aria-expanded={aberto}
      >
        <Info className="size-3.5" aria-hidden="true" />
      </button>

      {aberto && (
        <span
          role="tooltip"
          onClick={(evento) => {
            evento.preventDefault();
            evento.stopPropagation();
          }}
          className="absolute right-0 top-full z-20 mt-1.5 w-56 max-w-[75vw] whitespace-normal rounded-lg border border-slate-200 bg-white p-2.5 text-left text-xs font-normal normal-case leading-snug text-slate-600 shadow-lg"
        >
          {texto}
        </span>
      )}
    </span>
  );
}