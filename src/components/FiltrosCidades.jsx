import { useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';

const OPCOES_STATUS = [
  { valor: 'verde', rotulo: 'Saudável' },
  { valor: 'amarelo', rotulo: 'Atenção' },
  { valor: 'vermelho', rotulo: 'Crítico' },
];

export default function FiltrosCidades({
  filtros,
  atualizarFiltro,
  alternarStatus,
  limparFiltros,
  regionaisDisponiveis,
  coordenacoesDisponiveis = [],
  quantidadeFiltrosAtivos,
  quantidadeResultados,
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Filter className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
        <span className="text-sm font-semibold text-slate-800">Filtros</span>
        {quantidadeFiltrosAtivos > 0 && (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">
            {quantidadeFiltrosAtivos}
          </span>
        )}
        <span className="ml-auto shrink-0 text-xs text-slate-500">
          {quantidadeResultados} {quantidadeResultados === 1 ? 'cidade' : 'cidades'}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-slate-400 transition-transform ${aberto ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {aberto && (
        <div className="border-t border-slate-100 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="filtro-busca" className="block text-xs font-medium text-slate-600">
                Cidade
              </label>
              <input
                id="filtro-busca"
                type="text"
                value={filtros.busca}
                onChange={(e) => atualizarFiltro('busca', e.target.value)}
                placeholder="Buscar por nome…"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
              />
            </div>

            <div>
              <label htmlFor="filtro-regional" className="block text-xs font-medium text-slate-600">
                Gerência Regional
              </label>
              <select
                id="filtro-regional"
                value={filtros.regional}
                onChange={(e) => atualizarFiltro('regional', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
              >
                <option value="">Todas</option>
                {regionaisDisponiveis.map((regional) => (
                  <option key={regional} value={regional}>
                    {regional}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filtro-coordenacao" className="block text-xs font-medium text-slate-600">
                Coordenação Regional
              </label>
              <select
                id="filtro-coordenacao"
                value={filtros.coordenacaoRegional}
                onChange={(e) => atualizarFiltro('coordenacaoRegional', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
              >
                <option value="">Todas</option>
                {coordenacoesDisponiveis.map((coordenacao) => (
                  <option key={coordenacao} value={coordenacao}>
                    {coordenacao}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filtro-atingimento" className="block text-xs font-medium text-slate-600">
                Atingimento mínimo (%)
              </label>
              <input
                id="filtro-atingimento"
                type="number"
                inputMode="numeric"
                min={0}
                max={150}
                value={filtros.atingimentoMin}
                onChange={(e) => atualizarFiltro('atingimentoMin', e.target.value)}
                placeholder="Ex: 75"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
              />
            </div>

            <div>
              <label htmlFor="filtro-fwa" className="block text-xs font-medium text-slate-600">
                Vende FWA
              </label>
              <select
                id="filtro-fwa"
                value={filtros.vendeFwa}
                onChange={(e) => atualizarFiltro('vendeFwa', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
              >
                <option value="todas">Todas</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>

            <div>
              <label htmlFor="filtro-meta-batida" className="block text-xs font-medium text-slate-600">
                Meta batida
              </label>
              <select
                id="filtro-meta-batida"
                value={filtros.metaBatida}
                onChange={(e) => atualizarFiltro('metaBatida', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
              >
                <option value="todas">Todas</option>
                <option value="sim">Sim (≥ 100%)</option>
                <option value="nao">Não (&lt; 100%)</option>
              </select>
            </div>

            <div>
              <label htmlFor="filtro-prioritaria" className="block text-xs font-medium text-slate-600">
                Cidades prioritárias
              </label>
              <select
                id="filtro-prioritaria"
                value={filtros.prioritaria}
                onChange={(e) => atualizarFiltro('prioritaria', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
              >
                <option value="todas">Todas</option>
                <option value="sim">Somente prioritárias</option>
                <option value="nao">Somente não prioritárias</option>
              </select>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-600">Status</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {OPCOES_STATUS.map((opcao) => {
                  const marcado = filtros.status.includes(opcao.valor);
                  return (
                    <button
                      key={opcao.valor}
                      type="button"
                      onClick={() => alternarStatus(opcao.valor)}
                      aria-pressed={marcado}
                      className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold ${
                        marcado
                          ? 'border-brand-700 bg-brand-50 text-brand-700'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {opcao.rotulo}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {quantidadeFiltrosAtivos > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={limparFiltros}
                className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <X className="size-4" aria-hidden="true" />
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}