import { useId, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarRange, ChevronDown, Users } from 'lucide-react';
import {
  QUINTIL_COR_BADGE,
  QUINTIL_COR_BARRA,
  QUINTIL_ROTULOS_CURTOS,
  EXPLICACAO_QUINTIL_CIDADE,
} from '../utils/quintil';
import { mesesConsecutivosAte, tendenciaEntreQuintis } from '../utils/historicoQuintil';
import { formatarPercentual, formatarValor } from '../utils/format';
import IconeInfo from './IconeInfo';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-07-01" -> "jul/2026" — só partes da string, sem Date (evita fuso). */
function rotuloMes(mesRef) {
  const [ano, mes] = mesRef.split('-');
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano}`;
}

function rotuloMesCompacto(mesRef) {
  const [ano, mes] = mesRef.split('-');
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano.slice(-2)}`;
}

function estiloLinha(quintil) {
  if (quintil === 5) return 'border-l-red-400 bg-red-50/30';
  if (quintil === 4) return 'border-l-orange-400 bg-orange-50/30';
  if (quintil === 1) return 'border-l-emerald-400';
  if (quintil === 2) return 'border-l-lime-400';
  if (quintil === 3) return 'border-l-amber-400';
  return 'border-l-slate-300';
}

function BadgeQuintilVendedor({ quintil }) {
  if (!quintil) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
        Sem meta
      </span>
    );
  }

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${QUINTIL_COR_BADGE[quintil]}`}>
      {QUINTIL_ROTULOS_CURTOS[quintil]}
    </span>
  );
}

const CONFIG_TENDENCIA = {
  melhorou: {
    texto: 'Melhorou',
    Icone: ArrowUpRight,
    classe: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  estavel: {
    texto: 'Estável',
    Icone: ArrowRight,
    classe: 'border-slate-200 bg-slate-50 text-slate-600',
  },
  caiu: {
    texto: 'Caiu',
    Icone: ArrowDownRight,
    classe: 'border-red-200 bg-red-50 text-red-700',
  },
  'sem-comparacao': {
    texto: 'Sem base',
    Icone: ArrowRight,
    classe: 'border-slate-200 bg-white text-slate-400',
  },
};

function BadgeTendencia({ tendencia, mostrarFaixas = false }) {
  const config = CONFIG_TENDENCIA[tendencia?.tipo] ?? CONFIG_TENDENCIA['sem-comparacao'];
  const textoFaixas =
    mostrarFaixas && tendencia?.faixas > 0
      ? ` ${tendencia.faixas} ${tendencia.faixas === 1 ? 'faixa' : 'faixas'}`
      : '';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config.classe}`}>
      <config.Icone className="size-3" aria-hidden="true" />
      {config.texto}
      {textoFaixas}
    </span>
  );
}

function BadgeQuintilHistorico({ registro }) {
  if (!registro) {
    return <span className="text-xs font-medium text-slate-300">—</span>;
  }
  if (!registro.quintil) {
    return (
      <span
        className="inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500"
        title="Sem meta"
      >
        S/M
      </span>
    );
  }
  return (
    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold ${QUINTIL_COR_BADGE[registro.quintil]}`}>
      {QUINTIL_ROTULOS_CURTOS[registro.quintil]}
    </span>
  );
}

function CanaisVendedor({ canais = [] }) {
  if (canais.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {canais.map((canal) => (
        <span
          key={canal}
          className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500"
        >
          {canal}
        </span>
      ))}
    </span>
  );
}

function HistoricoCidade({ registro }) {
  const meses = mesesConsecutivosAte(registro.mesRef);
  const porMes = new Map((registro.historico ?? [registro]).map((item) => [item.mesRef, item]));
  const mesAnterior = meses.at(-2);
  const anterior = porMes.get(mesAnterior);
  const atual = porMes.get(registro.mesRef);
  const tendencia = tendenciaEntreQuintis(anterior?.quintilCidade, atual?.quintilCidade);
  const hoje = new Date();
  const mesAtualCalendario = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  const movimentos = registro.historicoVendedores?.movimentos;
  const comparaveis = (movimentos?.melhoraram ?? 0) + (movimentos?.estaveis ?? 0) + (movimentos?.cairam ?? 0);

  return (
    <section aria-labelledby="titulo-historico-cidade" className="mt-4 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 id="titulo-historico-cidade" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <CalendarRange className="size-3.5 text-slate-400" aria-hidden="true" />
            Evolução da cidade
          </h4>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            Últimos seis meses, sem aproximar competências ausentes.
            {registro.mesRef === mesAtualCalendario && (
              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-600">
                Mês em andamento
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {anterior?.quintilCidade && atual?.quintilCidade && (
            <span className="text-[11px] font-semibold tabular-nums text-slate-500">
              Q{anterior.quintilCidade} → Q{atual.quintilCidade}
            </span>
          )}
          <BadgeTendencia tendencia={tendencia} mostrarFaixas />
        </div>
      </div>

      <ol className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Histórico mensal do quintil da cidade">
        {meses.map((mesRef) => {
          const item = porMes.get(mesRef);
          const ehAtual = mesRef === registro.mesRef;
          return (
            <li
              key={mesRef}
              className={`rounded-lg border px-2 py-2 text-center ${
                ehAtual ? 'border-blue-200 bg-blue-50/60 ring-1 ring-blue-100' : 'border-slate-200 bg-white'
              }`}
              title={mesRef === mesAtualCalendario ? 'Competência em andamento' : undefined}
            >
              <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                {rotuloMesCompacto(mesRef)}
              </span>
              <span className="mt-1 flex min-h-5 items-center justify-center">
                <BadgeQuintilHistorico
                  registro={item ? { quintil: item.quintilCidade } : null}
                />
              </span>
              <span className="mt-1 block text-[10px] font-semibold tabular-nums text-slate-600">
                {item ? formatarPercentual(item.atingimentoMedio * 100) : 'Sem dados'}
              </span>
            </li>
          );
        })}
      </ol>

      {movimentos && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
            <ArrowUpRight className="size-3" aria-hidden="true" /> {movimentos.melhoraram} melhoraram
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
            <ArrowRight className="size-3" aria-hidden="true" /> {movimentos.estaveis} permaneceram
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 font-semibold text-red-700">
            <ArrowDownRight className="size-3" aria-hidden="true" /> {movimentos.cairam} caíram
          </span>
          {comparaveis === 0 && (
            <span className="text-slate-400">Sem colaboradores comparáveis com o mês anterior.</span>
          )}
        </div>
      )}
    </section>
  );
}

function ValorVendedor({ rotulo, valor, percentual = false, destaque = false }) {
  return (
    <div className="min-w-0">
      <span className="block text-[9px] font-medium uppercase tracking-wide text-slate-400 sm:sr-only">
        {rotulo}
      </span>
      <span className={`block truncate text-xs tabular-nums ${destaque ? 'font-bold text-slate-800' : 'font-medium text-slate-600'}`}>
        {valor === null
          ? '—'
          : percentual
            ? formatarPercentual(valor * 100)
            : formatarValor(valor, 'Qtd')}
      </span>
    </div>
  );
}

function HistoricoVendedores({ historico }) {
  const [expandido, setExpandido] = useState(false);
  const conteudoId = useId();
  const meses = historico?.meses ?? [];
  const vendedores = historico?.vendedores ?? [];

  if (meses.length === 0 || vendedores.length === 0) return null;

  return (
    <section className="mt-3 rounded-lg border border-slate-200 bg-slate-50/40">
      <button
        type="button"
        onClick={() => setExpandido((valorAtual) => !valorAtual)}
        aria-expanded={expandido}
        aria-controls={conteudoId}
        className="flex min-h-10 w-full items-center justify-between gap-3 px-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
      >
        <span className="inline-flex items-center gap-1.5">
          <CalendarRange className="size-3.5 text-slate-400" aria-hidden="true" />
          Evolução dos colaboradores
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
          {expandido ? 'Recolher' : 'Ver histórico'}
          <ChevronDown
            className={`size-3.5 transition-transform duration-200 ${expandido ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {expandido && (
        <div id={conteudoId} className="border-t border-slate-200">
          <div className="hidden overflow-hidden sm:block">
            <div className="grid grid-cols-[minmax(12rem,1.8fr)_repeat(6,minmax(3.25rem,1fr))_6.5rem] gap-2 bg-slate-50 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              <span>Colaborador</span>
              {meses.map((mesRef) => (
                <span key={mesRef} className="text-center">{rotuloMesCompacto(mesRef)}</span>
              ))}
              <span className="text-center">Tendência</span>
            </div>
            <ul className="divide-y divide-slate-100 bg-white" aria-label="Evolução mensal dos colaboradores">
              {vendedores.map((vendedor) => (
                <li
                  key={vendedor.vendedorId}
                  className="grid grid-cols-[minmax(12rem,1.8fr)_repeat(6,minmax(3.25rem,1fr))_6.5rem] items-center gap-2 px-3 py-2.5"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 truncate text-xs font-semibold text-slate-800" title={vendedor.vendedor}>
                      {vendedor.vendedor}
                    </span>
                    <CanaisVendedor canais={vendedor.canais} />
                  </span>
                  {meses.map((mesRef) => (
                    <span key={mesRef} className="flex justify-center">
                      <BadgeQuintilHistorico registro={vendedor.porMes[mesRef]} />
                    </span>
                  ))}
                  <span className="flex justify-center">
                    <BadgeTendencia tendencia={vendedor.tendencia} />
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <ul className="divide-y divide-slate-200 sm:hidden" aria-label="Evolução mensal dos colaboradores">
            {vendedores.map((vendedor) => (
              <li key={vendedor.vendedorId} className="bg-white px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800" title={vendedor.vendedor}>
                      {vendedor.vendedor}
                    </p>
                    <span className="mt-1 block"><CanaisVendedor canais={vendedor.canais} /></span>
                  </div>
                  <BadgeTendencia tendencia={vendedor.tendencia} />
                </div>
                <ol className="mt-2.5 grid grid-cols-3 gap-1.5">
                  {meses.map((mesRef) => (
                    <li key={mesRef} className="rounded-md bg-slate-50 px-1.5 py-1.5 text-center">
                      <span className="block text-[8px] font-semibold uppercase text-slate-400">
                        {rotuloMesCompacto(mesRef)}
                      </span>
                      <span className="mt-1 flex justify-center">
                        <BadgeQuintilHistorico registro={vendedor.porMes[mesRef]} />
                      </span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function TabelaVendedores({ vendedores = [] }) {
  const [expandida, setExpandida] = useState(true);
  const conteudoId = useId();

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className={`flex flex-wrap items-center justify-between gap-2 ${expandida ? 'mb-2.5' : ''}`}>
        <div>
          <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <Users className="size-3.5 text-slate-400" aria-hidden="true" />
            Colaboradores
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-500">Ordenados do melhor quintil para o que exige mais atenção.</p>
        </div>
        <div className="flex items-center gap-2">
          {vendedores.length > 0 && (
            <span className="text-[11px] tabular-nums text-slate-400">
              {vendedores.length} {vendedores.length === 1 ? 'vendedor' : 'vendedores'}
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpandida((valorAtual) => !valorAtual)}
            aria-expanded={expandida}
            aria-controls={conteudoId}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {expandida ? 'Recolher' : 'Expandir'}
            <ChevronDown
              className={`size-3.5 transition-transform duration-200 ${expandida ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {expandida && (
        <div id={conteudoId}>
          {vendedores.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
              Detalhamento individual ainda não disponível para este período.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="hidden grid-cols-[minmax(0,1.8fr)_5rem_6rem_6rem_7rem] gap-3 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:grid">
                <span>Colaborador</span>
                <span>Quintil</span>
                <span className="text-right">Meta</span>
                <span className="text-right">Realizado</span>
                <span className="text-right">Atingimento</span>
              </div>

              <ul className="divide-y divide-slate-100" aria-label="Desempenho dos colaboradores por quintil">
                {vendedores.map((vendedor, indice) => (
                  <li
                    key={vendedor.vendedorId ?? `${vendedor.vendedor}-${indice}`}
                    className={`grid grid-cols-3 gap-x-3 gap-y-2 border-l-2 px-3 py-3 sm:grid-cols-[minmax(0,1.8fr)_5rem_6rem_6rem_7rem] sm:items-center sm:gap-3 sm:py-2.5 ${estiloLinha(vendedor.quintil)}`}
                  >
                    <span className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:col-span-1">
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-800" title={vendedor.vendedor}>
                        {vendedor.vendedor}
                      </span>
                      <CanaisVendedor canais={vendedor.canais} />
                    </span>
                    <span className="justify-self-end sm:justify-self-start">
                      <BadgeQuintilVendedor quintil={vendedor.quintil} />
                    </span>
                    <span className="sm:text-right">
                      <ValorVendedor rotulo="Meta" valor={vendedor.meta} />
                    </span>
                    <span className="sm:text-right">
                      <ValorVendedor rotulo="Realizado" valor={vendedor.realizado} />
                    </span>
                    <span className="sm:text-right">
                      <ValorVendedor rotulo="Atingimento" valor={vendedor.atingimento} percentual destaque />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
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

      <HistoricoCidade registro={registro} />
      <TabelaVendedores vendedores={registro.vendedores} />
      <HistoricoVendedores historico={registro.historicoVendedores} />
    </section>
  );
}