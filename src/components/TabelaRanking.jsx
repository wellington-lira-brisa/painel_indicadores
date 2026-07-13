import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import TendenciaBadge from './TendenciaBadge';
import BarraProgresso from './BarraProgresso';
import BadgeFwa from './BadgeFwa';
import BadgePlanoAcao from './BadgePlanoAcao';
import CardRankingCidade from './CardRankingCidade';
import { atingimentoIndicador } from '../utils/status';
import { formatarPercentual } from '../utils/format';

/**
 * Usa "Orçamento (vendas)" como referência de meta x realizado quando
 * existe (FTTH); cidades que não têm mais esse indicador (5G, desde que
 * Orçamento/Efetivado saíram do conjunto rastreado) caem pra "Ativação" —
 * é o indicador com par meta/realizado que sobrou como principal — e, na
 * falta dele também, pro primeiro indicador da lista. Sem fallback, a
 * coluna "Meta (vendas)" do ranking 5G ficaria zerada pra toda cidade.
 */
export function resumoMetaRealizado(cidade) {
  const referencia =
    cidade.indicadores.find((i) => i.id === 'orcamento') ??
    cidade.indicadores.find((i) => i.id === 'ativacao') ??
    cidade.indicadores[0];
  if (!referencia) return { meta: 0, realizado: 0, rotulo: 'Meta' };

  const apurados = referencia.meses.filter((m) => m.realizado !== null);
  return {
    meta: apurados.reduce((acc, m) => acc + m.meta, 0),
    realizado: apurados.reduce((acc, m) => acc + m.realizado, 0),
    atingimento: atingimentoIndicador(referencia),
    rotulo: referencia.nome,
  };
}

/**
 * Abaixo de `md`: lista de cards tocáveis, um por cidade.
 * A partir de `md`: tabela comparativa completa.
 */
export default function TabelaRanking({ cidades, rotaBase = '' }) {
  // Rótulo da coluna de meta/realizado segue o indicador de referência
  // usado (ver resumoMetaRealizado). "Orçamento (vendas)" já vem com
  // parênteses no próprio nome — preserva o texto original "Meta (vendas)"
  // pra não duplicar parênteses; qualquer outro indicador de referência
  // (ex.: "Ativação", no 5G) usa o nome dele direto.
  const referencia = cidades[0] ? resumoMetaRealizado(cidades[0]).rotulo : null;
  const rotuloColunaMeta = referencia === 'Orçamento (vendas)' ? 'Meta (vendas)' : `Meta (${referencia ?? '—'})`;

  return (
    <>
      <ul className="space-y-3 md:hidden">
        {cidades.map((cidade, indice) => (
          <CardRankingCidade
            key={cidade.id}
            cidade={cidade}
            posicao={indice + 1}
            resumo={resumoMetaRealizado(cidade)}
            rotaBase={rotaBase}
          />
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-brand-900 text-left text-xs font-semibold uppercase tracking-wide text-white">
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="min-w-[10rem] px-4 py-3">Cidade</th>
            <th className="min-w-[8rem] px-4 py-3">Gerente</th>
            <th className="whitespace-nowrap px-4 py-3 text-right">{rotuloColunaMeta}</th>
            <th className="whitespace-nowrap px-4 py-3 text-right">Realizado</th>
            <th className="whitespace-nowrap px-4 py-3">Atingimento geral</th>
            <th className="whitespace-nowrap px-4 py-3">Tendência</th>
            <th className="whitespace-nowrap px-4 py-3">Status</th>
            <th className="whitespace-nowrap px-4 py-3">Plano de ação</th>
            <th className="whitespace-nowrap px-4 py-3">FWA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cidades.map((cidade, indice) => {
            const resumo = resumoMetaRealizado(cidade);
            return (
              <tr
                key={cidade.id}
                className={`transition-colors hover:bg-brand-50 ${
                  cidade.status === 'vermelho' ? 'bg-red-50/60' : ''
                }`}
              >
                <td className="px-4 py-3 font-semibold text-slate-500">{indice + 1}º</td>
                <td className="min-w-[10rem] whitespace-nowrap px-4 py-3">
                  <Link
                    to={`${rotaBase}/cidades/${cidade.id}`}
                    className="font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
                  >
                    {cidade.nome}
                  </Link>
                </td>
                <td className="min-w-[8rem] whitespace-nowrap px-4 py-3 text-slate-600">{cidade.gerente}</td>
                <td className="px-4 py-3 text-right tabular-nums">{resumo.meta.toLocaleString('pt-BR')}</td>
                <td className="px-4 py-3 text-right tabular-nums">{resumo.realizado.toLocaleString('pt-BR')}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-24 shrink-0">
                      <BarraProgresso percentual={cidade.score} />
                    </div>
                    <span className="tabular-nums font-medium">{formatarPercentual(cidade.score)}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3"><TendenciaBadge tendencia={cidade.tendencia} /></td>
                <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={cidade.status} /></td>
                <td className="whitespace-nowrap px-4 py-3"><BadgePlanoAcao temPlanoAtivo={cidade.temPlanoAtivo} /></td>
                <td className="whitespace-nowrap px-4 py-3"><BadgeFwa vendeFwa={cidade.vendeFwa} /></td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </>
  );
}