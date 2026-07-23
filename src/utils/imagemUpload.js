export const TIPOS_ACEITOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

const LIMITE_ORIGINAL_BYTES = 15 * 1024 * 1024;
const LIMITE_FINAL_BYTES = 500 * 1024;
const DIMENSAO_MAXIMA_PX = 1600;
const DIMENSAO_MINIMA_PX = 1280;
const FATOR_REDUCAO_DIMENSAO = 0.9;
const QUALIDADE_MAXIMA = 0.82;
const QUALIDADE_MINIMA = 0.68;
const QUALIDADE_EMERGENCIA = 0.58;
const ITERACOES_BUSCA_QUALIDADE = 4;

/** Erro com mensagem já pronta para exibir ao usuário. */
export class ErroImagem extends Error {}

function validarArquivo(arquivo) {
  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    throw new ErroImagem(
      "Formato não suportado. Envie JPEG, PNG, WebP ou HEIC.",
    );
  }
  if (arquivo.size > LIMITE_ORIGINAL_BYTES) {
    throw new ErroImagem(
      "Imagem muito grande (máx. 15 MB). Escolha um arquivo menor.",
    );
  }
}

async function decodificarImagem(arquivo) {
  try {
    return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    // Ocorre principalmente com HEIC em navegadores desktop sem codec —
    // Safari/iOS costuma decodificar, Chrome/Firefox podem não decodificar.
    throw new ErroImagem(
      "Não foi possível processar este formato neste navegador. Envie em JPEG, PNG ou WebP.",
    );
  }
}

function calcularDimensoes(largura, altura, limite = DIMENSAO_MAXIMA_PX) {
  const maiorLado = Math.max(largura, altura);
  if (maiorLado <= limite) return { largura, altura };

  const escala = limite / maiorLado;
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  };
}

function criarCanvas(largura, altura) {
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  return canvas;
}

function contexto2d(canvas) {
  const contexto = canvas.getContext("2d", { alpha: true });
  if (!contexto)
    throw new ErroImagem("Não foi possível processar esta imagem.");
  contexto.imageSmoothingEnabled = true;
  contexto.imageSmoothingQuality = "high";
  return contexto;
}

function desenharNoCanvas(origem, largura, altura, fundo = null) {
  const canvas = criarCanvas(largura, altura);
  const contexto = contexto2d(canvas);

  if (fundo) {
    contexto.fillStyle = fundo;
    contexto.fillRect(0, 0, largura, altura);
  }

  contexto.drawImage(origem, 0, 0, largura, altura);
  return canvas;
}

function liberarCanvas(canvas) {
  // Zerar as dimensões libera o buffer de pixels sem esperar pelo GC —
  // importante em celulares ao selecionar várias fotos grandes.
  canvas.width = 1;
  canvas.height = 1;
}

function canvasParaBlob(canvas, tipoMime, qualidade) {
  return new Promise((resolve) => canvas.toBlob(resolve, tipoMime, qualidade));
}

async function codificar(canvas, tipoMime, qualidade) {
  const blob = await canvasParaBlob(canvas, tipoMime, qualidade);
  // Quando o encoder solicitado não existe, alguns navegadores retornam
  // PNG silenciosamente. Conferir o MIME evita armazenar o formato errado.
  return blob?.type === tipoMime ? blob : null;
}

/**
 * Encontra a maior qualidade que respeita 500 KB. A busca binária evita a
 * queda brusca da versão anterior (0,8 -> 0,6 -> 0,4), preservando o máximo
 * de detalhe que cada imagem específica permite.
 */
async function codificarNaMelhorQualidade(
  canvas,
  tipoMime,
  qualidadeMinima = QUALIDADE_MINIMA,
) {
  const blobMaximo = await codificar(canvas, tipoMime, QUALIDADE_MAXIMA);
  if (!blobMaximo) return { suportado: false, resultado: null };
  if (blobMaximo.size <= LIMITE_FINAL_BYTES) {
    return {
      suportado: true,
      resultado: { blob: blobMaximo, qualidade: QUALIDADE_MAXIMA },
    };
  }

  const blobMinimo = await codificar(canvas, tipoMime, qualidadeMinima);
  if (!blobMinimo || blobMinimo.size > LIMITE_FINAL_BYTES) {
    return { suportado: true, resultado: null };
  }

  let menorQualidade = qualidadeMinima;
  let maiorQualidade = QUALIDADE_MAXIMA;
  let melhor = { blob: blobMinimo, qualidade: qualidadeMinima };

  for (
    let tentativa = 0;
    tentativa < ITERACOES_BUSCA_QUALIDADE;
    tentativa += 1
  ) {
    const qualidade = (menorQualidade + maiorQualidade) / 2;
    const blob = await codificar(canvas, tipoMime, qualidade);
    if (!blob) break;

    if (blob.size <= LIMITE_FINAL_BYTES) {
      melhor = { blob, qualidade };
      menorQualidade = qualidade;
    } else {
      maiorQualidade = qualidade;
    }
  }

  return { suportado: true, resultado: melhor };
}

function proximaDimensao(largura, altura) {
  const maiorLado = Math.max(largura, altura);
  if (maiorLado <= DIMENSAO_MINIMA_PX) return null;

  const proximoMaiorLado = Math.max(
    DIMENSAO_MINIMA_PX,
    Math.round(maiorLado * FATOR_REDUCAO_DIMENSAO),
  );
  return calcularDimensoes(largura, altura, proximoMaiorLado);
}

/**
 * WebP é a saída principal. Se 1600 px ainda não couber com boa qualidade,
 * reduz a resolução gradualmente até 1280 px antes de usar a qualidade de
 * emergência. JPEG só é usado quando o navegador não consegue gerar WebP.
 */
async function comprimirAteCaber(canvasInicial, larguraInicial, alturaInicial) {
  let canvas = canvasInicial;
  let largura = larguraInicial;
  let altura = alturaInicial;

  try {
    while (true) {
      const webp = await codificarNaMelhorQualidade(canvas, "image/webp");
      if (webp.resultado) {
        return { ...webp.resultado, largura, altura, tipoMime: "image/webp" };
      }

      if (!webp.suportado) break;

      const proximasDimensoes = proximaDimensao(largura, altura);
      if (!proximasDimensoes) {
        const emergencia = await codificarNaMelhorQualidade(
          canvas,
          "image/webp",
          QUALIDADE_EMERGENCIA,
        );
        if (emergencia.resultado) {
          return {
            ...emergencia.resultado,
            largura,
            altura,
            tipoMime: "image/webp",
          };
        }
        break;
      }

      const canvasReduzido = desenharNoCanvas(
        canvas,
        proximasDimensoes.largura,
        proximasDimensoes.altura,
      );
      liberarCanvas(canvas);
      canvas = canvasReduzido;
      largura = proximasDimensoes.largura;
      altura = proximasDimensoes.altura;
    }

    // Fallback de compatibilidade: JPEG não preserva transparência, então
    // compõe sobre branco para evitar áreas transparentes ficarem pretas.
    const canvasJpeg = desenharNoCanvas(canvas, largura, altura, "#ffffff");
    try {
      const jpeg = await codificarNaMelhorQualidade(
        canvasJpeg,
        "image/jpeg",
        QUALIDADE_EMERGENCIA,
      );
      if (jpeg.resultado) {
        return { ...jpeg.resultado, largura, altura, tipoMime: "image/jpeg" };
      }
    } finally {
      liberarCanvas(canvasJpeg);
    }

    return null;
  } finally {
    liberarCanvas(canvas);
  }
}

/**
 * Valida, redimensiona, remove os metadados embutidos e comprime antes do
 * upload. Os campos EXIF usados na auditoria são extraídos separadamente do
 * arquivo original; o blob final contém apenas os pixels otimizados.
 */
export async function prepararImagemParaUpload(arquivo) {
  validarArquivo(arquivo);

  const inicio = performance.now();
  let bitmap = null;

  try {
    bitmap = await decodificarImagem(arquivo);
    const larguraOriginal = bitmap.width;
    const alturaOriginal = bitmap.height;
    const dimensoesIniciais = calcularDimensoes(
      larguraOriginal,
      alturaOriginal,
    );
    const canvas = desenharNoCanvas(
      bitmap,
      dimensoesIniciais.largura,
      dimensoesIniciais.altura,
    );

    bitmap.close?.();
    bitmap = null;

    const resultado = await comprimirAteCaber(
      canvas,
      dimensoesIniciais.largura,
      dimensoesIniciais.altura,
    );
    if (!resultado) {
      throw new ErroImagem(
        "Imagem muito pesada mesmo após compressão. Tente outra foto.",
      );
    }

    const reducaoPercentual =
      arquivo.size > 0
        ? Math.round((1 - resultado.blob.size / arquivo.size) * 1000) / 10
        : null;

    return {
      blob: resultado.blob,
      largura: resultado.largura,
      altura: resultado.altura,
      larguraOriginal,
      alturaOriginal,
      tamanhoOriginalBytes: arquivo.size,
      tamanhoFinalBytes: resultado.blob.size,
      tipoMimeOriginal: arquivo.type,
      tipoMimeFinal: resultado.tipoMime,
      qualidadeFinal: Math.round(resultado.qualidade * 100) / 100,
      reducaoPercentual,
      tempoProcessamentoMs: Math.round(performance.now() - inicio),
    };
  } finally {
    bitmap?.close?.();
  }
}