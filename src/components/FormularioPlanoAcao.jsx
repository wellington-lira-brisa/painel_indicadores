import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImagePlus, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  LIMITE_COMO,
  LIMITE_O_QUE,
  LIMITE_QUEM,
  criarPlano,
  localizacaoEvidenciaObrigatoria,
  validarCamposPlanoDetalhado,
} from '../services/planoAcaoService';
import { extrairMetadadosExif } from '../utils/exif';
import { TIPOS_ACEITOS, prepararImagemParaUpload } from '../utils/imagemUpload';
import { buscarEnderecoPorCoordenadas, capturarLocalizacaoAtual } from '../utils/geolocalizacao';
import ModalFormulario from './ModalFormulario';
import GaleriaEvidencias from './GaleriaEvidencias';
import LightboxImagem from './LightboxImagem';
import CapturaLocalizacaoEvidencia from './CapturaLocalizacaoEvidencia';

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
 * Evidências: suporta múltiplas imagens (galeria + lightbox). A
 * localização é capturada UMA vez para o lote inteiro (não por imagem) e é
 * obrigatória sempre que houver ao menos uma imagem — regra validada aqui
 * (UX imediata) e de novo no backend, dentro da transação que cria o plano
 * (ver criar_plano_com_evidencias, migration 20260709130000).
 */
export default function FormularioPlanoAcao({ cidade, tecnologiaId, aoFechar }) {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [campos, setCampos] = useState(CAMPOS_VAZIOS);
  const [errosCampos, setErrosCampos] = useState({});
  const [imagens, setImagens] = useState([]); // [{ id, blob, previewUrl, metadados }]
  const [indiceLightbox, setIndiceLightbox] = useState(null);
  const [erroGeral, setErroGeral] = useState(null);
  const [processandoImagem, setProcessandoImagem] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Localização é do LOTE de evidências, não de uma imagem específica —
  // por isso vive fora do array `imagens`.
  const [localizacaoEvidencia, setLocalizacaoEvidencia] = useState(null);
  const [statusLocalizacao, setStatusLocalizacao] = useState('ocioso'); // 'ocioso' | 'capturando' | 'sucesso' | 'erro'
  const [erroLocalizacao, setErroLocalizacao] = useState(null);

  // Revoga todos os object URLs de preview só no unmount do formulário —
  // remoção/troca individual de imagem já revoga a própria URL na hora
  // (ver removerImagem). Um efeito atrelado a `imagens` revogaria TODAS as
  // URLs a cada adição/remoção, quebrando as miniaturas que continuam na tela.
  const imagensRef = useRef(imagens);
  imagensRef.current = imagens;
  useEffect(() => {
    return () => {
      imagensRef.current.forEach((img) => {
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      });
    };
  }, []);

  function atualizarCampo(chave, valor) {
    setCampos((atual) => ({ ...atual, [chave]: valor }));
    setErrosCampos((atual) => (atual[chave] ? { ...atual, [chave]: null } : atual));
  }

  async function aoSelecionarImagens(evento) {
    const arquivos = Array.from(evento.target.files ?? []);
    evento.target.value = ''; // permite reselecionar os mesmos arquivos depois
    if (arquivos.length === 0) return;

    setErroGeral(null);
    setProcessandoImagem(true);

    const resultados = await Promise.all(
      arquivos.map(async (arquivo) => {
        try {
          const [preparo, metadadosExif] = await Promise.all([
            prepararImagemParaUpload(arquivo),
            extrairMetadadosExif(arquivo),
          ]);
          return {
            ok: true,
            imagem: {
              id: crypto.randomUUID(),
              blob: preparo.blob,
              previewUrl: URL.createObjectURL(preparo.blob),
              metadados: {
                ...metadadosExif,
                tamanhoOriginalBytes: preparo.tamanhoOriginalBytes,
                tamanhoFinalBytes: preparo.tamanhoFinalBytes,
                larguraFinal: preparo.largura,
                alturaFinal: preparo.altura,
                tipoMimeFinal: preparo.tipoMimeFinal,
              },
            },
          };
        } catch (excecao) {
          return { ok: false, erro: `${arquivo.name}: ${excecao.message}` };
        }
      }),
    );

    // Preserva a ordem de seleção mesmo com processamento em paralelo —
    // .map já mantém a ordem do array original, independente de qual
    // arquivo terminou de processar primeiro.
    const novasImagens = resultados.filter((r) => r.ok).map((r) => r.imagem);
    const erros = resultados.filter((r) => !r.ok).map((r) => r.erro);

    if (novasImagens.length > 0) setImagens((atual) => [...atual, ...novasImagens]);
    if (erros.length > 0) setErroGeral(erros.join(' · '));
    setProcessandoImagem(false);
  }

  function removerImagem(id) {
    const alvo = imagens.find((img) => img.id === id);
    if (alvo?.previewUrl) URL.revokeObjectURL(alvo.previewUrl);

    const restante = imagens.filter((img) => img.id !== id);
    setImagens(restante);

    // Sem evidência, não há mais o que a localização documentar — some
    // junto, em vez de deixar uma localização "órfã" que o usuário
    // esqueceu de recapturar caso reanexe uma imagem depois.
    if (restante.length === 0) {
      setLocalizacaoEvidencia(null);
      setStatusLocalizacao('ocioso');
      setErroLocalizacao(null);
    }
  }

  /**
   * Só executa quando o usuário clica no botão (nunca automático). O
   * próprio navegador exige permissão explícita antes de entregar
   * qualquer coordenada. Geocodificação (endereço) é aprimoramento
   * opcional: se falhar ou demorar, a coordenada capturada continua
   * válida mesmo assim.
   */
  async function aoClicarCapturarLocalizacao() {
    setStatusLocalizacao('capturando');
    setErroLocalizacao(null);

    try {
      const posicao = await capturarLocalizacaoAtual();
      setLocalizacaoEvidencia(posicao);
      setStatusLocalizacao('sucesso');

      const endereco = await buscarEnderecoPorCoordenadas(posicao.latitude, posicao.longitude);
      if (endereco) {
        setLocalizacaoEvidencia((atual) => (atual ? { ...atual, endereco } : atual));
      }
    } catch (excecao) {
      setErroLocalizacao(excecao.message);
      setStatusLocalizacao('erro');
    }
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
    setErroGeral(null);
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
          <span className="block text-sm font-medium text-slate-700">Evidências (imagens)</span>

          <label className="mt-2 flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 hover:border-brand-700 hover:text-brand-700">
            {processandoImagem ? (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                Otimizando imagens…
              </>
            ) : (
              <>
                <ImagePlus className="size-5" aria-hidden="true" />
                Anexar imagens (JPEG, PNG, WebP ou HEIC) — comprimidas automaticamente
              </>
            )}
            <input
              type="file"
              accept={TIPOS_ACEITOS.join(',')}
              multiple
              className="sr-only"
              onChange={aoSelecionarImagens}
              disabled={processandoImagem}
            />
          </label>

          {imagens.length > 0 && (
            <div className="mt-3 space-y-3">
              <GaleriaEvidencias
                itens={imagens.map((img) => ({ id: img.id, url: img.previewUrl }))}
                aoRemover={removerImagem}
                aoAbrirImagem={setIndiceLightbox}
              />

              <CapturaLocalizacaoEvidencia
                localizacao={localizacaoEvidencia}
                status={statusLocalizacao}
                erro={erroLocalizacao}
                aoCapturar={aoClicarCapturarLocalizacao}
                obrigatoria
              />
            </div>
          )}
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
          itens={imagens.map((img) => ({ url: img.previewUrl, metadados: img.metadados }))}
          indiceInicial={indiceLightbox}
          localizacaoEvidencia={localizacaoEvidencia}
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