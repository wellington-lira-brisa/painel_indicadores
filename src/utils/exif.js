import exifr from 'exifr';

/**
 * Extrai metadados EXIF do arquivo ORIGINAL, antes da compressão — o
 * canvas usado em utils/imagemUpload.js remove todo EXIF ao redesenhar,
 * então esta extração só funciona sobre o arquivo bruto selecionado.
 * `possuiExif = false` sinaliza imagem sem metadados de origem (foto
 * possivelmente editada, capturada de tela ou gerada artificialmente).
 */
export async function extrairMetadadosExif(arquivo) {
  const base = {
    nomeOriginal: arquivo.name,
    possuiExif: false,
    dataCaptura: null,
    dispositivo: null,
    software: null,
    localizacao: null,
    exifBruto: null,
  };

  try {
    const exif = await exifr.parse(arquivo, { gps: true });
    if (!exif || Object.keys(exif).length === 0) return base;

    const marca = exif.Make?.trim();
    const modelo = exif.Model?.trim();
    const dataCaptura = exif.DateTimeOriginal ?? exif.CreateDate ?? null;

    return {
      ...base,
      possuiExif: true,
      dataCaptura: dataCaptura ? new Date(dataCaptura).toISOString() : null,
      dispositivo: [marca, modelo].filter(Boolean).join(' ') || null,
      software: exif.Software ?? null,
      localizacao:
        exif.latitude !== undefined && exif.longitude !== undefined
          ? { latitude: exif.latitude, longitude: exif.longitude }
          : null,
      exifBruto: selecionarCamposExif(exif),
    };
  } catch {
    // Arquivo sem EXIF legível: mantém apenas os dados base.
    return base;
  }
}

const CAMPOS_EXIF_RELEVANTES = [
  'Make', 'Model', 'Software', 'DateTimeOriginal', 'CreateDate', 'ModifyDate',
  'ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'Flash',
  'ExifImageWidth', 'ExifImageHeight', 'Orientation',
];

function selecionarCamposExif(exif) {
  const selecionados = {};
  CAMPOS_EXIF_RELEVANTES.forEach((campo) => {
    if (exif[campo] !== undefined) {
      const valor = exif[campo];
      selecionados[campo] = valor instanceof Date ? valor.toISOString() : String(valor);
    }
  });
  return Object.keys(selecionados).length > 0 ? selecionados : null;
}
