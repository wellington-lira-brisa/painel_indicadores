/** Erro com mensagem já pronta para exibir ao usuário — mesmo padrão de ErroImagem em imagemUpload.js. */
export class ErroLocalizacao extends Error {}

const TEMPO_LIMITE_CAPTURA_MS = 10000;

const MENSAGEM_POR_CODIGO_ERRO = {
  1: 'Permissão de localização negada. Habilite o acesso à localização nas configurações do navegador para usar este recurso.',
  2: 'Não foi possível obter a localização — sinal de GPS indisponível ou dispositivo sem suporte.',
  3: 'Tempo limite excedido ao tentar obter a localização. Tente novamente em um local com melhor sinal.',
};

/**
 * Captura a posição atual do dispositivo via API de Geolocalização do
 * navegador. Só roda quando chamada explicitamente (nunca automático, nunca
 * em background) — o próprio navegador também exige permissão explícita do
 * usuário antes de entregar qualquer coordenada, então a captura sempre
 * passa por um consentimento visível, mesmo sem nenhuma lógica extra aqui.
 */
export function capturarLocalizacaoAtual() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new ErroLocalizacao('Este navegador ou dispositivo não tem suporte a captura de localização.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        resolve({
          latitude: posicao.coords.latitude,
          longitude: posicao.coords.longitude,
          precisaoMetros: posicao.coords.accuracy ?? null,
          capturadaEm: new Date().toISOString(),
          endereco: null, // preenchido depois, de forma assíncrona, por buscarEnderecoPorCoordenadas
        });
      },
      (erro) => {
        reject(
          new ErroLocalizacao(
            MENSAGEM_POR_CODIGO_ERRO[erro.code] ?? 'Não foi possível obter a localização. Tente novamente.',
          ),
        );
      },
      { enableHighAccuracy: true, timeout: TEMPO_LIMITE_CAPTURA_MS, maximumAge: 0 },
    );
  });
}

const TEMPO_LIMITE_GEOCODING_MS = 8000;

/**
 * Extrai os campos estruturados que o negócio pediu (rua+número num
 * endereço completo, bairro, cidade, estado, CEP, país) do objeto
 * `address` do Nominatim. Nominatim não tem um vocabulário fixo — o mesmo
 * conceito vem com nomes diferentes dependendo do país/tipo de lugar (ex.:
 * cidade pode vir em `city`, `town`, `village` ou `municipality` conforme o
 * tamanho da localidade) — por isso cada campo tenta múltiplas chaves, da
 * mais específica pra mais genérica.
 */
function extrairEnderecoEstruturado(dados) {
  const endereco = dados?.address ?? {};
  const numero = endereco.house_number ?? null;
  const rua = endereco.road ?? endereco.pedestrian ?? null;

  return {
    enderecoCompleto: dados?.display_name ?? null,
    numero,
    rua,
    bairro: endereco.suburb ?? endereco.neighbourhood ?? endereco.quarter ?? null,
    cidade: endereco.city ?? endereco.town ?? endereco.village ?? endereco.municipality ?? null,
    estado: endereco.state ?? null,
    cep: endereco.postcode ?? null,
    pais: endereco.country ?? null,
  };
}

/**
 * Endereço estruturado a partir de coordenadas (reverse geocoding via
 * Nominatim/OpenStreetMap — serviço público, sem chave de API). Best-effort
 * por natureza: qualquer falha (rede, limite de uso, indisponibilidade)
 * devolve `null` silenciosamente — a coordenada já capturada continua
 * válida e utilizável mesmo sem endereço textual, então isso nunca deve
 * bloquear ou dar erro pro usuário.
 *
 * `addressdetails=1` (antes era 0) é o que faz o Nominatim devolver o
 * endereço já quebrado em componentes (rua, bairro, cidade...) em vez de só
 * o texto único `display_name` — sem isso não dá pra guardar CEP, bairro
 * etc. separadamente, só o texto inteiro.
 *
 * Trocar de provedor no futuro (ex.: um serviço pago com SLA melhor) é
 * reescrever só esta função — nada mais no app depende de qual provedor
 * faz a conversão, nem do formato bruto que ele devolve.
 */
export async function buscarEnderecoPorCoordenadas(latitude, longitude) {
  const controlador = new AbortController();
  const timeoutId = setTimeout(() => controlador.abort(), TEMPO_LIMITE_GEOCODING_MS);

  try {
    const resposta = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      { signal: controlador.signal, headers: { Accept: 'application/json' } },
    );
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    if (!dados) return null;
    return extrairEnderecoEstruturado(dados);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Link direto pro Google Maps a partir de coordenadas — formato oficial de
 * "pesquisar por coordenada" do Maps, funciona sem chave de API e abre
 * direto no ponto exato, sem precisar de endereço textual. Gerado sob
 * demanda (nunca persistido): é 100% derivável de latitude/longitude, então
 * guardar isso no banco seria dado duplicado que pode ficar desatualizado
 * se o formato de URL do Google mudar no futuro.
 */
export function linkGoogleMaps(latitude, longitude) {
  if (latitude == null || longitude == null) return null;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}