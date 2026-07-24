const SEM_INDICADOR = '__sem_indicador__';

function idVendedor(vendedor) {
  return vendedor.vendedorId || vendedor.vendedor;
}

function chaveVendedorIndicador(vendedor) {
  return `${idVendedor(vendedor)}\u0001${vendedor.indicador ?? SEM_INDICADOR}`;
}

function valorQuintil(quintil, fallback = 0) {
  const numero = Number(quintil);
  return numero >= 1 && numero <= 5 ? numero : fallback;
}

function compararIndicadoresCriticos(a, b) {
  return (
    valorQuintil(b.quintil) - valorQuintil(a.quintil) ||
    (a.atingimento ?? Number.POSITIVE_INFINITY) - (b.atingimento ?? Number.POSITIVE_INFINITY) ||
    String(a.indicador ?? '').localeCompare(String(b.indicador ?? ''), 'pt-BR')
  );
}

function resumirGrupo(grupo) {
  const distribuicao = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, semMeta: 0 };
  const canais = new Set();
  let somaAtingimento = 0;
  let indicadoresComAtingimento = 0;
  let melhorando = 0;
  let emQueda = 0;

  for (const indicador of grupo.indicadores) {
    const quintil = valorQuintil(indicador.quintil);
    if (quintil) distribuicao[quintil] += 1;
    else distribuicao.semMeta += 1;

    for (const canal of indicador.canais ?? []) canais.add(canal);

    if (Number.isFinite(indicador.atingimento)) {
      somaAtingimento += indicador.atingimento;
      indicadoresComAtingimento += 1;
    }

    if (indicador.tendencia?.tipo === 'melhorou') melhorando += 1;
    if (indicador.tendencia?.tipo === 'caiu') emQueda += 1;
  }

  const quintisValidos = grupo.indicadores
    .map((indicador) => valorQuintil(indicador.quintil))
    .filter(Boolean);
  const indicadores = [...grupo.indicadores].sort(compararIndicadoresCriticos);

  return {
    ...grupo,
    canais: [...canais].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    indicadores,
    quantidadeIndicadores: indicadores.length,
    distribuicao,
    melhorQuintil: quintisValidos.length > 0 ? Math.min(...quintisValidos) : null,
    piorQuintil: quintisValidos.length > 0 ? Math.max(...quintisValidos) : null,
    atingimentoMedio:
      indicadoresComAtingimento > 0 ? somaAtingimento / indicadoresComAtingimento : null,
    melhorando,
    emQueda,
    indicadorCritico: indicadores.find((indicador) => indicador.quintil) ?? indicadores[0] ?? null,
  };
}

/**
 * Converte a lista plana vendedor×indicador em uma lista com exatamente
 * uma entrada por vendedor. O cálculo do quintil permanece intocado e
 * individual em cada item de `indicadores`.
 */
export function agruparVendedoresPorIndicador(vendedores = [], historico = null) {
  const tendencias = new Map(
    (historico?.vendedores ?? []).map((vendedor) => [
      chaveVendedorIndicador(vendedor),
      vendedor.tendencia,
    ]),
  );
  const porVendedor = new Map();

  for (const vendedor of vendedores) {
    const chave = idVendedor(vendedor);
    if (!porVendedor.has(chave)) {
      porVendedor.set(chave, {
        vendedorId: vendedor.vendedorId,
        vendedor: vendedor.vendedor,
        indicadores: [],
      });
    }

    porVendedor.get(chave).indicadores.push({
      ...vendedor,
      tendencia: tendencias.get(chaveVendedorIndicador(vendedor)) ?? {
        tipo: 'sem-comparacao',
        faixas: 0,
      },
    });
  }

  return [...porVendedor.values()].map(resumirGrupo);
}

export function listarIndicadoresDisponiveis(grupos = []) {
  const indicadores = new Set();
  for (const grupo of grupos) {
    for (const item of grupo.indicadores) {
      if (item.indicador) indicadores.add(item.indicador);
    }
  }
  return [...indicadores].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function filtrarGruposQuintil(
  grupos = [],
  { indicador = '', quintil = '' } = {},
) {
  return grupos
    .map((grupo) => {
      const indicadores = grupo.indicadores.filter((item) => {
        const correspondeIndicador = !indicador || item.indicador === indicador;
        const correspondeQuintil =
          !quintil ||
          (quintil === 'sem-meta'
            ? !valorQuintil(item.quintil)
            : valorQuintil(item.quintil) === Number(quintil));
        return correspondeIndicador && correspondeQuintil;
      });

      return indicadores.length > 0 ? resumirGrupo({ ...grupo, indicadores }) : null;
    })
    .filter(Boolean);
}

export function ordenarGruposQuintil(grupos = [], criterio = 'atencao') {
  const ordenados = [...grupos];
  const porNome = (a, b) => a.vendedor.localeCompare(b.vendedor, 'pt-BR');
  const comDesempatePorNome = (resultado, a, b) => resultado || porNome(a, b);

  ordenados.sort((a, b) => {
    switch (criterio) {
      case 'nome':
        return porNome(a, b);
      case 'q1':
        return comDesempatePorNome(b.distribuicao[1] - a.distribuicao[1], a, b);
      case 'melhor':
        return comDesempatePorNome(
          (a.melhorQuintil ?? 99) - (b.melhorQuintil ?? 99),
          a,
          b,
        );
      case 'pior':
        return comDesempatePorNome(
          (b.piorQuintil ?? 0) - (a.piorQuintil ?? 0),
          a,
          b,
        );
      case 'quedas':
        return comDesempatePorNome(b.emQueda - a.emQueda, a, b);
      case 'atingimento-maior':
        return comDesempatePorNome(
          (b.atingimentoMedio ?? -1) - (a.atingimentoMedio ?? -1),
          a,
          b,
        );
      case 'atingimento-menor':
        return comDesempatePorNome(
          (a.atingimentoMedio ?? Number.POSITIVE_INFINITY) -
            (b.atingimentoMedio ?? Number.POSITIVE_INFINITY),
          a,
          b,
        );
      default:
        return (
          (b.piorQuintil ?? 0) - (a.piorQuintil ?? 0) ||
          b.emQueda - a.emQueda ||
          (a.atingimentoMedio ?? Number.POSITIVE_INFINITY) -
            (b.atingimentoMedio ?? Number.POSITIVE_INFINITY) ||
          porNome(a, b)
        );
    }
  });

  return ordenados;
}