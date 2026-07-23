import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { feriadosDaCidadeNoMes } from '../utils/feriados';
import { diasUteisNoIntervalo, construirEstimadorPorCalendario } from '../utils/diasUteis';
import { diasUteisEmCacheOuNulo } from '../services/diasUteisService';

/** Respiro mínimo entre o popover e a borda da viewport. */
const MARGEM_VIEWPORT = 8;

const ROTULO_TIPO = { NACIONAL: 'Nacional', ESTADUAL: 'Estadual', MUNICIPAL: 'Municipal' };

/** dd/mm a partir das partes locais da data — evita o bug de fuso do toISOString(). */
function formatarDataFeriado(data) {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}`;
}

/** Total de dias úteis do mês — reutiliza o índice já em cache (carregado em
 * buscarCidade), sem fetch adicional. Usa o estimador de calendário pra dias
 * futuros, mesma regra do rateio semanal de meta. Retorna null quando o cache
 * ainda não está disponível (ex.: página de feriados sem cidade carregada). */
function totalDiasUteisMes(cidade, ano, mesIndice) {
  const cache = diasUteisEmCacheOuNulo();
  if (!cache || !cidade?.uf) return null;
  const { indice, ultimaData } = cache;
  const diasNoMes = new Date(ano, mesIndice + 1, 0).getDate();
  const estimarPeso = construirEstimadorPorCalendario(ano, cidade.uf);
  const { soma } = diasUteisNoIntervalo(indice, cidade.uf, ano, mesIndice, 1, diasNoMes, estimarPeso, ultimaData);
  return soma;
}

/**
 * Indicador discreto de feriados do mês no cabeçalho da tabela/card: só o
 * ícone + contagem; a lista completa (nome, data, tipo) aparece num popover ao
 * clicar, junto com o total de dias úteis do mês (mesma fonte de verdade do
 * rateio semanal de meta). Não aparece nada quando o mês não tem feriado.
 *
 * Posicionamento em `position: fixed`, calculado a partir do botão (não
 * `absolute` ancorado no próprio container): o container geralmente fica
 * perto da borda esquerda da tela, então `right-0` relativo a ele empurrava
 * o popover pra fora da viewport no celular. Calcular contra a viewport e
 * clampar dentro dela resolve para qualquer posição do botão.
 */
export default function FeriadosMes({ cidade, ano, mesIndice, className = 'text-white/70 hover:bg-white/10 hover:text-white' }) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState(null);
  const botaoRef = useRef(null);
  const popoverRef = useRef(null);
  const feriados = feriadosDaCidadeNoMes(cidade, ano, mesIndice);

  const fechar = useCallback(() => setAberto(false), []);

  useLayoutEffect(() => {
    if (!aberto) return;
    const retanguloBotao = botaoRef.current?.getBoundingClientRect();
    const larguraPopover = popoverRef.current?.offsetWidth;
    if (!retanguloBotao || !larguraPopover) return;

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

  // Calculado só quando o popover está aberto — zero custo enquanto fechado.
  const diasUteis = aberto ? totalDiasUteisMes(cidade, ano, mesIndice) : null;

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
          <ul className="space-y-1.5">
            {feriados.map((feriado, i) => (
              <li key={i} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="block leading-snug">{feriado.descricao.replace(/<br\s*\/?>/gi, ' ')}</span>
                  {feriado.tipo && (
                    <span className="text-[10px] text-slate-400">{ROTULO_TIPO[feriado.tipo] ?? feriado.tipo}</span>
                  )}
                </div>
                <span className="shrink-0 tabular-nums text-slate-400">{formatarDataFeriado(feriado.data)}</span>
              </li>
            ))}
          </ul>
          {diasUteis !== null && (
            <div className="mt-2 border-t border-slate-100 pt-1.5 flex items-center justify-between text-[10px] text-slate-500">
              <span>Dias úteis no mês</span>
              <span className="tabular-nums font-semibold text-slate-700">
                {diasUteis % 1 === 0 ? diasUteis : diasUteis.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      )}
    </span>
  );
}