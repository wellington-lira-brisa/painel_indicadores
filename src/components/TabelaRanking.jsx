import { Link } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import BarraProgresso from './BarraProgresso';
import BadgeFwa from './BadgeFwa';
import BadgePlanoAcao from './BadgePlanoAcao';
import CardRankingCidade from './CardRankingCidade';
import {
  atingimentoIndicador,
  EXPLICACAO_META_GERAL,
  EXPLICACAO_REALIZADO_GERAL,
  EXPLICACAO_ATINGIMENTO,
} from '../utils/status';
import { EXPLICACAO_QUINTIL_CIDADE } from '../utils/quintil';
import BadgeQuintil from './BadgeQuintil';
import { formatarPercentual, formatarValor } from '../utils/format';
import IconeInfo from './IconeInfo';

/**
 * Meta x realizado x atingimento do indicador de referência, pra Ranking
 * (tabela e card mobile). Ordem de prioridade do indicador: Orçamento ->
 * Instalação -> Ativação -> primeiro indicador da lista — mas só entra na
 * disputa quem JÁ TEM meta cadastrada (>0); entre os que têm, vence o
 * primeiro da ordem acima. Isso é o que faz uma cidade sem meta de
 * Orçamento mas com Meta Geral cadastrada (Instalação no FTTH, Ativação
 * no 5G — ver metaInstalacaoFtthService.js/metaAtivacao5gService.js)
 * mostrar esse número em vez de "—".
 * `meta`/`realizado`/`atingimento` vêm `null` (não `0`) quando não há
 * nenhum mês apurado — `0` seria "meta batida em zero", que é uma
 * informação diferente de "não temos esse dado ainda".
 * `atingimento` é sempre do MESMO indicador de referência das colunas
 * Meta/Realizado — de propósito não é `cidade.score` (média de todos os
 * indicadores com meta): misturar as duas bases faria o percentual
 * exibido não bater com `realizado ÷ meta` da própria linha assim que
 * outro indicador (Orçamento, Efetivado) ganhar meta própria.
 */
export function resumoMetaRealizado(cidade) {
  const candidatos = [
    cidade.indicadores.find((i) => i.id === 'orcamento'),
    cidade.indicadores.find((i) => i.id === 'instalacao'),
    cidade.indicadores.find((i) => i.id === 'ativacao'),
    cidade.indicadores[0],
  ].filter(Boolean);
  if (candidatos.length === 0) {
    return { meta: null, realizado: null, atingimento: null, rotulo: 'Meta', unidade: null };
  }

  const referencia = candidatos.find((ind) => ind.meses.some((m) => m.meta > 0)) ?? candidatos[0];

  const apurados = referencia.meses.filter((m) => m.realizado !== null);
  if (apurados.length === 0) {
    return { meta: null, realizado: null, atingimento: null, rotulo: referencia.nome, unidade: referencia.unidade };
  }
  return {
    meta: apurados.reduce((acc, m) => acc + m.meta, 0),
    realizado: apurados.reduce((acc, m) => acc + m.realizado, 0),
    atingimento: atingimentoIndicador(referencia),
    rotulo: referencia.nome,
    unidade: referencia.unidade,
  };
}

const COR_ACENTO_STATUS = {
  verde: 'border-l-emerald-400',
  amarelo: 'border-l-amber-400',
  vermelho: 'border-l-red-400',
  'sem-dado': 'border-l-slate-200',
};

/** Chip de posição: só os 3 primeiros ganham destaque (preenchido); os
 * demais ficam como número simples, pra não competir visualmente com o
 * top do ranking — é o "destaque sutil pras primeiras posições" pedido,
 * sem medalha/emoji (mantém o tom profissional do resto do sistema). */
function ChipPosicao({ posicao }) {
  if (posicao <= 3) {
    return (
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold tabular-nums text-brand-700">
        {posicao}
      </span>
    );
  }
  return <span className="pl-1 text-sm font-medium tabular-nums text-slate-400">{posicao}</span>;
}

/**
 * Abaixo de `md`: lista de cards tocáveis, um por cidade.
 * A partir de `md`: tabela comparativa completa.
 */
export default function TabelaRanking({ cidades, rotaBase = '', sufixoRota = '' }) {
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
            sufixoRota={sufixoRota}
          />
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-2.5">#</th>
            <th className="min-w-[10rem] px-4 py-2.5">Cidade</th>
            <th className="min-w-[8rem] px-4 py-2.5">Gerente</th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right">
              <span className="inline-flex items-center justify-end gap-1">
                {rotuloColunaMeta}
                <IconeInfo texto={EXPLICACAO_META_GERAL} />
              </span>
            </th>
            <th className="whitespace-nowrap px-4 py-2.5 text-right">
              <span className="inline-flex items-center justify-end gap-1">
                Realizado
                <IconeInfo texto={EXPLICACAO_REALIZADO_GERAL} />
              </span>
            </th>
            <th className="whitespace-nowrap px-4 py-2.5">
              <span className="inline-flex items-center gap-1">
                Atingimento
                <IconeInfo texto={EXPLICACAO_ATINGIMENTO} />
              </span>
            </th>
            <th className="whitespace-nowrap px-4 py-2.5">
              <span className="inline-flex items-center gap-1">
                Quintil
                <IconeInfo texto={EXPLICACAO_QUINTIL_CIDADE} />
              </span>
            </th>
            <th className="whitespace-nowrap px-4 py-2.5">Status</th>
            <th className="whitespace-nowrap px-4 py-2.5">Plano de ação</th>
            <th className="whitespace-nowrap px-4 py-2.5">FWA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cidades.map((cidade, indice) => {
            const resumo = resumoMetaRealizado(cidade);
            return (
              <tr
                key={cidade.id}
                className={`border-l-2 transition-colors hover:bg-slate-50 ${COR_ACENTO_STATUS[cidade.status] ?? 'border-l-transparent'}`}
              >
                <td className="px-4 py-3.5"><ChipPosicao posicao={indice + 1} /></td>
                <td className="min-w-[10rem] whitespace-nowrap px-4 py-3.5">
                  <Link
                    to={`${rotaBase}/cidades/${cidade.id}${sufixoRota}`}
                    className="font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
                  >
                    {cidade.nome}
                  </Link>
                </td>
                <td className="min-w-[8rem] whitespace-nowrap px-4 py-3.5 text-slate-600">{cidade.gerente ?? '—'}</td>
                <td className="px-4 py-3.5 text-right font-medium tabular-nums text-slate-700">{formatarValor(resumo.meta)}</td>
                <td className="px-4 py-3.5 text-right font-medium tabular-nums text-slate-700">{formatarValor(resumo.realizado)}</td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-24 shrink-0">
                      <BarraProgresso percentual={resumo.atingimento} />
                    </div>
                    <span className="w-12 shrink-0 text-right tabular-nums font-semibold text-slate-800">
                      {formatarPercentual(resumo.atingimento)}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5"><BadgeQuintil registro={cidade.quintil} curto /></td>
                <td className="whitespace-nowrap px-4 py-3.5"><StatusBadge status={cidade.status} /></td>
                <td className="whitespace-nowrap px-4 py-3.5"><BadgePlanoAcao temPlanoAtivo={cidade.temPlanoAtivo} /></td>
                <td className="whitespace-nowrap px-4 py-3.5"><BadgeFwa vendeFwa={cidade.vendeFwa} /></td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </>
  );
}