import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Seletor de múltiplos canais — mesma UX de popover+checkbox de
 * `MenuConta.jsx` (clique fora / Esc fecha). Carrega a lista de canais
 * disponíveis só na primeira vez que é aberto (`carregarCanaisDisponiveis`
 * busca um arquivo ~40x maior que o resto do painel — ver
 * `indicadorRealizadoService.js` — não faz sentido pagar esse custo antes
 * de alguém realmente usar o filtro).
 *
 * Recalcula realizado/score pra cidade toda quando canais estão
 * selecionados (ver `cidadeService.js`), então a mudança só é aplicada
 * quando o usuário confirma ("Aplicar"), não a cada clique — evita
 * refazer esse cálculo (mais pesado que os outros filtros, que são só
 * um `.filter()` local) a cada checkbox marcado.
 */
export default function SeletorCanais({ canaisSelecionados, aoAplicar, carregarCanaisDisponiveis }) {
  const [aberto, setAberto] = useState(false);
  const [opcoes, setOpcoes] = useState(null); // null = ainda não carregado
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [selecaoRascunho, setSelecaoRascunho] = useState(canaisSelecionados);
  const containerRef = useRef(null);
  const botaoRef = useRef(null);

  // Rascunho reflete a seleção confirmada sempre que o popover reabre (ex.:
  // usuário abriu, mexeu, fechou sem aplicar — próxima abertura não deve
  // carregar aquele rascunho descartado).
  useEffect(() => {
    if (aberto) setSelecaoRascunho(canaisSelecionados);
  }, [aberto, canaisSelecionados]);

  useEffect(() => {
    if (!aberto || opcoes !== null) return;
    setCarregando(true);
    setErro(null);
    carregarCanaisDisponiveis()
      .then(setOpcoes)
      .catch((excecao) => {
        console.error('Falha ao carregar lista de canais:', excecao);
        setErro('Não foi possível carregar os canais agora.');
      })
      .finally(() => setCarregando(false));
  }, [aberto, opcoes, carregarCanaisDisponiveis]);

  useEffect(() => {
    if (!aberto) return undefined;

    function aoClicarFora(evento) {
      if (containerRef.current && !containerRef.current.contains(evento.target)) {
        setAberto(false);
      }
    }
    function aoPressionarTecla(evento) {
      if (evento.key === 'Escape') {
        setAberto(false);
        botaoRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoPressionarTecla);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoPressionarTecla);
    };
  }, [aberto]);

  function alternarCanal(canal) {
    setSelecaoRascunho((atual) => (atual.includes(canal) ? atual.filter((c) => c !== canal) : [...atual, canal]));
  }

  function aplicar() {
    aoAplicar(selecaoRascunho);
    setAberto(false);
  }

  function limpar() {
    setSelecaoRascunho([]);
    aoAplicar([]);
    setAberto(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        className="mt-1 flex min-h-[42px] w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-left text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
      >
        <span className="truncate text-slate-700">
          {canaisSelecionados.length === 0
            ? 'Todos'
            : canaisSelecionados.length === 1
              ? canaisSelecionados[0]
              : `${canaisSelecionados.length} canais selecionados`}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {aberto && (
        <div
          role="listbox"
          aria-label="Canais"
          className="absolute left-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="max-h-64 overflow-y-auto p-2">
            {carregando && <p className="px-2 py-3 text-sm text-slate-500">Carregando canais…</p>}
            {erro && <p className="px-2 py-3 text-sm text-red-700">{erro}</p>}
            {opcoes?.length === 0 && <p className="px-2 py-3 text-sm text-slate-500">Nenhum canal encontrado.</p>}
            {opcoes?.map((canal) => (
              <label
                key={canal}
                className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selecaoRascunho.includes(canal)}
                  onChange={() => alternarCanal(canal)}
                  className="size-4 rounded border-slate-300 text-brand-700 focus:ring-brand-700"
                />
                {canal}
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-2">
            <button
              type="button"
              onClick={limpar}
              className="min-h-[36px] rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={aplicar}
              className="min-h-[36px] rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
            >
              Aplicar ({selecaoRascunho.length || 'todos'})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}