import { ImagePlus, Loader2 } from 'lucide-react';
import { TIPOS_ACEITOS } from '../utils/imagemUpload';
import GaleriaEvidencias from './GaleriaEvidencias';
import CapturaLocalizacaoEvidencia from './CapturaLocalizacaoEvidencia';

/**
 * JSX do fluxo de anexo de evidências: dropzone de imagens, galeria de
 * miniaturas e captura de localização. Recebe tudo pronto de
 * `useCapturaEvidencias` (props) — não tem estado próprio, então o mesmo
 * bloco visual funciona tanto na criação do plano (FormularioPlanoAcao)
 * quanto no anexo posterior (ModalAnexarEvidencias), sem duplicar layout
 * nem regra.
 */
export default function BlocoAnexoEvidencias({
  imagens,
  processandoImagem,
  aoSelecionarImagens,
  removerImagem,
  aoAbrirImagem,
  localizacaoEvidencia,
  statusLocalizacao,
  erroLocalizacao,
  aoClicarCapturarLocalizacao,
  rotulo = 'Evidências (imagens)',
}) {
  return (
    <div>
      <span className="block text-sm font-medium text-slate-700">{rotulo}</span>

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
            aoAbrirImagem={aoAbrirImagem}
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
  );
}