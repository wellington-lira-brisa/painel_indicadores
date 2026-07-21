import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarClock,
  ChevronRight,
  Clock3,
  FileText,
  Inbox,
  MapPin,
  Radio,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react';
import { listarPlanos } from '../services/planoAcaoService';
import { listarCidades } from '../services/cidadeService';
import { formatarDataHora, removerMarcacaoMarkdown } from '../utils/format';
import StatusBadge from '../components/StatusBadge';
import StatusPlanoBadge from '../components/StatusPlanoBadge';
import BadgeEvidenciaPendente from '../components/BadgeEvidenciaPendente';
import { STATUS_PLANO_ROTULOS, normalizarStatusPlano } from '../utils/statusPlano';
import PaginaPlano from './PaginaPlano';

const FILTRO_TODOS = 'todos';
const ORDEM_PADRAO = 'recentes';

const STATUS_OPCOES = [
  { valor: FILTRO_TODOS, rotulo: 'Todos' },
  { valor: 'vermelho', rotulo: 'Críticos' },
  { valor: 'amarelo', rotulo: 'Atenção' },
  { valor: 'verde', rotulo: 'Saudáveis' },
  { valor: 'sem-cidade', rotulo: 'Sem cidade' },
];

const STATUS_ROTULOS = {
  verde: 'Saudável',
  amarelo: 'Atenção',
  vermelho: 'Crítico',
  'sem-dado': 'Sem meta',
  'sem-cidade': 'Sem cidade',
};

const ORDEM_OPCOES = [
  { valor: 'recentes', rotulo: 'Mais recentes' },
  { valor: 'antigos', rotulo: 'Mais antigos' },
  { valor: 'cidade', rotulo: 'Cidade A-Z' },
  { valor: 'status', rotulo: 'Prioridade' },
  { valor: 'relevancia', rotulo: 'Relevância da busca' },
];

const PRIORIDADE_STATUS = {
  vermelho: 1,
  amarelo: 2,
  verde: 3,
  'sem-cidade': 4,
};

function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function tokenizarBusca(valor) {
  return normalizarTexto(valor).split(/\s+/).filter(Boolean);
}

function dataEmMs(iso) {
  const tempo = new Date(iso).getTime();
  return Number.isFinite(tempo) ? tempo : 0;
}

function limitarTexto(texto, limite = 260) {
  const valor = removerMarcacaoMarkdown(texto);
  if (valor.length <= limite) return valor;
  return `${valor.slice(0, limite).trim()}…`;
}

function pluralizar(quantidade, singular, plural = `${singular}s`) {
  return quantidade === 1 ? singular : plural;
}

/** Texto de prévia do card: plano estruturado usa "O quê", plano legado usa a descrição livre. */
function textoPrevia(plano) {
  return plano.estruturado ? plano.oQue : plano.descricao;
}

function montarPlanoParaBusca(plano, cidadesPorId) {
  const cidade = cidadesPorId[plano.cidadeId] ?? null;
  const statusCidade = cidade?.status ?? 'sem-cidade';
  const autor = plano.criadoPor ?? {};

  const textoBusca = [
    cidade?.nome,
    cidade?.uf,
    cidade?.regional,
    cidade?.gerente,
    cidade?.coordenadorRegional,
    STATUS_ROTULOS[statusCidade],
    plano.oQue,
    plano.como,
    plano.quem,
    plano.descricao,
    plano.status,
    STATUS_PLANO_ROTULOS[normalizarStatusPlano(plano.status)],
    autor.nome,
    autor.matricula,
    autor.cargo,
    formatarDataHora(plano.criadoEm),
  ].join(' ');

  return {
    ...plano,
    cidade,
    statusCidade,
    cidadeNome: cidade?.nome ?? plano.cidadeId ?? 'Cidade não encontrada',
    autorNome: autor.nome ?? 'Colaborador',
    textoBuscaNormalizado: normalizarTexto(textoBusca),
  };
}

function calcularRelevancia(plano, buscaNormalizada, tokens) {
  if (!buscaNormalizada || tokens.length === 0) return 0;

  const cidade = normalizarTexto(plano.cidadeNome);
  const descricao = normalizarTexto(plano.estruturado ? `${plano.oQue} ${plano.como}` : plano.descricao);
  const autor = normalizarTexto(plano.autorNome);
  const regional = normalizarTexto(plano.cidade?.regional);
  let pontos = 0;

  if (cidade === buscaNormalizada) pontos += 90;
  if (cidade.startsWith(buscaNormalizada)) pontos += 60;
  if (descricao.includes(buscaNormalizada)) pontos += 25;
  if (autor.includes(buscaNormalizada)) pontos += 15;
  if (regional.includes(buscaNormalizada)) pontos += 10;

  tokens.forEach((token) => {
    if (cidade.includes(token)) pontos += 12;
    if (descricao.includes(token)) pontos += 6;
    if (autor.includes(token)) pontos += 4;
    if (regional.includes(token)) pontos += 3;
  });

  return pontos;
}

export default function PaginaListaPlanos() {
  const { planoId } = useParams();

  // Defesa contra rota configurada por engano como /planos/:planoId -> PaginaListaPlanos.
  // Quando existir um planoId na URL, esta tela entrega imediatamente o detalhe do plano.
  if (planoId) return <PaginaPlano />;

  const [searchParams, setSearchParams] = useSearchParams();
  const [planos, setPlanos] = useState([]);
  const [cidadesPorId, setCidadesPorId] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [tentativa, setTentativa] = useState(0);

  const busca = searchParams.get('q') ?? '';
  const statusParam = searchParams.get('status') ?? FILTRO_TODOS;
  const ordemParam = searchParams.get('ordem') ?? ORDEM_PADRAO;
  const statusSelecionado = STATUS_OPCOES.some((opcao) => opcao.valor === statusParam) ? statusParam : FILTRO_TODOS;
  const ordemSelecionada = ORDEM_OPCOES.some((opcao) => opcao.valor === ordemParam) ? ordemParam : ORDEM_PADRAO;
  const buscaAdiada = useDeferredValue(busca);

  useEffect(() => {
    let cancelado = false;

    async function carregarDados() {
      try {
        setCarregando(true);
        setErro(null);

        const [dadosPlanos, cidades] = await Promise.all([listarPlanos(), listarCidades()]);

        if (cancelado) return;

        setPlanos(dadosPlanos ?? []);
        setCidadesPorId(Object.fromEntries((cidades ?? []).map((cidade) => [cidade.id, cidade])));
      } catch (error) {
        if (!cancelado) {
          setErro(error?.message ?? 'Não foi possível carregar os planos de ação.');
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    carregarDados();

    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  function atualizarParametro(chave, valor) {
    const proximosParametros = new URLSearchParams(searchParams);
    const valorTratado = String(valor ?? '').trim();

    if (
      !valorTratado ||
      (chave === 'status' && valorTratado === FILTRO_TODOS) ||
      (chave === 'ordem' && valorTratado === ORDEM_PADRAO)
    ) {
      proximosParametros.delete(chave);
    } else {
      proximosParametros.set(chave, valorTratado);
    }

    setSearchParams(proximosParametros, { replace: true });
  }

  function limparFiltros() {
    setSearchParams({}, { replace: true });
  }

  const planosComCidade = useMemo(
    () => planos.map((plano) => montarPlanoParaBusca(plano, cidadesPorId)),
    [planos, cidadesPorId],
  );

  const contadores = useMemo(() => {
    const status = planosComCidade.reduce(
      (acc, plano) => {
        acc[plano.statusCidade] = (acc[plano.statusCidade] ?? 0) + 1;
        return acc;
      },
      { vermelho: 0, amarelo: 0, verde: 0, 'sem-cidade': 0 },
    );

    return {
      total: planosComCidade.length,
      cidades: new Set(planosComCidade.map((plano) => plano.cidadeId).filter(Boolean)).size,
      autores: new Set(planosComCidade.map((plano) => plano.criadoPor?.matricula ?? plano.criadoPor?.nome).filter(Boolean))
        .size,
      status,
    };
  }, [planosComCidade]);

  const planosFiltrados = useMemo(() => {
    const buscaNormalizada = normalizarTexto(buscaAdiada);
    const tokens = tokenizarBusca(buscaAdiada);
    const ordem = ORDEM_OPCOES.some((opcao) => opcao.valor === ordemSelecionada) ? ordemSelecionada : ORDEM_PADRAO;

    return planosComCidade
      .filter((plano) => {
        const passouNoStatus = statusSelecionado === FILTRO_TODOS || plano.statusCidade === statusSelecionado;
        const passouNaBusca = tokens.length === 0 || tokens.every((token) => plano.textoBuscaNormalizado.includes(token));
        return passouNoStatus && passouNaBusca;
      })
      .map((plano) => ({
        ...plano,
        relevancia: calcularRelevancia(plano, buscaNormalizada, tokens),
      }))
      .sort((a, b) => {
        if (ordem === 'relevancia' && tokens.length > 0) {
          return b.relevancia - a.relevancia || dataEmMs(b.criadoEm) - dataEmMs(a.criadoEm);
        }

        if (ordem === 'antigos') return dataEmMs(a.criadoEm) - dataEmMs(b.criadoEm);
        if (ordem === 'cidade') return a.cidadeNome.localeCompare(b.cidadeNome, 'pt-BR');
        if (ordem === 'status') {
          return (
            (PRIORIDADE_STATUS[a.statusCidade] ?? 99) - (PRIORIDADE_STATUS[b.statusCidade] ?? 99) ||
            dataEmMs(b.criadoEm) - dataEmMs(a.criadoEm)
          );
        }

        return dataEmMs(b.criadoEm) - dataEmMs(a.criadoEm);
      });
  }, [buscaAdiada, ordemSelecionada, planosComCidade, statusSelecionado]);

  const possuiFiltros = Boolean(busca.trim()) || statusSelecionado !== FILTRO_TODOS || ordemSelecionada !== ORDEM_PADRAO;
  const filtrosStatusDisponiveis = STATUS_OPCOES.filter(
    (opcao) =>
      opcao.valor === FILTRO_TODOS ||
      opcao.valor === statusSelecionado ||
      (contadores.status[opcao.valor] ?? 0) > 0,
  );

  if (carregando) return <EstadoCarregando />;

  if (erro) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="font-semibold">Não foi possível carregar os planos</h2>
            <p className="mt-1 text-red-700">{erro}</p>
            <button
              type="button"
              onClick={() => setTentativa((valor) => valor + 1)}
              className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <CabecalhoPlanos contadores={contadores} />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Filtros dos planos">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_13rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={busca}
              onChange={(evento) => atualizarParametro('q', evento.target.value)}
              placeholder="Pesquisar por cidade, UF, regional, gerente, autor ou trecho do plano..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-10 text-sm text-slate-900 outline-none transition focus:border-brand-700 focus:bg-white focus:ring-2 focus:ring-brand-700/10"
            />
            {busca && (
              <button
                type="button"
                onClick={() => atualizarParametro('q', '')}
                aria-label="Limpar pesquisa"
                className="absolute right-2 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <label className="sr-only" htmlFor="status-plano">
            Filtrar por status
          </label>
          <select
            id="status-plano"
            value={statusSelecionado}
            onChange={(evento) => atualizarParametro('status', evento.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-brand-700 focus:ring-2 focus:ring-brand-700/10"
          >
            {filtrosStatusDisponiveis.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="ordem-plano">
            Ordenar planos
          </label>
          <select
            id="ordem-plano"
            value={ordemSelecionada}
            onChange={(evento) => atualizarParametro('ordem', evento.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-brand-700 focus:ring-2 focus:ring-brand-700/10"
          >
            {ORDEM_OPCOES.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {filtrosStatusDisponiveis.map((opcao) => {
              const ativo = statusSelecionado === opcao.valor;
              const quantidade = opcao.valor === FILTRO_TODOS ? contadores.total : contadores.status[opcao.valor];

              return (
                <button
                  key={opcao.valor}
                  type="button"
                  onClick={() => atualizarParametro('status', opcao.valor)}
                  className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                    ativo
                      ? 'border-brand-700 bg-brand-700 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800'
                  }`}
                >
                  {opcao.rotulo}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${ativo ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {quantidade ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          {possuiFiltros && (
            <button
              type="button"
              onClick={limparFiltros}
              className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg px-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="size-4" aria-hidden="true" />
              Limpar filtros
            </button>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-slate-700">
          {planosFiltrados.length} {pluralizar(planosFiltrados.length, 'plano encontrado', 'planos encontrados')}
        </p>
        {buscaAdiada && (
          <p className="text-xs text-slate-500">
            Busca aplicada em cidade, regional, gerente, autor e descrição do plano.
          </p>
        )}
      </div>

      {contadores.total === 0 ? (
        <EstadoVazio />
      ) : planosFiltrados.length === 0 ? (
        <EstadoSemResultado onLimpar={limparFiltros} />
      ) : (
        <ul className="grid gap-3">
          {planosFiltrados.map((plano) => (
            <CardPlano key={plano.id} plano={plano} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CabecalhoPlanos({ contadores }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-800">
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            Gestão de planos
          </p>
          <h2 className="mt-3 text-xl font-bold text-slate-950 sm:text-2xl">Planos de ação</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Acompanhe os planos por cidade, priorize pontos críticos e encontre rapidamente ações pelo conteúdo,
            responsável ou estrutura comercial.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[34rem]">
          <ResumoCard Icone={FileText} rotulo="Planos" valor={contadores.total} />
          <ResumoCard Icone={MapPin} rotulo="Cidades" valor={contadores.cidades} />
          <ResumoCard Icone={AlertCircle} rotulo="Críticos" valor={contadores.status.vermelho} destaque="danger" />
          <ResumoCard Icone={UserRound} rotulo="Autores" valor={contadores.autores} />
        </div>
      </div>
    </section>
  );
}

function ResumoCard({ Icone, rotulo, valor, destaque }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        destaque === 'danger' ? 'border-red-100 bg-red-50 text-red-900' : 'border-slate-100 bg-slate-50 text-slate-900'
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Icone className="size-4" aria-hidden="true" />
        {rotulo}
      </div>
      <p className="mt-2 text-2xl font-bold leading-none">{valor}</p>
    </div>
  );
}

function CardPlano({ plano }) {
  return (
    <li>
      <Link
        to={`/planos/${plano.id}`}
        className="group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-brand-800 sm:text-base">{plano.cidadeNome}</h3>
              {plano.statusCidade === 'sem-cidade' ? (
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  Sem cidade vinculada
                </span>
              ) : (
                <StatusBadge status={plano.statusCidade} />
              )}
              <StatusPlanoBadge status={plano.status} />
              <BadgeEvidenciaPendente temEvidencias={plano.temEvidencias} />
              {plano.canal && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                  <Radio className="size-3" aria-hidden="true" />
                  {plano.canal}
                </span>
              )}
            </div>

            <p
              className="mt-3 text-sm leading-6 text-slate-700"
              title={removerMarcacaoMarkdown(textoPrevia(plano))}
              style={{ overflowWrap: 'anywhere' }}
            >
              {limitarTexto(textoPrevia(plano))}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="size-3.5" aria-hidden="true" />
                {plano.autorNome}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-3.5" aria-hidden="true" />
                {formatarDataHora(plano.criadoEm)}
              </span>
              {plano.cidade?.regional && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {plano.cidade.regional}
                </span>
              )}
              {plano.cidade?.gerente && (
                <span className="inline-flex items-center gap-1.5">Gerente: {plano.cidade.gerente}</span>
              )}
              {plano.classificacaoNoMomento && (
                <span className="inline-flex items-center gap-1.5">
                  Criado como: {STATUS_ROTULOS[plano.classificacaoNoMomento]}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500 lg:flex-col lg:items-end lg:border-t-0 lg:pt-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              Atualizado {formatarDataHora(plano.atualizadoEm ?? plano.criadoEm)}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-brand-700 group-hover:text-brand-900">
              Ver detalhes
              <ChevronRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function EstadoCarregando() {
  return (
    <div className="space-y-4">
      <div className="h-36 animate-pulse rounded-2xl bg-slate-200/70" />
      <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
      </div>
    </div>
  );
}

function EstadoVazio() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
      <Inbox className="mx-auto size-10 text-slate-300" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-slate-700">Nenhum plano de ação registrado.</p>
      <p className="mt-1 text-xs text-slate-500">
        Abra qualquer cidade no ranking e use “Criar plano de ação”.
      </p>
    </div>
  );
}

function EstadoSemResultado({ onLimpar }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
      <Search className="mx-auto size-10 text-slate-300" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-slate-700">Nenhum plano encontrado com esses filtros.</p>
      <p className="mt-1 text-xs text-slate-500">Tente pesquisar por cidade, gerente, regional, autor ou palavra-chave.</p>
      <button
        type="button"
        onClick={onLimpar}
        className="mt-4 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        <X className="size-4" aria-hidden="true" />
        Limpar filtros
      </button>
    </div>
  );
}