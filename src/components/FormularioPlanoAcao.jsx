import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LIMITE_COMO,
  LIMITE_O_QUE,
  LIMITE_QUEM,
  criarPlano,
  localizacaoEvidenciaObrigatoria,
  validarCamposPlanoDetalhado,
} from '../services/planoAcaoService';
import { useCapturaEvidencias } from '../hooks/useCapturaEvidencias';
import ModalFormulario from './ModalFormulario';
import BlocoAnexoEvidencias from './BlocoAnexoEvidencias';
import LightboxImagem from './LightboxImagem';

const CampoMarkdown = lazy(() => import('./CampoMarkdown'));

const CAMPOS_VAZIOS = { oQue: '', como: '', quem: '', quandoPrevisto: '' };

/**
 * Formulário estruturado do plano de ação: 4 perguntas obrigatórias
 * (O quê / Como / Quem / Quando) em vez de um único campo livre.
 * Validação de obrigatoriedade e de dados sensíveis roda no submit, antes
 * de qualquer chamada ao Supabase — mesma função usada pelo service
 * (`validarCamposPlano`), então o erro que aparece aqui é exatamente o
 * que o banco também aplicaria.
 *
 * Evidências: anexar aqui é OPCIONAL — o plano pode ser salvo sem nenhuma
 * imagem (fluxo real: colaborador cria o plano numa reunião e só depois
 * vai a campo). Se já tiver as fotos em mãos, pode anexar direto aqui;
 * senão, o mesmo fluxo de anexo fica disponível depois em "Anexar
 * evidências" na tela do plano (ver ModalAnexarEvidencias) — os dois usam
 * o mesmo hook (useCapturaEvidencias) e o mesmo bloco visual
 * (BlocoAnexoEvidencias), então o comportamento é idêntico nos dois
 * momentos, só muda quando cada um acontece.
 */
export default function FormularioPlanoAcao({ cidade, tecnologiaId, aoFechar }) {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [campos, setCampos] = useState(CAMPOS_VAZIOS);
  const [errosCampos, setErrosCampos] = useState({});
  const [indiceLightbox, setIndiceLightbox] = useState(null);
  const [erroGeral, setErroGeral] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const {
    imagens,
    processandoImagem,
    erroImagens,
    aoSelecionarImagens,
    removerImagem,
    localizacaoEvidencia,
    statusLocalizacao,
    erroLocalizacao,
    aoClicarCapturarLocalizacao,
  } = useCapturaEvidencias();

  function atualizarCampo(chave, valor) {
    setCampos((atual) => ({ ...atual, [chave]: valor }));
    setErrosCampos((atual) => (atual[chave] ? { ...atual, [chave]: null } : atual));
  }

  /**
   * Valida tudo no client antes de gastar uma chamada de rede — mesma
   * validação que o service repete (defesa em profundidade), agora
   * apontando o erro certo pro campo certo, em vez de uma mensagem única.
   */
  function validarAntesDeEnviar() {
    const { valido, errosPorCampo } = validarCamposPlanoDetalhado(campos);
    setErrosCampos(errosPorCampo);

    if (!valido) {
      setErroGeral('Corrija os campos destacados antes de salvar.');
      return false;
    }

    if (localizacaoEvidenciaObrigatoria(imagens.length, localizacaoEvidencia)) {
      setErroGeral(
        'Localização é obrigatória quando há evidências anexadas. Clique em "Capturar localização" antes de salvar.',
      );
      return false;
    }

    return true;
  }

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErroGeral(erroImagens ?? null);
    if (!validarAntesDeEnviar()) return;

    setEnviando(true);
    try {
      const plano = await criarPlano({
        cidadeId: cidade.id,
        tecnologiaId,
        ...campos,
        criadoPorId: usuario.id,
        imagens: imagens.map(({ blob, metadados }) => ({ blob, metadados })),
        localizacaoEvidencia,
      });
      navigate(`/planos/${plano.id}`);
    } catch (excecao) {
      setErroGeral(excecao.message);
      setEnviando(false);
    }
  }

  const bloqueadoPorLocalizacao = localizacaoEvidenciaObrigatoria(imagens.length, localizacaoEvidencia);

  return (
    <ModalFormulario
      titulo="Criar plano de ação"
      subtitulo={`${cidade.nome} · cidade em situação crítica`}
      aoFechar={aoFechar}
    >
      <form onSubmit={aoEnviar} className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-6" noValidate>
        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          Enviado por <span className="font-semibold text-slate-800">{usuario.nome}</span>{' '}
          · matrícula {usuario.matricula}
        </div>

        <Suspense fallback={<CarregandoCampos />}>
          <CampoMarkdown
            nome="o-que"
            rotulo="O quê? Qual é a ação que será realizada?"
            obrigatorio
            compacto
            valor={campos.oQue}
            aoAlterar={(valor) => atualizarCampo('oQue', valor)}
            limiteCaracteres={LIMITE_O_QUE}
            placeholder="Ex.: Reforçar abordagem comercial na base ativa"
            erro={errosCampos.oQue}
          />

          <CampoMarkdown
            nome="como"
            rotulo="Como? Como essa ação será executada?"
            obrigatorio
            valor={campos.como}
            aoAlterar={(valor) => atualizarCampo('como', valor)}
            limiteCaracteres={LIMITE_COMO}
            alturaMinima={220}
            placeholder="Descreva os passos, recursos e etapas da execução"
            erro={errosCampos.como}
          />

          <CampoMarkdown
            nome="quem"
            rotulo="Quem? Quem será o responsável pela execução?"
            obrigatorio
            compacto
            valor={campos.quem}
            aoAlterar={(valor) => atualizarCampo('quem', valor)}
            limiteCaracteres={LIMITE_QUEM}
            placeholder="Ex.: Gerente comercial da cidade"
            erro={errosCampos.quem}
          />
        </Suspense>

        <div>
          <label htmlFor="quando" className="block text-sm font-medium text-slate-700">
            Quando? Qual é o prazo previsto para execução?
            <span className="text-red-600"> *</span>
          </label>
          {/* Data, não texto livre: é o formato certo pra prazo — permite ordenar,
              comparar e cobrar vencimento sem depender de como a pessoa escreveu. */}
          <input
            id="quando"
            type="date"
            required
            value={campos.quandoPrevisto}
            onChange={(e) => atualizarCampo('quandoPrevisto', e.target.value)}
            aria-invalid={Boolean(errosCampos.quandoPrevisto)}
            className={`mt-1 w-full rounded-lg border px-3 py-3 text-base focus:outline-none focus:ring-1 ${
              errosCampos.quandoPrevisto
                ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                : 'border-slate-300 focus:border-brand-700 focus:ring-brand-700'
            }`}
          />
          {errosCampos.quandoPrevisto && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {errosCampos.quandoPrevisto}
            </p>
          )}
        </div>

        <div>
          <BlocoAnexoEvidencias
            imagens={imagens}
            processandoImagem={processandoImagem}
            aoSelecionarImagens={aoSelecionarImagens}
            removerImagem={removerImagem}
            aoAbrirImagem={setIndiceLightbox}
            localizacaoEvidencia={localizacaoEvidencia}
            statusLocalizacao={statusLocalizacao}
            erroLocalizacao={erroLocalizacao}
            aoClicarCapturarLocalizacao={aoClicarCapturarLocalizacao}
            rotulo="Evidências (imagens) — opcional, pode anexar depois"
          />
          <p className="mt-2 text-xs text-slate-500">
            Não tem as fotos agora? Sem problema — salve o plano assim mesmo e anexe as evidências
            depois, na tela do plano.
          </p>
        </div>

        {erroGeral && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {erroGeral}
          </p>
        )}

        <div className="mt-auto flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={aoFechar}
            className="flex min-h-[48px] items-center justify-center rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando || processandoImagem || bloqueadoPorLocalizacao}
            title={bloqueadoPorLocalizacao ? 'Capture a localização antes de salvar.' : undefined}
            className="flex min-h-[48px] items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            {enviando ? 'Salvando…' : 'Salvar plano de ação'}
          </button>
        </div>
      </form>

      {indiceLightbox !== null && (
        <LightboxImagem
          itens={imagens.map((img) => ({ url: img.previewUrl, metadados: img.metadados, localizacaoEvidencia }))}
          indiceInicial={indiceLightbox}
          criadoPor={usuario}
          aoFechar={() => setIndiceLightbox(null)}
        />
      )}
    </ModalFormulario>
  );
}

function CarregandoCampos() {
  return (
    <div className="flex h-[120px] items-center justify-center rounded-lg border border-slate-300 text-sm text-slate-400">
      Carregando editor…
    </div>
  );
}