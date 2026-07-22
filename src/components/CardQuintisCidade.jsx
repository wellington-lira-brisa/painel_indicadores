import { QUINTIL_COR_BARRA, QUINTIL_ROTULOS_CURTOS, EXPLICACAO_QUINTIL_CIDADE } from '../utils/quintil';
import IconeInfo from './IconeInfo';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-07-01" -> "jul/2026" — só partes da string, sem Date (evita fuso). */
function rotuloMes(mesRef) {
  const [ano, mes] = mesRef.split('-');
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano}`;
}

/**
 * Distribuição do time da cidade por quintil (TAM) — mesmo padrão visual
 * do CardDistribuicaoStatus do Ranking: barra segmentada proporcional +
 * legenda com contagens. Faixa "Sem meta" (cinza) entra na barra e na
 * legenda pra soma sempre bater com o total de vendedores — nenhum
 * vendedor "some" da visão.
 */
export default function CardQuintisCidade({ registro }) {
  const faixas = [
    { chave: 1, qtd: registro.q1 },
    { chave: 2, qtd: registro.q2 },
    { chave: 3, qtd: registro.q3 },
    { chave: 4, qtd: registro.q4 },
    { chave: 5, qtd: registro.q5 },
  ];
  const total = registro.totalVendedores;

  return (
    <section aria-label="Distribuição do time por quintil" className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Time por quintil · {rotuloMes(registro.mesRef)}
          <IconeInfo texto={EXPLICACAO_QUINTIL_CIDADE} />
        </h3>
        <span className="text-xs tabular-nums text-slate-500">
          {total} vendedor(es) · atingimento médio {Math.round(registro.atingimentoMedio * 100)}%
        </span>
      </div>

      <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Distribuição de ${total} vendedores por quintil`}>
        {faixas.map(({ chave, qtd }) =>
          qtd > 0 ? (
            <div key={chave} className={QUINTIL_COR_BARRA[chave]} style={{ width: `${(qtd / total) * 100}%` }} />
          ) : null,
        )}
        {registro.semMeta > 0 && <div className="bg-slate-300" style={{ width: `${(registro.semMeta / total) * 100}%` }} />}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {faixas.map(({ chave, qtd }) => (
          <li key={chave} className="inline-flex items-center gap-1.5 tabular-nums">
            <span className={`size-2 rounded-full ${QUINTIL_COR_BARRA[chave]}`} aria-hidden="true" />
            {QUINTIL_ROTULOS_CURTOS[chave]}: <strong className="font-semibold text-slate-800">{qtd}</strong>
          </li>
        ))}
        {registro.semMeta > 0 && (
          <li className="inline-flex items-center gap-1.5 tabular-nums">
            <span className="size-2 rounded-full bg-slate-300" aria-hidden="true" />
            Sem meta: <strong className="font-semibold text-slate-800">{registro.semMeta}</strong>
          </li>
        )}
      </ul>
    </section>
  );
}