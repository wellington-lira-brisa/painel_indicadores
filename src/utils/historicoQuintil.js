export const MESES_PADRAO_HISTORICO_QUINTIL = 6;

/** Retorna competências mensais consecutivas, terminando em `mesRefFinal`. */
export function mesesConsecutivosAte(mesRefFinal, quantidade = MESES_PADRAO_HISTORICO_QUINTIL) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mesRefFinal ?? '') || quantidade <= 0) return [];

  const [ano, mes] = mesRefFinal.split('-').map(Number);
  const mesAbsolutoFinal = ano * 12 + (mes - 1);

  return Array.from({ length: quantidade }, (_, indice) => {
    const mesAbsoluto = mesAbsolutoFinal - quantidade + 1 + indice;
    const anoCalculado = Math.floor(mesAbsoluto / 12);
    const mesCalculado = (mesAbsoluto % 12) + 1;
    return `${anoCalculado}-${String(mesCalculado).padStart(2, '0')}-01`;
  });
}

/**
 * Q1 é melhor que Q5. Logo, Q4 -> Q3 é melhora e Q2 -> Q3 é queda.
 */
export function tendenciaEntreQuintis(quintilAnterior, quintilAtual) {
  if (!quintilAnterior || !quintilAtual) {
    return { tipo: 'sem-comparacao', faixas: 0 };
  }

  const faixas = quintilAnterior - quintilAtual;
  if (faixas > 0) return { tipo: 'melhorou', faixas };
  if (faixas < 0) return { tipo: 'caiu', faixas: Math.abs(faixas) };
  return { tipo: 'estavel', faixas: 0 };
}

/**
 * Monta o histórico apenas do time presente na competência atual.
 * Colaboradores novos ficam "sem comparação"; quem saiu do time não é
 * interpretado como queda de performance.
 */
export function montarHistoricoVendedores(resultadosPorMes, mesRefAtual, quantidade = MESES_PADRAO_HISTORICO_QUINTIL) {
  const meses = mesesConsecutivosAte(mesRefAtual, quantidade);
  const resultadoAtual = resultadosPorMes.get(mesRefAtual);
  const vendedoresAtuais = resultadoAtual?.vendedores ?? [];
  const porVendedor = new Map();

  for (const vendedor of vendedoresAtuais) {
    const vendedorId = vendedor.vendedorId || vendedor.vendedor;
    porVendedor.set(vendedorId, {
      vendedorId,
      vendedor: vendedor.vendedor,
      canais: vendedor.canais ?? [],
      porMes: {},
    });
  }

  for (const mesRef of meses) {
    for (const vendedor of resultadosPorMes.get(mesRef)?.vendedores ?? []) {
      const vendedorId = vendedor.vendedorId || vendedor.vendedor;
      const historico = porVendedor.get(vendedorId);
      if (!historico) continue;
      historico.porMes[mesRef] = {
        meta: vendedor.meta,
        realizado: vendedor.realizado,
        atingimento: vendedor.atingimento,
        quintil: vendedor.quintil,
      };
    }
  }

  const mesAnterior = meses.at(-2);
  const movimentos = { melhoraram: 0, estaveis: 0, cairam: 0, semComparacao: 0 };
  const vendedores = [...porVendedor.values()].map((vendedor) => {
    const tendencia = tendenciaEntreQuintis(
      vendedor.porMes[mesAnterior]?.quintil,
      vendedor.porMes[mesRefAtual]?.quintil,
    );

    if (tendencia.tipo === 'melhorou') movimentos.melhoraram += 1;
    else if (tendencia.tipo === 'estavel') movimentos.estaveis += 1;
    else if (tendencia.tipo === 'caiu') movimentos.cairam += 1;
    else movimentos.semComparacao += 1;

    return { ...vendedor, tendencia };
  });

  vendedores.sort((a, b) => {
    const atualA = a.porMes[mesRefAtual];
    const atualB = b.porMes[mesRefAtual];
    return (
      (atualA?.quintil ?? 99) - (atualB?.quintil ?? 99) ||
      (atualB?.atingimento ?? -1) - (atualA?.atingimento ?? -1) ||
      a.vendedor.localeCompare(b.vendedor, 'pt-BR')
    );
  });

  return { meses, vendedores, movimentos };
}