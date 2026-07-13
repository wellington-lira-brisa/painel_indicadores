import { useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CalendarRange,
  Frown,
  MapPin,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useFiltrosFeriados } from '../hooks/useFiltrosFeriados';
import { ESTADOS_DISPONIVEIS, TIPOS_FERIADO, municipioTemFeriadosProprios } from '../utils/feriadosBusca';
import { formatarDataSimples } from '../utils/format';

const ANO_ATUAL = new Date().getFullYear();
const ANOS_DISPONIVEIS = Array.from({ length: 7 }, (_, i) => ANO_ATUAL - 2 + i); // 2 anos atrás até 4 à frente

const ROTULO_TIPO = { NACIONAL: 'Nacional', ESTADUAL: 'Estadual', MUNICIPAL: 'Municipal' };
const COR_TIPO = {
  NACIONAL: 'bg-brand-50 text-brand-800 ring-brand-700/20',
  ESTADUAL: 'bg-violet-50 text-violet-800 ring-violet-700/20',
  MUNICIPAL: 'bg-emerald-50 text-emerald-800 ring-emerald-700/20',
};

const MESES_COMPLETOS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Consulta de feriados de qualquer cidade do Brasil — apoio pra investigar
 * se queda de indicador num período coincide com concentração de feriados
 * locais. Fonte dos dados: vendor/feriados (biblioteca de cálculo vendorizada
 * de outro projeto da equipe — ver diagnóstico completo no PR). Cobre os 27
 * estados por inteiro (nacional + estadual); feriado MUNICIPAL só existe
 * pros 238 municípios cadastrados na base — os demais aparecem na busca
 * normalmente, só sem feriado próprio de município.
 *
 * Tudo aqui é cálculo local, síncrono, sem chamada de rede — daí não ter
 * spinner de carregamento de fato: o resultado já está pronto no mesmo
 * frame em que o filtro muda.
 */
export default function PaginaFeriados() {
  const {
    filtros,
    atualizarFiltro,
    limparFiltros,
    termoBuscaCidade,
    setTermoBuscaCidade,
    sugestoesCidade,
    selecionarCidade,
    confirmarCidadeDigitada,
    limparCidade,
    resumo,
    erro,
    listaCompleta,
    listaPaginada,
    temMaisParaCarregar,
    carregarMais,
    quantidadeFiltrosAtivos,
  } = useFiltrosFeriados();

  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);

  const nenhumFiltroDeLocalidade = !filtros.uf && !filtros.cidade;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <CalendarDays className="size-6 text-brand-700" aria-hidden="true" />
          Calendário de Feriados
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Consulte feriados nacionais, estaduais e municipais de qualquer cidade do Brasil — útil pra
          entender se um período de baixo desempenho coincide com feriados locais.
        </p>
      </div>

      {/* Filtros ------------------------------------------------------ */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="relative">
            <label htmlFor="busca-cidade" className="block text-xs font-medium text-slate-600">
              Cidade
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="busca-cidade"
                type="text"
                value={termoBuscaCidade}
                onChange={(e) => {
                  setTermoBuscaCidade(e.target.value);
                  setSugestoesAbertas(true);
                  if (e.target.value === '') limparCidade();
                }}
                onFocus={() => setSugestoesAbertas(true)}
                onBlur={() => {
                  setTimeout(() => setSugestoesAbertas(false), 150);
                  confirmarCidadeDigitada();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmarCidadeDigitada();
                    setSugestoesAbertas(false);
                  }
                }}
                placeholder={filtros.uf ? 'Buscar ou escolher uma cidade…' : 'Buscar por nome da cidade…'}
                autoComplete="off"
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
              />

              {/* Dropdown é filho do MESMO container `relative` do input (não de um
                  container maior que também contém o texto de ajuda abaixo) —
                  `top-full` ancora ele exatamente na borda inferior do campo,
                  independente do que vier depois no DOM. Antes disso, ele herdava
                  a posição estática (depois do texto de ajuda) e ficava com um
                  vão enorme entre o campo e a lista. */}
              {sugestoesAbertas && (termoBuscaCidade || filtros.uf) && (
                <ul
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
                >
                  {sugestoesCidade.length === 0 ? (
                    <li className="px-3 py-2 text-slate-400">
                      {filtros.uf ? 'Nenhuma cidade encontrada neste estado.' : 'Nenhuma cidade encontrada.'}
                    </li>
                  ) : (
                    sugestoesCidade.map((m) => (
                      <li key={`${m.uf}:${m.cidade}`}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            selecionarCidade(m);
                            setSugestoesAbertas(false);
                          }}
                          className="flex w-full min-h-[40px] items-center gap-2 px-3 text-left hover:bg-slate-50"
                        >
                          <MapPin className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                          <span className="truncate">{m.cidade}</span>
                          {!filtros.uf && <span className="ml-auto shrink-0 text-xs text-slate-400">{m.uf}</span>}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {filtros.uf
                ? 'Mostra as cidades com feriado municipal cadastrado neste estado. Não achou a sua? Digite o nome e pressione Enter — mostra nacional + estadual mesmo assim.'
                : 'Selecione um Estado para ver a lista de cidades dele, ou busque por nome aqui.'}
            </p>
          </div>

          <div>
            <label htmlFor="filtro-estado" className="block text-xs font-medium text-slate-600">
              Estado
            </label>
            <select
              id="filtro-estado"
              value={filtros.uf}
              onChange={(e) => {
                atualizarFiltro('uf', e.target.value);
                if (filtros.cidade) limparCidade();
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            >
              <option value="">Todos os estados</option>
              {ESTADOS_DISPONIVEIS.map((e) => (
                <option key={e.acronimo} value={e.acronimo}>
                  {e.nome} ({e.acronimo})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filtro-ano" className="block text-xs font-medium text-slate-600">
              Ano
            </label>
            <select
              id="filtro-ano"
              value={filtros.ano}
              onChange={(e) => atualizarFiltro('ano', Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            >
              {ANOS_DISPONIVEIS.map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filtro-inicio" className="block text-xs font-medium text-slate-600">
              De
            </label>
            <input
              id="filtro-inicio"
              type="date"
              value={filtros.dataInicio}
              onChange={(e) => atualizarFiltro('dataInicio', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            />
          </div>

          <div>
            <label htmlFor="filtro-fim" className="block text-xs font-medium text-slate-600">
              Até
            </label>
            <input
              id="filtro-fim"
              type="date"
              value={filtros.dataFim}
              onChange={(e) => atualizarFiltro('dataFim', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            />
          </div>

          <div>
            <label htmlFor="filtro-tipo" className="block text-xs font-medium text-slate-600">
              Abrangência
            </label>
            <select
              id="filtro-tipo"
              value={filtros.tipo}
              onChange={(e) => atualizarFiltro('tipo', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            >
              <option value="">Todas</option>
              {TIPOS_FERIADO.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-2">
            <label htmlFor="filtro-nome" className="block text-xs font-medium text-slate-600">
              Nome do feriado
            </label>
            <input
              id="filtro-nome"
              type="text"
              value={filtros.nomeFeriado}
              onChange={(e) => atualizarFiltro('nomeFeriado', e.target.value)}
              placeholder="Ex.: Corpus Christi, aniversário da cidade…"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            />
          </div>

          {quantidadeFiltrosAtivos > 0 && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={limparFiltros}
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <X className="size-4" aria-hidden="true" />
                Limpar filtros
              </button>
            </div>
          )}
        </div>

        {filtros.cidade && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {filtros.cidade}/{filtros.uf}
            {!municipioTemFeriadosProprios(filtros.uf, filtros.cidade) && (
              <span className="text-amber-600">
                — sem feriado municipal próprio cadastrado na base; mostrando nacional + estadual.
              </span>
            )}
          </p>
        )}
      </div>

      {/* Estado inicial / sem localidade -------------------------------- */}
      {nenhumFiltroDeLocalidade && (
        <div className="flex items-start gap-2 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Nenhuma cidade ou estado selecionado — mostrando só os feriados nacionais de {filtros.ano}.
          Busque uma cidade acima para ver também os feriados estaduais e municipais dela.
        </div>
      )}

      {/* Erro ------------------------------------------------------------ */}
      {erro && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {erro}
        </div>
      )}

      {!erro && resumo && (
        <>
          <ResumoAnalitico resumo={resumo} ano={filtros.ano} />

          {listaCompleta.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
              <Frown className="size-8 text-slate-300" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-600">Nenhum feriado encontrado com esses filtros.</p>
              <p className="max-w-sm text-xs text-slate-400">
                Tente ampliar o período, remover o filtro de nome ou trocar a abrangência.
              </p>
            </div>
          ) : (
            <ListaFeriados itens={listaPaginada} />
          )}

          {temMaisParaCarregar && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={carregarMais}
                className="flex min-h-[44px] items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Carregar mais ({listaCompleta.length - listaPaginada.length} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResumoAnalitico({ resumo, ano }) {
  const mesesConcentracao = resumo.mesesComMaiorConcentracao.map((m) => MESES_COMPLETOS[m.mes]).join(', ');

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <CartaoResumo rotulo="Total no período" valor={resumo.total} />
      <CartaoResumo rotulo="Em dias úteis" valor={resumo.emDiasUteis} destaque="text-amber-700" />
      <CartaoResumo rotulo="Em fins de semana" valor={resumo.emFinsDeSemana} />
      <CartaoResumo
        rotulo="Próximo feriado"
        valor={
          resumo.proximoFeriado ? (
            <>
              {formatarDataSimples(resumo.proximoFeriado.chaveData)}
              <span className="block text-xs font-normal text-slate-500">{resumo.proximoFeriado.descricao}</span>
            </>
          ) : (
            '—'
          )
        }
        pequeno
      />
      <CartaoResumo
        rotulo={`Mês${resumo.mesesComMaiorConcentracao.length > 1 ? 'es' : ''} com mais feriados`}
        valor={mesesConcentracao || '—'}
        pequeno
      />
    </div>
  );
}

function CartaoResumo({ rotulo, valor, destaque, pequeno }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className={`mt-1 font-bold ${pequeno ? 'text-sm text-slate-800' : `text-2xl ${destaque ?? 'text-slate-800'}`}`}>
        {valor}
      </p>
    </div>
  );
}

function ListaFeriados({ itens }) {
  return (
    <>
      {/* Mobile: cards --------------------------------------------------- */}
      <ul className="space-y-2 md:hidden">
        {itens.map((f) => (
          <li key={`${f.chaveData}-${f.descricao}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{f.descricao}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatarDataSimples(f.chaveData)} · {f.diaSemana}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${COR_TIPO[f.tipo]}`}>
                {ROTULO_TIPO[f.tipo]}
              </span>
            </div>
            {(f.ehFimDeSemana || f.possibilidadeDeEmenda) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {!f.ehFimDeSemana && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Dia útil</span>
                )}
                {f.possibilidadeDeEmenda && (
                  <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                    <CalendarRange className="size-3" aria-hidden="true" />
                    Possível emenda
                  </span>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Desktop: tabela --------------------------------------------------- */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-brand-900 text-left text-xs font-semibold uppercase tracking-wide text-white">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Dia</th>
              <th className="px-4 py-3">Feriado</th>
              <th className="px-4 py-3">Abrangência</th>
              <th className="px-4 py-3">Observações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {itens.map((f) => (
              <tr key={`${f.chaveData}-${f.descricao}`} className={f.ehFimDeSemana ? 'bg-slate-50/60' : undefined}>
                <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-700">{formatarDataSimples(f.chaveData)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{f.diaSemana}</td>
                <td className="px-4 py-2.5 text-slate-800">{f.descricao}</td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${COR_TIPO[f.tipo]}`}>
                    {ROTULO_TIPO[f.tipo]}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {!f.ehFimDeSemana && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Dia útil</span>
                    )}
                    {f.possibilidadeDeEmenda && (
                      <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                        <CalendarRange className="size-3" aria-hidden="true" />
                        Possível emenda
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}