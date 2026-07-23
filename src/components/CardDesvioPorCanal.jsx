import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatarValor } from '../utils/format';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function rotuloMes(mesRef) {
  const [ano, mes] = mesRef.split('-');
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano}`;
}

function ordenarPorImpacto(linhas) {
  return [...linhas].sort((a, b) => Math.abs(b.desvio) - Math.abs(a.desvio));
}

function estiloImpacto(desvio) {
  if (desvio > 0) {
    return {
      Icone: ArrowUpRight,
      texto: 'text-emerald-700',
      fundo: 'bg-emerald-50',
      barra: 'bg-emerald-500',
      rotulo: 'Acima da meta',
    };
  }

  if (desvio < 0) {
    return {
      Icone: ArrowDownRight,
      texto: 'text-red-600',
      fundo: 'bg-red-50',
      barra: 'bg-red-400',
      rotulo: 'Abaixo da meta',
    };
  }

  return {
    Icone: Minus,
    texto: 'text-slate-600',
    fundo: 'bg-slate-100',
    barra: 'bg-slate-400',
    rotulo: 'Na meta',
  };
}

function LinhaCanal({ registro, unidade, maiorImpacto }) {
  const estilo = estiloImpacto(registro.desvio);
  const largura = maiorImpacto > 0
    ? Math.max((Math.abs(registro.desvio) / maiorImpacto) * 100, 4)
    : 0;

  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{registro.canal}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{estilo.rotulo}</p>
        </div>

        <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-bold tabular-nums ${estilo.fundo} ${estilo.texto}`}>
          <estilo.Icone className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
          {registro.desvio > 0 ? '+' : ''}
          {formatarValor(registro.desvio, unidade)}
        </span>
      </div>

      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div
          className={`h-full rounded-full ${estilo.barra}`}
          style={{ width: `${largura}%` }}
        />
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Meta</dt>
          <dd className="text-xs font-medium tabular-nums text-slate-600">
            {formatarValor(registro.meta, unidade)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-l border-slate-200 pl-3">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Realizado</dt>
          <dd className="text-xs font-semibold tabular-nums text-slate-700">
            {formatarValor(registro.realizado, unidade)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

function BlocoCanais({ linhas, unidade, titulo }) {
  if (!linhas?.length) return null;

  const canaisOrdenados = ordenarPorImpacto(linhas);
  const maiorImpacto = Math.max(...canaisOrdenados.map((registro) => Math.abs(registro.desvio)), 0);

  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</h4>
        <span className="text-[11px] tabular-nums text-slate-400">
          {canaisOrdenados.length} {canaisOrdenados.length === 1 ? 'canal' : 'canais'}
        </span>
      </div>

      <ol className="space-y-2" aria-label={`${titulo}: canais por impacto`}>
        {canaisOrdenados.map((registro) => (
          <LinhaCanal
            key={registro.canal}
            registro={registro}
            unidade={unidade}
            maiorImpacto={maiorImpacto}
          />
        ))}
      </ol>
    </div>
  );
}

/**
 * Impacto por canal da cidade (realizado − meta) para o indicador principal
 * da tecnologia, no mês atual e no acumulado do ano.
 */
export default function CardDesvioPorCanal({ desvio, unidade }) {
  if (!desvio?.acumulado?.length) return null;

  const temMesAtual = desvio.mesAtual?.length > 0;
  const mesAtualLabel = temMesAtual ? rotuloMes(desvio.mesAtual[0].mesRef) : null;

  return (
    <section
      aria-labelledby="titulo-impacto-canal"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h3 id="titulo-impacto-canal" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Impacto por canal
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Diferença entre realizado e meta, do maior impacto para o menor.
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500" aria-label="Legenda">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Acima
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-red-400" aria-hidden="true" />
            Abaixo
          </span>
        </div>
      </header>

      <div className={`mt-4 ${temMesAtual ? 'grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6' : ''}`}>
        {temMesAtual && (
          <BlocoCanais linhas={desvio.mesAtual} unidade={unidade} titulo={mesAtualLabel} />
        )}
        <BlocoCanais linhas={desvio.acumulado} unidade={unidade} titulo="Acumulado no ano" />
      </div>
    </section>
  );
}