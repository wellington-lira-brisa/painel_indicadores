import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ClipboardPlus, Eye, EyeOff, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PERMISSOES } from '../services/permissaoService';
import { TECNOLOGIAS } from '../config/tecnologias';
import { listarPlanosPorCidade } from '../services/planoAcaoService';
import { formatarPercentual, formatarDataHora, formatarDataSimples, removerMarcacaoMarkdown } from '../utils/format';
import { usePeriodoAnalise } from '../hooks/usePeriodoAnalise';
import StatusBadge from '../components/StatusBadge';
import TendenciaBadge from '../components/TendenciaBadge';
import CardKpi from '../components/CardKpi';
import TabelaIndicadores from '../components/TabelaIndicadores';
import SeletorPeriodoAnalise from '../components/SeletorPeriodoAnalise';
import ResumoMediaPeriodo from '../components/ResumoMediaPeriodo';
import FormularioPlanoAcao from '../components/FormularioPlanoAcao';
import SeletorCanais from '../components/SeletorCanais';

/**
 * Detalhe de uma cidade — reutilizado por qualquer tecnologia (FTTH, 5G,
 * ...). `tecnologia` decide de onde a cidade é buscada e pra onde os links
 * de volta ao ranking apontam; todo o resto (KPIs, período, indicadores,
 * planos de ação) é o mesmo componente. Planos de ação e FWA não são
 * específicos de tecnologia (vivem por `cidade_id` no Supabase), por isso
 * `listarPlanosPorCidade` continua o mesmo import de sempre.
 */
export default function PaginaCidade({ tecnologia = TECNOLOGIAS.ftth }) {
  const { cidadeId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { temPermissao } = useAuth();
  const [cidade, setCidade] = useState(null);
  const [planos, setPlanos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [mediaPeriodoVisivel, setMediaPeriodoVisivel] = useState(true);

  // Mesmo filtro de canal aplicado no Ranking (chegou via query string do
  // link que trouxe até aqui — ver sufixoRota em PaginaRanking.jsx),
  // reaproveitado aqui pra abrir a cidade já no mesmo recorte que ela
  // apareceu na lista, em vez de voltar pro total.
  const canaisSelecionados = searchParams.get('canais')?.split(',').filter(Boolean) ?? [];
  const canaisChave = canaisSelecionados.join(',');
  const sufixoRota = canaisSelecionados.length > 0 ? `?canais=${encodeURIComponent(canaisChave)}` : '';

  function definirCanaisSelecionados(canais) {
    setSearchParams(
      (atual) => {
        const proximos = new URLSearchParams(atual);
        if (canais.length === 0) proximos.delete('canais');
        else proximos.set('canais', canais.join(','));
        return proximos;
      },
      { replace: true },
    );
  }

  // Chamado incondicionalmente (regra dos hooks) mesmo antes de `cidade`
  // carregar — o hook já lida com `cidade` nulo internamente.
  const periodoAnalise = usePeriodoAnalise(cidade);

  useEffect(() => {
    setCarregando(true);
    Promise.all([
      tecnologia.servicoCidades.buscarCidade(cidadeId, canaisSelecionados),
      listarPlanosPorCidade(cidadeId, tecnologia.id),
    ])
      .then(([dadosCidade, dadosPlanos]) => {
        setCidade(dadosCidade);
        setPlanos(dadosPlanos);
      })
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canaisChave (string estável) é a dependência real; canaisSelecionados é um array novo a cada render.
  }, [cidadeId, tecnologia, canaisChave]);

  if (carregando) return <EstadoCarregandoCidade />;

  if (!cidade) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Cidade não encontrada.</p>
        <Link to={(tecnologia.rotaBase || '/') + sufixoRota} className="text-sm font-medium text-brand-700 hover:underline">
          Voltar ao ranking
        </Link>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${tecnologia.classeTema}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to={(tecnologia.rotaBase || '/') + sufixoRota}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Ranking · {tecnologia.nome}
          </Link>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{cidade.nome}</h2>
          <p className="text-sm text-slate-500">
            Gerente: {cidade.gerente ?? '—'} · Regional: {cidade.regional ?? '—'} · Coord.: {cidade.coordenadorRegional ?? '—'}
          </p>
          {canaisSelecionados.length > 0 && (
            <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              Mostrando só: <strong>{canaisSelecionados.join(', ')}</strong> — meta continua sendo a da cidade inteira.
            </p>
          )}
          <div className="mt-2 max-w-xs">
            <label className="block text-xs font-medium text-slate-600">
              Canal
              <span className="ml-1 font-normal text-slate-400">(recalcula o realizado)</span>
            </label>
            <SeletorCanais
              canaisSelecionados={canaisSelecionados}
              aoAplicar={definirCanaisSelecionados}
              carregarCanaisDisponiveis={tecnologia.servicoCidades.carregarCanaisDisponiveis}
            />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <StatusBadge status={cidade.status} />
            <TendenciaBadge tendencia={cidade.tendencia} />
          </div>
        </div>

        {cidade.status === 'vermelho' && (
          <BotaoPlanoAcao
            podeCriar={temPermissao(PERMISSOES.CRIAR_PLANO_ACAO)}
            aoClicar={() => setFormularioAberto(true)}
          />
        )}
      </div>

      <section aria-label="Resumo da cidade" className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-4">
        <CardKpi titulo="Atingimento geral" valor={formatarPercentual(cidade.score)} destaque />
        <CardKpi
          titulo="Ativação comercial"
          valor={formatarDataSimples(cidade.ativacaoComercial)}
        />
        <CardKpi titulo="Indicadores monitorados" valor={cidade.indicadores.length} />
        <CardKpi titulo="Planos de ação" valor={planos.length} />
      </section>

      <section aria-label="Média por período" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-900">Média do período</h3>
          <button
            type="button"
            onClick={() => setMediaPeriodoVisivel((v) => !v)}
            aria-expanded={mediaPeriodoVisivel}
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {mediaPeriodoVisivel ? (
              <EyeOff className="size-3.5" aria-hidden="true" />
            ) : (
              <Eye className="size-3.5" aria-hidden="true" />
            )}
            {mediaPeriodoVisivel ? 'Ocultar média do período' : 'Mostrar média do período'}
          </button>
        </div>

        {mediaPeriodoVisivel && (
          <>
            <SeletorPeriodoAnalise
              mesInicial={periodoAnalise.mesInicial}
              mesFinal={periodoAnalise.mesFinal}
              mesAtual={periodoAnalise.mesAtual}
              mesesDisponiveis={periodoAnalise.mesesDisponiveis}
              quantidadeMeses={periodoAnalise.quantidadeMeses}
              selecionarMesInicial={periodoAnalise.selecionarMesInicial}
              selecionarMesFinal={periodoAnalise.selecionarMesFinal}
              aplicarPreset={periodoAnalise.aplicarPreset}
            />
            <ResumoMediaPeriodo
              mediasPorIndicador={periodoAnalise.mediasPorIndicador}
              mediaBaseAtiva={periodoAnalise.mediaBaseAtiva}
              mesInicial={periodoAnalise.mesInicial}
              mesFinal={periodoAnalise.mesFinal}
              mesesDisponiveis={periodoAnalise.mesesDisponiveis}
              quantidadeMeses={periodoAnalise.quantidadeMeses}
            />
          </>
        )}
      </section>

      <section aria-label="Indicadores mensais" className="space-y-3">
        <h3 className="text-base font-bold text-slate-900">Indicadores · meta x realizado</h3>
        <TabelaIndicadores indicadores={cidade.indicadores} baseAtiva={cidade.baseAtiva} cidade={cidade} />
      </section>

      {planos.length > 0 && (
        <section aria-label="Planos de ação da cidade" className="space-y-3">
          <h3 className="text-base font-bold text-slate-900">Planos de ação</h3>
          <ul className="space-y-2">
            {planos.map((plano) => (
              <li key={plano.id}>
                <Link
                  to={`/planos/${plano.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-700"
                >
                  <p className="line-clamp-2 text-sm text-slate-700">
                    {removerMarcacaoMarkdown(plano.oQue || plano.descricao)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {plano.criadoPor?.nome ?? 'Colaborador'} · {formatarDataHora(plano.criadoEm)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {formularioAberto && (
        <FormularioPlanoAcao cidade={cidade} tecnologiaId={tecnologia.id} aoFechar={() => setFormularioAberto(false)} />
      )}
    </div>
  );
}

/**
 * Esqueleto de carregamento — mesmo padrão visual (blocos cinza com pulse)
 * já usado em PaginaPlano, no formato real desta página (cabeçalho, 4 KPIs,
 * período, tabela) em vez de texto solto. Reduz o salto de layout quando os
 * dados chegam e dá feedback de que algo está acontecendo, não travado.
 */
function EstadoCarregandoCidade() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-40 rounded bg-slate-200/70" />
        <div className="h-7 w-56 rounded bg-slate-200/70" />
        <div className="h-4 w-72 rounded bg-slate-200/70" />
      </div>
      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-200/70" />
        ))}
      </div>
      <div className="h-40 rounded-xl bg-slate-200/70" />
      <div className="h-72 rounded-xl bg-slate-200/70" />
    </div>
  );
}

function BotaoPlanoAcao({ podeCriar, aoClicar }) {
  if (podeCriar) {
    return (
      <button
        type="button"
        onClick={aoClicar}
        className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
      >
        <ClipboardPlus className="size-4" aria-hidden="true" />
        Criar plano de ação
      </button>
    );
  }

  return (
    <div className="text-right">
      <button
        type="button"
        disabled
        className="inline-flex min-h-[48px] cursor-not-allowed items-center gap-2 rounded-lg bg-slate-200 px-4 text-sm font-semibold text-slate-500"
        aria-describedby="aviso-permissao-plano"
      >
        <Lock className="size-4" aria-hidden="true" />
        Criar plano de ação
      </button>
      <p id="aviso-permissao-plano" className="mt-1 text-xs text-slate-500">
        Você não tem permissão para criar planos de ação.
      </p>
    </div>
  );
}