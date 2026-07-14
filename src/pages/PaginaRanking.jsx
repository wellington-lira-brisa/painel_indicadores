import { useEffect, useState } from 'react';
import { TECNOLOGIAS } from '../config/tecnologias';
import { useFiltrosCidades } from '../hooks/useFiltrosCidades';
import FiltrosCidades from '../components/FiltrosCidades';
import TabelaRanking from '../components/TabelaRanking';
import CardKpi from '../components/CardKpi';
import { formatarPercentual } from '../utils/format';

/**
 * Ranking de cidades — reutilizado por qualquer tecnologia (FTTH, 5G, ...).
 * `tecnologia` decide a fonte dos dados, a rota de cada cidade e a chave de
 * filtros salvos; o resto (KPIs, filtros, tabela) é o mesmo componente pra
 * todas. A cor (`tecnologia.classeTema`) é aplicada uma vez no container
 * raiz e cascata pra tudo dentro via CSS var — ver index.css.
 */
export default function PaginaRanking({ tecnologia = TECNOLOGIAS.ftth }) {
  const [cidades, setCidades] = useState(null);
  const {
    filtros,
    atualizarFiltro,
    alternarStatus,
    limparFiltros,
    regionaisDisponiveis,
    coordenacoesDisponiveis,
    cidadesFiltradas,
    quantidadeFiltrosAtivos,
  } = useFiltrosCidades(cidades, tecnologia.chaveFiltros);

  useEffect(() => {
    setCidades(null);
    tecnologia.servicoCidades.listarRanking().then(setCidades);
  }, [tecnologia]);

  if (!cidades) {
    return <p className="text-sm text-slate-500">Carregando ranking…</p>;
  }

  const totais = {
    verde: cidadesFiltradas.filter((c) => c.status === 'verde').length,
    amarelo: cidadesFiltradas.filter((c) => c.status === 'amarelo').length,
    vermelho: cidadesFiltradas.filter((c) => c.status === 'vermelho').length,
  };
  const scoresValidos = cidadesFiltradas.map((c) => c.score).filter((s) => s !== null);
  const mediaGeral = scoresValidos.length > 0 ? scoresValidos.reduce((acc, s) => acc + s, 0) / scoresValidos.length : null;

  return (
    <div className={`space-y-6 ${tecnologia.classeTema}`}>
      <section aria-label="Resumo geral" className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-4">
        <CardKpi titulo="Atingimento médio" valor={formatarPercentual(mediaGeral)} destaque />
        <CardKpi titulo="Cidades saudáveis" valor={totais.verde} detalhe="atingimento ≥ 90%" />
        <CardKpi titulo="Cidades em atenção" valor={totais.amarelo} detalhe="entre 75% e 90%" />
        <CardKpi titulo="Cidades críticas" valor={totais.vermelho} detalhe="atingimento < 75%" />
      </section>

      <FiltrosCidades
        filtros={filtros}
        atualizarFiltro={atualizarFiltro}
        alternarStatus={alternarStatus}
        limparFiltros={limparFiltros}
        regionaisDisponiveis={regionaisDisponiveis}
        coordenacoesDisponiveis={coordenacoesDisponiveis}
        quantidadeFiltrosAtivos={quantidadeFiltrosAtivos}
        quantidadeResultados={cidadesFiltradas.length}
      />

      <section aria-label="Ranking de cidades" className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Ranking de cidades · {tecnologia.nome}</h2>
        {cidadesFiltradas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-700">Nenhuma cidade encontrada com esses filtros.</p>
            <p className="mt-1 text-sm text-slate-500">Tente ajustar ou limpar os filtros aplicados.</p>
            {quantidadeFiltrosAtivos > 0 && (
              <button
                type="button"
                onClick={limparFiltros}
                className="mt-4 inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <TabelaRanking cidades={cidadesFiltradas} rotaBase={tecnologia.rotaBase} />
        )}
      </section>
    </div>
  );
}