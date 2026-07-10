export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const LIMITE_ORIGINAL_BYTES = 15 * 1024 * 1024; // rejeita sem tentar comprimir
const LIMITE_FINAL_BYTES = 500 * 1024; // bloqueia envio se não atingir após comprimir
const DIMENSAO_MAXIMA_PX = 1600; // lado maior
const QUALIDADES = [0.8, 0.6, 0.4]; // tenta na ordem, para na primeira que couber no limite

/** Erro com mensagem já pronta para exibir ao usuário. */
export class ErroImagem extends Error {}

function validarArquivo(arquivo) {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    throw new ErroImagem('Formato não suportado. Envie JPEG, PNG, WebP ou HEIC.');
  }
  if (arquivo.size > LIMITE_ORIGINAL_BYTES) {
    throw new ErroImagem('Imagem muito grande (máx. 15 MB). Escolha um arquivo menor.');
  }
}

async function decodificarImagem(arquivo) {
  try {
    return await createImageBitmap(arquivo);
  } catch {
    // Ocorre principalmente com HEIC em navegadores desktop sem codec —
    // Chrome/Firefox não decodificam HEIC nativamente; Safari/iOS geralmente sim.
    throw new ErroImagem(
      'Não foi possível processar este formato neste navegador. Envie em JPEG, PNG ou WebP.',
    );
  }
}

function calcularDimensoes(largura, altura) {
  const maiorLado = Math.max(largura, altura);
  if (maiorLado <= DIMENSAO_MAXIMA_PX) return { largura, altura };

  const escala = DIMENSAO_MAXIMA_PX / maiorLado;
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

function desenharNoCanvas(bitmap, largura, altura) {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, largura, altura);
  return canvas;
}

function canvasParaBlob(canvas, tipoMime, qualidade) {
  return new Promise((resolve) => canvas.toBlob(resolve, tipoMime, qualidade));
}

/**
 * Tenta WebP antes de JPEG (formato mais leve). Alguns navegadores sem
 * suporte a WebP no canvas devolvem silenciosamente um blob de outro tipo
 * em vez de null — por isso confere `blob.type` e não só a existência do blob.
 */
async function comprimirAteCaber(canvas) {
  for (const tipoMime of ['image/webp', 'image/jpeg']) {
    for (const qualidade of QUALIDADES) {
      const blob = await canvasParaBlob(canvas, tipoMime, qualidade);
      if (blob && blob.type === tipoMime && blob.size <= LIMITE_FINAL_BYTES) {
        return blob;
      }
    }
  }
  return null;
}

/**
 * Valida, redimensiona e comprime uma imagem antes do upload.
 * Lança ErroImagem com mensagem pronta para exibir ao usuário; qualquer
 * outro erro é falha inesperada e deve ser tratada como tal pelo chamador.
 */
export async function prepararImagemParaUpload(arquivo) {
  validarArquivo(arquivo);

  const bitmap = await decodificarImagem(arquivo);
  const { largura, altura } = calcularDimensoes(bitmap.width, bitmap.height);
  const canvas = desenharNoCanvas(bitmap, largura, altura);
  bitmap.close?.();

  const blob = await comprimirAteCaber(canvas);
  if (!blob) {
    throw new ErroImagem('Imagem muito pesada mesmo após compressão. Tente outra foto.');
  }

  return {
    blob,
    largura,
    altura,
    tamanhoOriginalBytes: arquivo.size,
    tamanhoFinalBytes: blob.size,
    tipoMimeFinal: blob.type,
  };
}
