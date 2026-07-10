/**
 * Atalhos de intervalo, no estilo dos filtros relativos de data de
 * ferramentas de BI (Power BI, Looker Studio): resolvem contra o mês atual
 * real em vez de valores fixos, então continuam corretos em qualquer mês.
 */
function gerarPresets(mesAtual) {
  return [
    { rotulo: 'Mês atual', inicio: mesAtual, fim: mesAtual },
    { rotulo: 'Últimos 3 meses', inicio: Math.max(0, mesAtual - 2), fim: mesAtual },
    { rotulo: 'Últimos 6 meses', inicio: Math.max(0, mesAtual - 5), fim: mesAtual },
    { rotulo: 'Ano todo', inicio: 0, fim: 11 },
  ];
}

/**
 * Seleção do período de análise: dois seletores (mês inicial/final) que se
 * atualizam sozinhos — nenhum precisa de botão "aplicar", a média recalcula
 * ao trocar qualquer um. Cada seletor já bloqueia as opções que tornariam o
 * intervalo inválido (mês inicial não lista meses depois do final, e
 * vice-versa), então não há como escolher uma combinação inválida.
 */
export default function SeletorPeriodoAnalise({
  mesInicial,
  mesFinal,
  mesAtual,
  mesesDisponiveis,
  quantidadeMeses,
  selecionarMesInicial,
  selecionarMesFinal,
  aplicarPreset,
}) {
  const presets = gerarPresets(mesAtual);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="periodo-mes-inicial" className="block text-xs font-medium text-slate-600">
            Mês inicial
          </label>
          <select
            id="periodo-mes-inicial"
            value={mesInicial}
            onChange={(e) => selecionarMesInicial(Number(e.target.value))}
            className="mt-1 min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
          >
            {mesesDisponiveis.map((mes, i) => (
              <option key={mes} value={i} disabled={i > mesFinal}>
                {mes}
              </option>
            ))}
          </select>
        </div>

        <span className="pb-2.5 text-sm text-slate-400">até</span>

        <div>
          <label htmlFor="periodo-mes-final" className="block text-xs font-medium text-slate-600">
            Mês final
          </label>
          <select
            id="periodo-mes-final"
            value={mesFinal}
            onChange={(e) => selecionarMesFinal(Number(e.target.value))}
            className="mt-1 min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
          >
            {mesesDisponiveis.map((mes, i) => (
              <option key={mes} value={i} disabled={i < mesInicial}>
                {mes}
              </option>
            ))}
          </select>
        </div>

        <span className="pb-2.5 text-sm font-medium text-slate-500">
          {quantidadeMeses} {quantidadeMeses === 1 ? 'mês selecionado' : 'meses selecionados'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const ativo = mesInicial === preset.inicio && mesFinal === preset.fim;
          return (
            <button
              key={preset.rotulo}
              type="button"
              onClick={() => aplicarPreset(preset.inicio, preset.fim)}
              aria-pressed={ativo}
              className={`min-h-[32px] rounded-full border px-3 text-xs font-semibold ${
                ativo
                  ? 'border-brand-700 bg-brand-50 text-brand-700'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {preset.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}