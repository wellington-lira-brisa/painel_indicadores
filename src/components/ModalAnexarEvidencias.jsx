import { useState } from 'react';
import { anexarEvidenciasPlano, localizacaoEvidenciaObrigatoria } from '../services/planoAcaoService';
import { useAuth } from '../context/AuthContext';
import { useCapturaEvidencias } from '../hooks/useCapturaEvidencias';
import ModalFormulario from './ModalFormulario';
import BlocoAnexoEvidencias from './BlocoAnexoEvidencias';
import LightboxImagem from './LightboxImagem';

/**
 * Segunda metade do fluxo desacoplado: plano já existe (sem evidência, ou
 * com evidência e o colaborador quer adicionar mais), aqui é só a etapa de
 * anexar. Mesmo hook (useCapturaEvidencias) e mesmo bloco visual
 * (BlocoAnexoEvidencias) de FormularioPlanoAcao — a única diferença real é
 * o que acontece no submit: `anexarEvidenciasPlano(plano.id, ...)` em vez
 * de `criarPlano(...)`.
 *
 * Diferente da criação, aqui pelo menos uma imagem é obrigatória — não faz
 * sentido abrir "Anexar evidências" e salvar sem anexar nada.
 */
export default function ModalAnexarEvidencias({ plano, aoFechar, aoAnexado }) {
  const { usuario } = useAuth();
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

  const bloqueadoPorLocalizacao = localizacaoEvidenciaObrigatoria(imagens.length, localizacaoEvidencia);
  const podeEnviar = imagens.length > 0 && !bloqueadoPorLocalizacao;

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErroGeral(erroImagens ?? null);

    if (imagens.length === 0) {
      setErroGeral('Selecione ao menos uma imagem para anexar.');
      return;
    }
    if (bloqueadoPorLocalizacao) {
      setErroGeral(
        'Localização é obrigatória quando há evidências anexadas. Clique em "Capturar localização" antes de salvar.',
      );
      return;
    }

    setEnviando(true);
    try {
      const planoAtualizado = await anexarEvidenciasPlano(plano.id, {
        criadoPorId: usuario.id,
        imagens: imagens.map(({ blob, metadados }) => ({ blob, metadados })),
        localizacaoEvidencia,
      });
      aoAnexado(planoAtualizado);
    } catch (excecao) {
      setErroGeral(excecao.message);
      setEnviando(false);
    }
  }

  return (
    <ModalFormulario titulo="Anexar evidências" subtitulo="Plano de ação" aoFechar={aoFechar}>
      <form onSubmit={aoEnviar} className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-6" noValidate>
        <p className="text-sm text-slate-600">
          Selecione as fotos da execução e capture a localização atual. Essas evidências ficam
          vinculadas a este plano de ação.
        </p>

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
        />

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
            disabled={enviando || processandoImagem || !podeEnviar}
            title={
              imagens.length === 0
                ? 'Selecione ao menos uma imagem.'
                : bloqueadoPorLocalizacao
                  ? 'Capture a localização antes de salvar.'
                  : undefined
            }
            className="flex min-h-[48px] items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            {enviando ? 'Enviando…' : 'Salvar evidências'}
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