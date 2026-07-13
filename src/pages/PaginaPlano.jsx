import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  MapPin,
  Pencil,
  RotateCcw,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PERMISSOES, temPermissao } from '../services/permissaoService';
import {
  LIMITE_COMO,
  LIMITE_O_QUE,
  LIMITE_QUEM,
  atualizarPlano,
  buscarPlano,
  excluirPlano,
  validarCamposPlanoDetalhado,
} from '../services/planoAcaoService';
import { buscarCidade } from '../services/cidadeService';
import { foiAtualizado, formatarDataHora, formatarDataSimples } from '../utils/format';
import StatusBadge from '../components/StatusBadge';
import BadgeEvidenciaPendente from '../components/BadgeEvidenciaPendente';
import SeletorStatusPlano from '../components/SeletorStatusPlano';
import BotaoHistoricoPlano from '../components/BotaoHistoricoPlano';
import TabelaIndicadores from '../components/TabelaIndicadores';
import GaleriaEvidencias from '../components/GaleriaEvidencias';
import LightboxImagem from '../components/LightboxImagem';
import CapturaLocalizacaoEvidencia from '../components/CapturaLocalizacaoEvidencia';
import ModalAnexarEvidencias from '../components/ModalAnexarEvidencias';
import ModalConfirmacao from '../components/ModalConfirmacao';

const VisualizadorMarkdown = lazy(() => import('../components/VisualizadorMarkdown'));
const CampoMarkdown = lazy(() => import('../components/CampoMarkdown'));
const LIMITE_DESCRICAO_LEGADO = 8000;

const CAMPOS_ESTRUTURADOS_VAZIOS = { oQue: '', como: '', quem: '', quandoPrevisto: '' };

function textoSeguro(valor, fallback = '—') {
  const texto = String(valor ?? '').trim();
  return texto || fallback;
}

export default function PaginaPlano() {
  const { planoId } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [plano, setPlano] = useState(null);
  const [cidade, setCidade] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [tentativa, setTentativa] = useState(0);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [editando, setEditando] = useState(false);
  const [camposEditados, setCamposEditados] = useState(CAMPOS_ESTRUTURADOS_VAZIOS);
  const [errosCamposEdicao, setErrosCamposEdicao] = useState({});
  const [descricaoEditada, setDescricaoEditada] = useState('');
  const [motivoEdicao, setMotivoEdicao] = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState(null);
  const [indiceLightbox, setIndiceLightbox] = useState(null);
  const [anexandoEvidencias, setAnexandoEvidencias] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function carregarPlano() {
      if (!planoId) {
        setErro('ID do plano de ação não informado na URL.');
        setCarregando(false);
        return;
      }

      try {
        setCarregando(true);
        setErro(null);
        setPlano(null);
        setCidade(null);

        const dadosPlano = await buscarPlano(planoId);
        if (cancelado) return;

        setPlano(dadosPlano);

        if (dadosPlano?.cidadeId) {
          const dadosCidade = await buscarCidade(dadosPlano.cidadeId);
          if (!cancelado) setCidade(dadosCidade);
        }
      } catch (error) {
        if (!cancelado) {
          setErro(error?.message ?? 'Não foi possível carregar o plano de ação.');
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }

    carregarPlano();

    return () => {
      cancelado = true;
    };
  }, [planoId, tentativa]);

  if (carregando) return <EstadoCarregando />;

  if (erro) {
    return (
      <EstadoErro
        mensagem={erro}
        aoTentarNovamente={() => setTentativa((valor) => valor + 1)}
      />
    );
  }

  if (!plano) return <EstadoNaoEncontrado />;

  const nomeCidade = cidade?.nome ?? plano.cidadeId ?? 'Cidade não encontrada';
  const statusCidade = cidade?.status;
  const autor = plano.criadoPor ?? {};
  const podeExcluir = temPermissao(usuario, PERMISSOES.EXCLUIR_PLANO_ACAO);
  const podeEditar =
    plano.criadoPorId === usuario.id || temPermissao(usuario, PERMISSOES.EDITAR_PLANO_ACAO);

  function aoIniciarEdicao() {
    if (plano.estruturado) {
      setCamposEditados({
        oQue: plano.oQue ?? '',
        como: plano.como ?? '',
        quem: plano.quem ?? '',
        quandoPrevisto: plano.quandoPrevisto ?? '',
      });
    } else {
      setDescricaoEditada(plano.descricao ?? '');
    }
    setErrosCamposEdicao({});
    setMotivoEdicao('');
    setErroEdicao(null);
    setEditando(true);
  }

  function aoAlterarCampoEditado(chave, valor) {
    setCamposEditados((atual) => ({ ...atual, [chave]: valor }));
    setErrosCamposEdicao((atual) => (atual[chave] ? { ...atual, [chave]: null } : atual));
  }

  async function aoSalvarEdicao() {
    setErroEdicao(null);

    if (plano.estruturado) {
      const { valido, errosPorCampo } = validarCamposPlanoDetalhado(camposEditados);
      setErrosCamposEdicao(errosPorCampo);
      if (!valido) {
        setErroEdicao('Corrija os campos destacados antes de salvar.');
        return;
      }
    }

    setSalvandoEdicao(true);
    try {
      const atualizado = plano.estruturado
        ? await atualizarPlano(plano.id, { ...camposEditados, motivo: motivoEdicao })
        : await atualizarPlano(plano.id, { descricao: descricaoEditada, motivo: motivoEdicao });
      setPlano(atualizado);
      setEditando(false);
    } catch (excecao) {
      setErroEdicao(excecao.message);
    } finally {
      setSalvandoEdicao(false);
    }
  }

  return (
    <>
      <div className="min-w-0 max-w-full space-y-5 overflow-x-hidden">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/planos"
                    className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-900 hover:underline"
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Planos de ação
                  </Link>
                  {cidade && (
                    <>
                      <span className="text-slate-300">/</span>
                      <Link
                        to={`/cidades/${cidade.id}`}
                        className="font-medium text-slate-500 hover:text-brand-800 hover:underline"
                      >
                        {cidade.nome}
                      </Link>
                    </>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <BotaoHistoricoPlano planoId={plano.id} />
                  {podeEditar && !editando && (
                    <button
                      type="button"
                      onClick={aoIniciarEdicao}
                      className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Editar
                    </button>
                  )}
                  {podeExcluir && (
                    <button
                      type="button"
                      onClick={() => setConfirmandoExclusao(true)}
                      className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Excluir definitivamente
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-800">
                  <ClipboardList className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">Plano de ação</h2>
                  <p className="mt-1 break-words text-sm text-slate-500">
                    Detalhamento do plano registrado para{' '}
                    <span className="font-semibold text-slate-700">{nomeCidade}</span>.
                  </p>
                </div>
                {statusCidade && <StatusBadge status={statusCidade} />}
                <BadgeEvidenciaPendente temEvidencias={plano.temEvidencias} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:min-w-[25rem]">
              <ResumoPlano
                Icone={UserRound}
                rotulo="Responsável"
                valor={textoSeguro(autor.nome, 'Colaborador')}
                detalhe={autor.matricula ? `matrícula ${autor.matricula}` : autor.cargo}
              />
              <ResumoPlano
                Icone={CalendarClock}
                rotulo="Registrado em"
                valor={formatarDataHora(plano.criadoEm)}
                detalhe={
                  foiAtualizado(plano.criadoEm, plano.atualizadoEm)
                    ? `Atualizado ${formatarDataHora(plano.atualizadoEm)}`
                    : null
                }
              />
            </div>
          </div>
        </section>

        <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <FileText className="size-5 text-brand-700" aria-hidden="true" />
              <h3 className="text-base font-bold text-slate-900">Detalhes do plano</h3>
            </div>

            {editando ? (
              <Suspense fallback={<CarregandoCampos />}>
                {plano.estruturado ? (
                  <FormularioEdicaoEstruturado
                    campos={camposEditados}
                    erros={errosCamposEdicao}
                    aoAlterarCampo={aoAlterarCampoEditado}
                  />
                ) : (
                  <div className="mt-4">
                    <CampoMarkdown
                      nome="descricao-edicao"
                      valor={descricaoEditada}
                      aoAlterar={setDescricaoEditada}
                      limiteCaracteres={LIMITE_DESCRICAO_LEGADO}
                      obrigatorio
                    />
                  </div>
                )}

                {erroEdicao && (
                  <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {erroEdicao}
                  </p>
                )}

                <div className="mt-4">
                  <label htmlFor="motivo-edicao" className="block text-sm font-medium text-slate-700">
                    Motivo da alteração <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <input
                    id="motivo-edicao"
                    type="text"
                    maxLength={280}
                    value={motivoEdicao}
                    onChange={(e) => setMotivoEdicao(e.target.value)}
                    placeholder="Ex.: Ajuste após reunião com o gestor"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                  />
                  <p className="mt-1 text-xs text-slate-500">Aparece no histórico de alterações deste plano.</p>
                </div>

                <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setEditando(false)}
                    disabled={salvandoEdicao}
                    className="flex min-h-[44px] items-center justify-center rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={aoSalvarEdicao}
                    disabled={salvandoEdicao}
                    className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                  >
                    {salvandoEdicao && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    {salvandoEdicao ? 'Salvando…' : 'Salvar alterações'}
                  </button>
                </div>
              </Suspense>
            ) : plano.estruturado ? (
              <Suspense fallback={<p className="mt-4 text-sm text-slate-400">Carregando conteúdo…</p>}>
                <VisualizacaoEstruturada plano={plano} />
              </Suspense>
            ) : (
              <Suspense fallback={<p className="mt-4 text-sm text-slate-400">Carregando conteúdo…</p>}>
                <div className="mt-4">
                  <VisualizadorMarkdown valor={plano.descricao} textoVazio="Sem descrição informada." />
                </div>
              </Suspense>
            )}
          </article>

          <aside className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <MapPin className="size-5 text-brand-700" aria-hidden="true" />
              <h3 className="text-base font-bold text-slate-900">Contexto comercial</h3>
            </div>

            <dl className="mt-4 space-y-4 text-sm">
              <InfoPlano rotulo="Cidade" valor={nomeCidade} />
              <InfoPlano rotulo="Regional" valor={cidade?.regional} />
              <InfoPlano rotulo="Gerente" valor={cidade?.gerente} />
              <InfoPlano rotulo="Coordenador regional" valor={cidade?.coordenadorRegional} />
              <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status do plano</dt>
                <dd className="mt-1.5">
                  <SeletorStatusPlano plano={plano} podeAlterar={podeEditar} aoAtualizarPlano={setPlano} />
                </dd>
              </div>
            </dl>
          </aside>
        </section>

        {plano.evidencias.length > 0 ? (
          <section aria-label="Evidências anexadas" className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="size-5 text-brand-700" aria-hidden="true" />
                  <h3 className="text-base font-bold text-slate-900">Evidências anexadas</h3>
                </div>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => setAnexandoEvidencias(true)}
                    className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                  >
                    <ImagePlus className="size-3.5" aria-hidden="true" />
                    Anexar mais evidências
                  </button>
                )}
              </div>
              <div className="mt-4">
                <GaleriaEvidencias
                  itens={plano.evidencias.map((ev) => ({ id: ev.id, url: ev.imagemUrl }))}
                  aoAbrirImagem={setIndiceLightbox}
                />
              </div>
            </article>
            <div className="space-y-3">
              {plano.localizacoesEvidencia.length > 0 ? (
                plano.localizacoesEvidencia.map((localizacao) => (
                  <CapturaLocalizacaoEvidencia key={localizacao.id ?? localizacao.capturadaEm} localizacao={localizacao} obrigatoria={false} />
                ))
              ) : (
                <CapturaLocalizacaoEvidencia localizacao={null} obrigatoria={false} />
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-slate-600 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <ImageIcon className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-slate-800">Evidências pendentes</p>
                  <p className="mt-1">
                    Este plano ainda não tem evidências anexadas. Assim que a ação for executada em
                    campo, anexe as fotos e a localização para concluir o registro.
                  </p>
                </div>
              </div>
              {podeEditar && (
                <button
                  type="button"
                  onClick={() => setAnexandoEvidencias(true)}
                  className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                >
                  <ImagePlus className="size-4" aria-hidden="true" />
                  Anexar evidências
                </button>
              )}
            </div>
          </section>
        )}

        {indiceLightbox !== null && (
          <LightboxImagem
            itens={plano.evidencias.map((ev) => ({
              url: ev.imagemUrl,
              metadados: ev.metadados,
              criadoEm: ev.criadoEm,
              localizacaoEvidencia: ev.localizacaoEvidencia,
            }))}
            indiceInicial={indiceLightbox}
            criadoPor={plano.criadoPor}
            aoFechar={() => setIndiceLightbox(null)}
          />
        )}

        {cidade?.indicadores?.length > 0 && (
          <section aria-label="Indicadores da cidade" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Indicadores de {cidade.nome}</h3>
                <p className="text-sm text-slate-500">Use os indicadores para acompanhar se o plano está gerando recuperação.</p>
              </div>
              <Link
                to={`/cidades/${cidade.id}`}
                className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-brand-700 shadow-sm hover:border-brand-300 hover:bg-brand-50"
              >
                Ver cidade
              </Link>
            </div>
            <TabelaIndicadores indicadores={cidade.indicadores} baseAtiva={cidade.baseAtiva} cidade={cidade} />
          </section>
        )}
      </div>

      {anexandoEvidencias && (
        <ModalAnexarEvidencias
          plano={plano}
          aoFechar={() => setAnexandoEvidencias(false)}
          aoAnexado={(planoAtualizado) => {
            setPlano(planoAtualizado);
            setAnexandoEvidencias(false);
          }}
        />
      )}

      {confirmandoExclusao && (
        <ModalConfirmacao
          titulo="Excluir plano de ação"
          mensagem="Isso remove o plano, sua descrição e a imagem de evidência permanentemente. Não pode ser desfeito."
          rotuloConfirmar="Excluir definitivamente"
          aoFechar={() => setConfirmandoExclusao(false)}
          aoConfirmar={async () => {
            await excluirPlano(plano);
            navigate('/planos', { replace: true });
          }}
        />
      )}
    </>
  );
}

/** Leitura dos 4 campos estruturados, cada um com seu próprio título. */
function VisualizacaoEstruturada({ plano }) {
  return (
    <div className="mt-4 space-y-5">
      <BlocoDetalhe titulo="O quê?">
        <VisualizadorMarkdown valor={plano.oQue} textoVazio="Não informado." />
      </BlocoDetalhe>
      <BlocoDetalhe titulo="Como?">
        <VisualizadorMarkdown valor={plano.como} textoVazio="Não informado." />
      </BlocoDetalhe>
      <BlocoDetalhe titulo="Quem?">
        <VisualizadorMarkdown valor={plano.quem} textoVazio="Não informado." />
      </BlocoDetalhe>
      <BlocoDetalhe titulo="Quando?">
        <p className="text-sm leading-6 text-slate-800">{formatarDataSimples(plano.quandoPrevisto)}</p>
      </BlocoDetalhe>
    </div>
  );
}

function BlocoDetalhe({ titulo, children }) {
  return (
    <div className="min-w-0">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{titulo}</h4>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Formulário de edição dos 4 campos — mesmos limites e componente do formulário de criação. */
function FormularioEdicaoEstruturado({ campos, erros, aoAlterarCampo }) {
  return (
    <div className="mt-4 space-y-4">
      <CampoMarkdown
        nome="o-que-edicao"
        rotulo="O quê?"
        obrigatorio
        compacto
        valor={campos.oQue}
        aoAlterar={(valor) => aoAlterarCampo('oQue', valor)}
        limiteCaracteres={LIMITE_O_QUE}
        erro={erros.oQue}
      />
      <CampoMarkdown
        nome="como-edicao"
        rotulo="Como?"
        obrigatorio
        valor={campos.como}
        aoAlterar={(valor) => aoAlterarCampo('como', valor)}
        limiteCaracteres={LIMITE_COMO}
        alturaMinima={220}
        erro={erros.como}
      />
      <CampoMarkdown
        nome="quem-edicao"
        rotulo="Quem?"
        obrigatorio
        compacto
        valor={campos.quem}
        aoAlterar={(valor) => aoAlterarCampo('quem', valor)}
        limiteCaracteres={LIMITE_QUEM}
        erro={erros.quem}
      />
      <div>
        <label htmlFor="quando-edicao" className="block text-sm font-medium text-slate-700">
          Quando? <span className="text-red-600">*</span>
        </label>
        <input
          id="quando-edicao"
          type="date"
          required
          value={campos.quandoPrevisto}
          onChange={(e) => aoAlterarCampo('quandoPrevisto', e.target.value)}
          aria-invalid={Boolean(erros.quandoPrevisto)}
          className={`mt-1 w-full rounded-lg border px-3 py-3 text-base focus:outline-none focus:ring-1 ${
            erros.quandoPrevisto
              ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
              : 'border-slate-300 focus:border-brand-700 focus:ring-brand-700'
          }`}
        />
        {erros.quandoPrevisto && <p role="alert" className="mt-1 text-xs text-red-600">{erros.quandoPrevisto}</p>}
      </div>
    </div>
  );
}

function CarregandoCampos() {
  return (
    <div className="mt-4 flex h-[120px] items-center justify-center rounded-lg border border-slate-300 text-sm text-slate-400">
      Carregando editor…
    </div>
  );
}

function ResumoPlano({ Icone, rotulo, valor, detalhe }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icone className="size-4" aria-hidden="true" />
        {rotulo}
      </div>
      <p className="mt-2 break-words text-sm font-bold text-slate-900">{valor}</p>
      {detalhe && <p className="mt-0.5 break-words text-xs text-slate-500">{detalhe}</p>}
    </div>
  );
}

function InfoPlano({ rotulo, valor }) {
  const valorTratado = textoSeguro(valor);

  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{rotulo}</dt>
      <dd className="mt-1 break-words font-medium text-slate-800">{valorTratado}</dd>
    </div>
  );
}

function EstadoCarregando() {
  return (
    <div className="space-y-4">
      <div className="h-36 animate-pulse rounded-2xl bg-slate-200/70" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="h-52 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="h-52 animate-pulse rounded-2xl bg-slate-200/70" />
      </div>
    </div>
  );
}

function EstadoErro({ mensagem, aoTentarNovamente }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-semibold">Não foi possível abrir o plano de ação</h2>
          <p className="mt-1 text-red-700">{mensagem}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={aoTentarNovamente}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Tentar novamente
            </button>
            <Link
              to="/planos"
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-white px-3 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100"
            >
              Voltar aos planos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function EstadoNaoEncontrado() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <CheckCircle2 className="mx-auto size-10 text-slate-300" aria-hidden="true" />
      <h2 className="mt-3 text-base font-bold text-slate-900">Plano de ação não encontrado</h2>
      <p className="mt-1 text-sm text-slate-500">
        O registro pode ter sido removido, ou o link acessado não corresponde a um plano válido.
      </p>
      <Link
        to="/planos"
        className="mt-5 inline-flex min-h-[40px] items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
      >
        Ver lista de planos
      </Link>
    </div>
  );
}