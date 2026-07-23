import { useEffect, useRef, useState } from "react";
import { extrairMetadadosExif } from "../utils/exif";
import { prepararImagemParaUpload } from "../utils/imagemUpload";
import {
  buscarEnderecoPorCoordenadas,
  capturarLocalizacaoAtual,
} from "../utils/geolocalizacao";

/**
 * Estado + lógica de "selecionar imagens e capturar localização" —
 * extraído de FormularioPlanoAcao pra ser reaproveitado por qualquer tela
 * que precise do mesmo fluxo (criação do plano E, agora, anexar evidências
 * depois via ModalAnexarEvidencias). Só estado e efeitos colaterais; JSX
 * fica em BlocoAnexoEvidencias — quem usa o hook decide como desenhar,
 * mas nunca duplica a lógica de processar arquivo, revogar preview ou
 * capturar geolocalização.
 */
export function useCapturaEvidencias() {
  const [imagens, setImagens] = useState([]); // [{ id, blob, previewUrl, metadados }]
  const [processandoImagem, setProcessandoImagem] = useState(false);
  const [erroImagens, setErroImagens] = useState(null);

  // Localização é do LOTE de evidências, não de uma imagem específica —
  // por isso vive fora do array `imagens`.
  const [localizacaoEvidencia, setLocalizacaoEvidencia] = useState(null);
  const [statusLocalizacao, setStatusLocalizacao] = useState("ocioso"); // 'ocioso' | 'capturando' | 'sucesso' | 'erro'
  const [erroLocalizacao, setErroLocalizacao] = useState(null);

  // Revoga todos os object URLs de preview só no unmount — remoção/troca
  // individual de imagem já revoga a própria URL na hora (ver
  // removerImagem). Um efeito atrelado a `imagens` revogaria TODAS as URLs
  // a cada adição/remoção, quebrando as miniaturas que continuam na tela.
  const imagensRef = useRef(imagens);
  imagensRef.current = imagens;
  useEffect(() => {
    return () => {
      imagensRef.current.forEach((img) => {
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      });
    };
  }, []);

  async function aoSelecionarImagens(evento) {
    const arquivos = Array.from(evento.target.files ?? []);
    evento.target.value = ""; // permite reselecionar os mesmos arquivos depois
    if (arquivos.length === 0) return;

    setErroImagens(null);
    setProcessandoImagem(true);

    const resultados = [];

    try {
      // Processar uma foto por vez limita o pico de memória. Uma foto de
      // celular com 12 MP ocupa perto de 48 MB quando decodificada em RGBA;
      // Promise.all multiplicava esse custo pela quantidade selecionada.
      for (const arquivo of arquivos) {
        try {
          const preparo = await prepararImagemParaUpload(arquivo);
          // Só lê EXIF depois de liberar bitmap/canvas. Além de reduzir o
          // pico de memória, evita trabalho em arquivo que nem foi decodificado.
          const metadadosExif = await extrairMetadadosExif(arquivo);
          resultados.push({
            ok: true,
            imagem: {
              id: crypto.randomUUID(),
              blob: preparo.blob,
              previewUrl: URL.createObjectURL(preparo.blob),
              metadados: {
                ...metadadosExif,
                tamanhoOriginalBytes: preparo.tamanhoOriginalBytes,
                tamanhoFinalBytes: preparo.tamanhoFinalBytes,
                larguraOriginal: preparo.larguraOriginal,
                alturaOriginal: preparo.alturaOriginal,
                larguraFinal: preparo.largura,
                alturaFinal: preparo.altura,
                tipoMimeOriginal: preparo.tipoMimeOriginal,
                tipoMimeFinal: preparo.tipoMimeFinal,
                qualidadeFinal: preparo.qualidadeFinal,
                reducaoPercentual: preparo.reducaoPercentual,
                tempoProcessamentoMs: preparo.tempoProcessamentoMs,
              },
            },
          });
        } catch (excecao) {
          resultados.push({
            ok: false,
            erro: `${arquivo.name}: ${excecao.message}`,
          });
        }
      }
    } finally {
      setProcessandoImagem(false);
    }

    // O loop preserva a ordem de seleção inclusive quando algum arquivo falha.
    const novasImagens = resultados.filter((r) => r.ok).map((r) => r.imagem);
    const erros = resultados.filter((r) => !r.ok).map((r) => r.erro);

    if (novasImagens.length > 0)
      setImagens((atual) => [...atual, ...novasImagens]);
    if (erros.length > 0) setErroImagens(erros.join(" · "));
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
      setStatusLocalizacao("ocioso");
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
    setStatusLocalizacao("capturando");
    setErroLocalizacao(null);

    try {
      const posicao = await capturarLocalizacaoAtual();
      setLocalizacaoEvidencia(posicao);
      setStatusLocalizacao("sucesso");

      const endereco = await buscarEnderecoPorCoordenadas(
        posicao.latitude,
        posicao.longitude,
      );
      if (endereco) {
        setLocalizacaoEvidencia((atual) =>
          atual
            ? {
                ...atual,
                endereco: endereco.enderecoCompleto,
                numero: endereco.numero,
                rua: endereco.rua,
                bairro: endereco.bairro,
                cidade: endereco.cidade,
                estado: endereco.estado,
                cep: endereco.cep,
                pais: endereco.pais,
              }
            : atual,
        );
      }
    } catch (excecao) {
      setErroLocalizacao(excecao.message);
      setStatusLocalizacao("erro");
    }
  }

  function resetar() {
    imagens.forEach((img) => {
      if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
    });
    setImagens([]);
    setErroImagens(null);
    setProcessandoImagem(false);
    setLocalizacaoEvidencia(null);
    setStatusLocalizacao("ocioso");
    setErroLocalizacao(null);
  }

  return {
    imagens,
    processandoImagem,
    erroImagens,
    aoSelecionarImagens,
    removerImagem,
    localizacaoEvidencia,
    statusLocalizacao,
    erroLocalizacao,
    aoClicarCapturarLocalizacao,
    resetar,
  };
}