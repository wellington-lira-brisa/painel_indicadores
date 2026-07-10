import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { feriadosDaCidadeNoMes } from '../utils/feriados';

/** Respiro mínimo entre o popover e a borda da viewport. */
const MARGEM_VIEWPORT = 8;

/** dd/mm a partir das partes locais da data — evita o bug de fuso do toISOString(). */
function formatarDataFeriado(data) {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}`;
}

/**
 * Indicador discreto de feriados do mês no cabeçalho da tabela/card: só o
 * ícone + contagem; a lista completa (nome e data) aparece num popover ao
 * clicar. Não aparece nada quando o mês não tem feriado, pra não poluir a
 * interface.
 *
 * Posicionamento em `position: fixed`, calculado a partir do botão (não
 * `absolute` ancorado no próprio container): o container geralmente fica
 * perto da borda esquerda da tela (coluna de mês numa tabela/card estreito),
 * então `right-0` relativo a ele empurrava o popover pra fora da viewport —
 * era exatamente o corte visto no celular. Calcular contra a viewport e
 * clampar dentro dela resolve para qualquer posição do botão, em qualquer
 * tamanho de tela, sem depender de breakpoints.
 */
export default function FeriadosMes({ cidade, ano, mesIndice, className = 'text-white/70 hover:bg-white/10 hover:text-white' }) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState(null);
  const botaoRef = useRef(null);
  const popoverRef = useRef(null);
  const feriados = feriadosDaCidadeNoMes(cidade, ano, mesIndice);

  const fechar = useCallback(() => setAberto(false), []);

  // Roda antes do navegador pintar o frame: mede o botão e o popover recém
  // montado e já commita a posição final, sem flash na posição errada.
  useLayoutEffect(() => {
    if (!aberto) return;
    const retanguloBotao = botaoRef.current?.getBoundingClientRect();
    const larguraPopover = popoverRef.current?.offsetWidth;
    if (!retanguloBotao || !larguraPopover) return;

    // Ancora à direita do botão por padrão; se estourar a borda esquerda da
    // tela, ancora à esquerda dele em vez disso — nunca as duas margens ao
    // mesmo tempo (o popover é mais estreito que a viewport, não o contrário).
    let esquerda = retanguloBotao.right - larguraPopover;
    if (esquerda < MARGEM_VIEWPORT) {
      esquerda = retanguloBotao.left;
    }
    esquerda = Math.min(esquerda, window.innerWidth - larguraPopover - MARGEM_VIEWPORT);
    esquerda = Math.max(esquerda, MARGEM_VIEWPORT);

    setPosicao({ top: retanguloBotao.bottom + 4, left: esquerda });
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return undefined;

    function aoClicarFora(evento) {
      if (!botaoRef.current?.contains(evento.target) && !popoverRef.current?.contains(evento.target)) {
        fechar();
      }
    }
    function aoTeclarEscape(evento) {
      if (evento.key === 'Escape') fechar();
    }

    // Fecha (em vez de reposicionar) em scroll/resize: é um popover de
    // consulta pontual, não uma UI que precisa acompanhar o botão — fechar
    // é mais simples e não tem chance de ficar com posição desatualizada.
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclarEscape);
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclarEscape);
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [aberto, fechar]);

  if (feriados.length === 0) return null;

  return (
    <span className="relative inline-block normal-case">
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={`${feriados.length} feriado(s) neste mês`}
        className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-normal ${className}`}
      >
        <Calendar className="size-3" aria-hidden="true" />
        {feriados.length}
      </button>

      {aberto && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Feriados do mês"
          style={{
            position: 'fixed',
            top: posicao?.top ?? -9999,
            left: posicao?.left ?? -9999,
            visibility: posicao ? 'visible' : 'hidden',
          }}
          className="z-30 w-56 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-200 bg-white p-2 text-left text-xs font-normal text-slate-700 shadow-lg"
        >
          <ul className="space-y-1">
            {feriados.map((feriado, i) => (
              <li key={i} className="flex items-start justify-between gap-2">
                <span>{feriado.descricao.replace(/<br\s*\/?>/gi, ' ')}</span>
                <span className="shrink-0 tabular-nums text-slate-400">{formatarDataFeriado(feriado.data)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}