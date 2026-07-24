import { useId, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  ChevronDown,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import {
  QUINTIL_COR_BADGE,
  QUINTIL_COR_BARRA,
  QUINTIL_ROTULOS_CURTOS,
  EXPLICACAO_QUINTIL_CIDADE,
  ROTULO_CURTO_INDICADOR_INSTALACAO,
} from '../utils/quintil';
import { mesesConsecutivosAte, tendenciaEntreQuintis } from '../utils/historicoQuintil';
import { formatarPercentual, formatarValor } from '../utils/format';
import {
  agruparVendedoresPorIndicador,
  filtrarGruposQuintil,
  listarIndicadoresDisponiveis,
  ordenarGruposQuintil,
} from '../utils/visaoQuintilVendedores';
import IconeInfo from './IconeInfo';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const DESCRICAO_QUINTIL = {
  1: 'Q1 · melhor desempenho · atingimento de 100% ou mais',
  2: 'Q2 · atingimento de 80% a 99,9%',
  3: 'Q3 · atingimento de 60% a 79,9%',
  4: 'Q4 · atingimento de 30% a 59,9%',
  5: 'Q5 · desempenho mais baixo · atingimento abaixo de 30%',
};

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
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${QUINTIL_COR_BADGE[quintil]}`}
      title={DESCRICAO_QUINTIL[quintil]}
      aria-label={DESCRICAO_QUINTIL[quintil]}
    >
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

/** "Vendas instaladas Combo 1 Chip - FTTH" -> "Combo 1"; sem entrada no
 * mapa (indicador novo ainda não catalogado) usa o nome completo — feio,
 * nunca quebra. */
function rotuloIndicador(indicador) {
  if (!indicador) return null;
  return ROTULO_CURTO_INDICADOR_INSTALACAO[indicador] ?? indicador;
}

function nomeIndicador(indicador, tecnologiaId) {
  if (indicador) return indicador;
  return tecnologiaId === '5g' ? 'Ativação 5G avulso' : 'Indicador sem meta';
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
              {vendedores.map((vendedor) => {
                const rotulo = rotuloIndicador(vendedor.indicador);
                return (
                  <li
                    key={`${vendedor.vendedorId}\u0001${vendedor.indicador ?? ''}`}
                    className="grid grid-cols-[minmax(12rem,1.8fr)_repeat(6,minmax(3.25rem,1fr))_6.5rem] items-center gap-2 px-3 py-2.5"
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 truncate text-xs font-semibold text-slate-800" title={vendedor.vendedor}>
                        {vendedor.vendedor}
                      </span>
                      {rotulo && (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                          {rotulo}
                        </span>
                      )}
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
                );
              })}
            </ul>
          </div>

          <ul className="divide-y divide-slate-200 sm:hidden" aria-label="Evolução mensal dos colaboradores">
            {vendedores.map((vendedor) => {
              const rotulo = rotuloIndicador(vendedor.indicador);
              return (
                <li key={`${vendedor.vendedorId}\u0001${vendedor.indicador ?? ''}`} className="bg-white px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 truncate text-xs font-semibold text-slate-800" title={vendedor.vendedor}>
                        {vendedor.vendedor}
                        {rotulo && (
                          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                            {rotulo}
                          </span>
                        )}
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
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function DistribuicaoQuintis({ grupo, tecnologiaId }) {
  const quintis = [1, 2, 3, 4, 5];

  return (
    <span className="flex flex-wrap items-center gap-1" aria-label="Distribuição dos quintis">
      {quintis.map((quintil) => {
        const quantidade = grupo.distribuicao[quintil];
        if (!quantidade) return null;
        const indicadores = grupo.indicadores
          .filter((item) => item.quintil === quintil)
          .map((item) => nomeIndicador(item.indicador, tecnologiaId))
          .join(' · ');
        return (
          <span
            key={quintil}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${QUINTIL_COR_BADGE[quintil]}`}
            title={`${DESCRICAO_QUINTIL[quintil]} · ${indicadores}`}
            aria-label={`${DESCRICAO_QUINTIL[quintil]}. ${quantidade} ${quantidade === 1 ? 'indicador' : 'indicadores'}: ${indicadores}`}
          >
            Q{quintil}
            <span className="font-semibold opacity-70">×{quantidade}</span>
          </span>
        );
      })}
      {grupo.distribuicao.semMeta > 0 && (
        <span
          className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
          title={`${grupo.distribuicao.semMeta} indicador(es) sem meta`}
        >
          Sem meta ×{grupo.distribuicao.semMeta}
        </span>
      )}
    </span>
  );
}

function DetalheIndicadores({ grupo, tecnologiaId }) {
  return (
    <div className="animar-expansao border-t border-slate-200 bg-slate-50/60 p-2.5 sm:p-3">
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white sm:block">
        <div className="grid grid-cols-[minmax(13rem,2fr)_5rem_6rem_7rem_5rem_7rem] gap-3 bg-slate-50 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          <span>Indicador</span>
          <span className="text-right">Meta</span>
          <span className="text-right">Realizado</span>
          <span className="text-right">Atingimento</span>
          <span>Quintil</span>
          <span>Evolução</span>
        </div>
        <ul className="divide-y divide-slate-100" aria-label={`Indicadores de ${grupo.vendedor}`}>
          {grupo.indicadores.map((item, indice) => {
            const nome = nomeIndicador(item.indicador, tecnologiaId);
            return (
              <li
                key={`${item.indicador ?? 'sem-indicador'}-${indice}`}
                className={`grid grid-cols-[minmax(13rem,2fr)_5rem_6rem_7rem_5rem_7rem] items-center gap-3 border-l-2 px-3 py-2.5 ${estiloLinha(item.quintil)}`}
              >
                <span
                  className="min-w-0 whitespace-normal break-words text-xs font-semibold leading-4 text-slate-700"
                  title={nome}
                >
                  {nome}
                </span>
                <span className="text-right"><ValorVendedor rotulo="Meta" valor={item.meta} /></span>
                <span className="text-right"><ValorVendedor rotulo="Realizado" valor={item.realizado} /></span>
                <span className="text-right">
                  <ValorVendedor rotulo="Atingimento" valor={item.atingimento} percentual destaque />
                </span>
                <span><BadgeQuintilVendedor quintil={item.quintil} /></span>
                <span><BadgeTendencia tendencia={item.tendencia} /></span>
              </li>
            );
          })}
        </ul>
      </div>

      <ul className="space-y-2 sm:hidden" aria-label={`Indicadores de ${grupo.vendedor}`}>
        {grupo.indicadores.map((item, indice) => {
          const nome = nomeIndicador(item.indicador, tecnologiaId);
          return (
            <li
              key={`${item.indicador ?? 'sem-indicador'}-${indice}`}
              className={`rounded-lg border border-slate-200 border-l-2 bg-white p-3 ${estiloLinha(item.quintil)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 whitespace-normal break-words text-xs font-semibold leading-4 text-slate-700" title={nome}>
                  {nome}
                </p>
                <BadgeQuintilVendedor quintil={item.quintil} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <ValorVendedor rotulo="Meta" valor={item.meta} />
                <ValorVendedor rotulo="Realizado" valor={item.realizado} />
                <ValorVendedor rotulo="Atingimento" valor={item.atingimento} percentual destaque />
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2">
                <span className="text-[10px] font-medium text-slate-400">Evolução no mês</span>
                <BadgeTendencia tendencia={item.tendencia} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TabelaVendedores({ vendedores = [], historico = null, tecnologiaId }) {
  const [expandida, setExpandida] = useState(true);
  const [grupoExpandido, setGrupoExpandido] = useState(null);
  const [filtroIndicador, setFiltroIndicador] = useState('');
  const [filtroQuintil, setFiltroQuintil] = useState('');
  const [ordenacao, setOrdenacao] = useState('atencao');
  const conteudoId = useId();
  const idBaseGrupo = useId().replaceAll(':', '');
  const grupos = useMemo(
    () => agruparVendedoresPorIndicador(vendedores, historico),
    [vendedores, historico],
  );
  const indicadoresDisponiveis = useMemo(
    () => listarIndicadoresDisponiveis(grupos),
    [grupos],
  );
  const gruposExibidos = useMemo(
    () =>
      ordenarGruposQuintil(
        filtrarGruposQuintil(grupos, {
          indicador: filtroIndicador,
          quintil: filtroQuintil,
        }),
        ordenacao,
      ),
    [filtroIndicador, filtroQuintil, grupos, ordenacao],
  );

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <div className={`flex flex-wrap items-center justify-between gap-2 ${expandida ? 'mb-2.5' : ''}`}>
        <div>
          <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <Users className="size-3.5 text-slate-400" aria-hidden="true" />
            Colaboradores
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Uma linha por colaborador. Abra para ver os quintis de cada indicador.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {grupos.length > 0 && (
            <span className="text-[11px] tabular-nums text-slate-400">
              {gruposExibidos.length === grupos.length
                ? grupos.length
                : `${gruposExibidos.length} de ${grupos.length}`}{' '}
              {grupos.length === 1 ? 'vendedor' : 'vendedores'}
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
          {grupos.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
              Detalhamento individual ainda não disponível para este período.
            </p>
          ) : (
            <>
              <div className="mb-2.5 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 sm:grid-cols-[minmax(10rem,1fr)_8rem_minmax(11rem,13rem)]">
                <label className="min-w-0">
                  <span className="sr-only">Filtrar por indicador</span>
                  <select
                    value={filtroIndicador}
                    onChange={(evento) => setFiltroIndicador(evento.target.value)}
                    className="min-h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-100"
                    title="Filtrar colaboradores por indicador"
                  >
                    <option value="">Todos os indicadores</option>
                    {indicadoresDisponiveis.map((indicador) => (
                      <option key={indicador} value={indicador}>{indicador}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">Filtrar por quintil</span>
                  <select
                    value={filtroQuintil}
                    onChange={(evento) => setFiltroQuintil(evento.target.value)}
                    className="min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-100"
                  >
                    <option value="">Todos os quintis</option>
                    {[1, 2, 3, 4, 5].map((quintil) => (
                      <option key={quintil} value={quintil}>Q{quintil}</option>
                    ))}
                    <option value="sem-meta">Sem meta</option>
                  </select>
                </label>
                <label className="relative">
                  <span className="sr-only">Ordenar colaboradores</span>
                  <SlidersHorizontal
                    className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <select
                    value={ordenacao}
                    onChange={(evento) => setOrdenacao(evento.target.value)}
                    className="min-h-9 w-full rounded-md border border-slate-300 bg-white py-1 pl-7 pr-2 text-xs font-medium text-slate-700 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-100"
                  >
                    <option value="atencao">Mais críticos primeiro</option>
                    <option value="nome">Nome (A–Z)</option>
                    <option value="q1">Maior quantidade em Q1</option>
                    <option value="melhor">Melhor quintil</option>
                    <option value="pior">Pior quintil</option>
                    <option value="quedas">Mais indicadores em queda</option>
                    <option value="atingimento-maior">Maior atingimento médio</option>
                    <option value="atingimento-menor">Menor atingimento médio</option>
                  </select>
                </label>
              </div>

              {gruposExibidos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">
                  Nenhum colaborador corresponde aos filtros selecionados.
                </p>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-white sm:max-h-[36rem] sm:overflow-y-auto">
                  <div
                    className="sticky top-0 z-10 hidden grid-cols-[minmax(14rem,1.6fr)_6rem_minmax(12rem,1fr)_5rem_minmax(9rem,.8fr)_2.75rem] gap-3 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-slate-400 backdrop-blur sm:grid"
                    role="row"
                  >
                    <span>Colaborador</span>
                    <span>Indicadores</span>
                    <span>Distribuição</span>
                    <span className="text-center">Em queda</span>
                    <span>Mais crítico</span>
                    <span className="sr-only">Detalhes</span>
                  </div>

                  <div className="divide-y divide-slate-100" role="table" aria-label="Quintis por colaborador">
                    {gruposExibidos.map((grupo, indiceGrupo) => {
                      const chaveGrupo = grupo.vendedorId ?? grupo.vendedor;
                      const aberto = grupoExpandido === chaveGrupo;
                      const detalheId = `${idBaseGrupo}-detalhe-${indiceGrupo}`;
                      const critico = grupo.indicadorCritico;
                      const nomeCritico = critico
                        ? nomeIndicador(critico.indicador, tecnologiaId)
                        : 'Sem indicador';

                      return (
                        <article
                          key={chaveGrupo}
                          className={`transition-colors ${aberto ? 'bg-brand-50/50 ring-1 ring-inset ring-brand-100' : 'bg-white'}`}
                        >
                          <div
                            className="hidden grid-cols-[minmax(14rem,1.6fr)_6rem_minmax(12rem,1fr)_5rem_minmax(9rem,.8fr)_2.75rem] items-center gap-3 px-3 py-2.5 sm:grid"
                            role="row"
                          >
                            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1" role="cell">
                              <span className="min-w-0 whitespace-normal break-words text-xs font-semibold leading-4 text-slate-800" title={grupo.vendedor}>
                                {grupo.vendedor}
                              </span>
                              <CanaisVendedor canais={grupo.canais} />
                            </span>
                            <span className="text-xs font-semibold tabular-nums text-slate-600" role="cell">
                              {grupo.quantidadeIndicadores}
                            </span>
                            <span role="cell">
                              <DistribuicaoQuintis grupo={grupo} tecnologiaId={tecnologiaId} />
                            </span>
                            <span className={`text-center text-xs font-semibold tabular-nums ${grupo.emQueda > 0 ? 'text-red-700' : 'text-slate-400'}`} role="cell">
                              {grupo.emQueda}
                            </span>
                            <span className="flex min-w-0 items-center gap-1.5" role="cell">
                              {critico && <BadgeQuintilVendedor quintil={critico.quintil} />}
                              <span className="min-w-0 truncate text-[11px] font-medium text-slate-600" title={nomeCritico}>
                                {nomeCritico}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setGrupoExpandido((atual) => (atual === chaveGrupo ? null : chaveGrupo))}
                              aria-expanded={aberto}
                              aria-controls={detalheId}
                              aria-label={`${aberto ? 'Recolher' : 'Expandir'} indicadores de ${grupo.vendedor}`}
                              className="inline-flex size-9 items-center justify-center justify-self-end rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-brand-100 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-1"
                            >
                              <ChevronDown
                                className={`size-4 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
                                aria-hidden="true"
                              />
                            </button>
                          </div>

                          <div className="p-3 sm:hidden">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h5 className="whitespace-normal break-words text-sm font-semibold leading-5 text-slate-800" title={grupo.vendedor}>
                                  {grupo.vendedor}
                                </h5>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <CanaisVendedor canais={grupo.canais} />
                                  <span className="text-[10px] font-medium text-slate-400">
                                    {grupo.quantidadeIndicadores} {grupo.quantidadeIndicadores === 1 ? 'indicador' : 'indicadores'}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setGrupoExpandido((atual) => (atual === chaveGrupo ? null : chaveGrupo))}
                                aria-expanded={aberto}
                                aria-controls={detalheId}
                                aria-label={`${aberto ? 'Recolher' : 'Expandir'} indicadores de ${grupo.vendedor}`}
                                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
                              >
                                <ChevronDown
                                  className={`size-4 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                            <div className="mt-2.5">
                              <DistribuicaoQuintis grupo={grupo} tecnologiaId={tecnologiaId} />
                            </div>
                            <div className="mt-2.5 flex items-start justify-between gap-3 rounded-md bg-slate-50 px-2.5 py-2">
                              <div className="min-w-0">
                                <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-400">Mais crítico</span>
                                <span className="mt-0.5 block whitespace-normal break-words text-[11px] font-medium leading-4 text-slate-600" title={nomeCritico}>
                                  {nomeCritico}
                                </span>
                              </div>
                              <div className="shrink-0 text-right">
                                {critico && <BadgeQuintilVendedor quintil={critico.quintil} />}
                                <span className={`mt-1 block text-[10px] font-semibold ${grupo.emQueda > 0 ? 'text-red-700' : 'text-slate-400'}`}>
                                  {grupo.emQueda} em queda
                                </span>
                              </div>
                            </div>
                          </div>

                          {aberto && (
                            <div id={detalheId}>
                              <DetalheIndicadores grupo={grupo} tecnologiaId={tecnologiaId} />
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
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
export default function CardQuintisCidade({ registro, tecnologiaId }) {
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
      <TabelaVendedores
        vendedores={registro.vendedores}
        historico={registro.historicoVendedores}
        tecnologiaId={tecnologiaId}
      />
      <HistoricoVendedores historico={registro.historicoVendedores} />
    </section>
  );
}