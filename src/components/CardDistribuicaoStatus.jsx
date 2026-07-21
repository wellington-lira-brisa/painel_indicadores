const SEGMENTOS = [
  { chave: 'verde', rotulo: 'Saudável', corBarra: 'bg-emerald-500' },
  { chave: 'amarelo', rotulo: 'Atenção', corBarra: 'bg-amber-500' },
  { chave: 'vermelho', rotulo: 'Crítico', corBarra: 'bg-red-500' },
  { chave: 'semDado', rotulo: 'Sem meta', corBarra: 'bg-slate-300' },
];

/**
 * Substitui os 3 cards "Cidades saudáveis/em atenção/críticas" por 1 só:
 * barra proporcional (mesmas cores do StatusBadge da tabela, pra manter
 * o mesmo vocabulário visual em toda a tela) + legenda compacta com os
 * números. Mostra a proporção de cara, sem exigir comparar 3 cards.
 *
 * Inclui o segmento "Sem meta" (cidades sem meta cadastrada, status
 * `sem-dado` em statusCidade()) pra que o total deste card SEMPRE bata
 * com "N cidades" do painel de Filtros — os dois somam a mesma lista
 * (`cidadesFiltradas`); omitir esse grupo foi o que causava a
 * divergência 158 vs 161.
 */
export default function CardDistribuicaoStatus({ totais }) {
  const total = totais.verde + totais.amarelo + totais.vermelho + totais.semDado;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Distribuição por status</p>
        <p className="shrink-0 text-xs text-slate-400">
          {total} {total === 1 ? 'cidade' : 'cidades'}
        </p>
      </div>

      <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-slate-100">
        {total > 0 &&
          SEGMENTOS.map((segmento) => {
            const quantidade = totais[segmento.chave];
            if (quantidade === 0) return null;
            return (
              <div
                key={segmento.chave}
                className={segmento.corBarra}
                style={{ width: `${(quantidade / total) * 100}%` }}
                title={`${segmento.rotulo}: ${quantidade}`}
              />
            );
          })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {SEGMENTOS.filter((segmento) => totais[segmento.chave] > 0).map((segmento) => (
          <span key={segmento.chave} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className={`size-1.5 rounded-full ${segmento.corBarra}`} aria-hidden="true" />
            <span className="font-semibold tabular-nums text-slate-900">{totais[segmento.chave]}</span>
            {segmento.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}