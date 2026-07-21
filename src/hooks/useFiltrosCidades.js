import { useEffect, useMemo, useState } from 'react';
import { normalizarTextoBusca } from '../utils/textoBusca';

const CHAVE_LOCALSTORAGE_PADRAO = 'painel-metas:filtros-ranking';

const FILTROS_PADRAO = {
  busca: '',
  regional: '',
  coordenacaoRegional: '',
  gerente: '',
  status: [], // subset de ['verde', 'amarelo', 'vermelho']; vazio = todos
  vendeFwa: 'todas', // 'todas' | 'sim' | 'nao'
  metaBatida: 'todas', // 'todas' | 'sim' | 'nao'
  atingimentoMin: '', // string do input; '' = sem piso
  prioritaria: 'todas', // 'todas' | 'sim' | 'nao'
};

/** Não guarda nada sensível — só preferências de visualização da tabela. */
function carregarFiltrosSalvos(chave) {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return FILTROS_PADRAO;
    const salvo = JSON.parse(bruto);
    return { ...FILTROS_PADRAO, ...salvo };
  } catch {
    return FILTROS_PADRAO;
  }
}

function cidadeCorrespondeAosFiltros(cidade, filtros, atingimentoMinNumero) {
  if (filtros.busca && !normalizarTextoBusca(cidade.nome).includes(filtros.busca)) return false;
  if (filtros.regional && cidade.regional !== filtros.regional) return false;
  if (filtros.coordenacaoRegional && cidade.coordenacaoRegional !== filtros.coordenacaoRegional) return false;
  if (filtros.gerente && cidade.gerente !== filtros.gerente) return false;
  if (filtros.status.length > 0 && !filtros.status.includes(cidade.status)) return false;

  if (filtros.vendeFwa !== 'todas') {
    const deveVender = filtros.vendeFwa === 'sim';
    if (Boolean(cidade.vendeFwa) !== deveVender) return false;
  }

  if (filtros.metaBatida !== 'todas') {
    const deveTerBatido = filtros.metaBatida === 'sim';
    if (cidade.score >= 100 !== deveTerBatido) return false;
  }

  if (filtros.prioritaria !== 'todas') {
    const deveSerPrioritaria = filtros.prioritaria === 'sim';
    if (Boolean(cidade.prioritaria) !== deveSerPrioritaria) return false;
  }

  if (atingimentoMinNumero !== null && cidade.score < atingimentoMinNumero) return false;

  return true;
}

/**
 * Filtros da tela de ranking. Filtragem 100% client-side via useMemo:
 * `cidades` já vem inteiro carregado (listarRanking não pagina), então
 * não há razão pra ida ao banco a cada mudança de filtro — o dataset é
 * pequeno o suficiente pra um único passe O(n) ser imperceptível.
 *
 * `chaveArmazenamento` é opcional (default = ranking do FTTH) — permite
 * cada tecnologia guardar sua própria preferência de filtro em vez de
 * compartilhar uma só entre FTTH e 5G.
 */
export function useFiltrosCidades(cidades, chaveArmazenamento = CHAVE_LOCALSTORAGE_PADRAO) {
  const [filtros, setFiltros] = useState(() => carregarFiltrosSalvos(chaveArmazenamento));

  useEffect(() => {
    localStorage.setItem(chaveArmazenamento, JSON.stringify(filtros));
  }, [filtros, chaveArmazenamento]);

  function atualizarFiltro(campo, valor) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
  }

  function alternarStatus(status) {
    setFiltros((atual) => ({
      ...atual,
      status: atual.status.includes(status)
        ? atual.status.filter((s) => s !== status)
        : [...atual.status, status],
    }));
  }

  function limparFiltros() {
    setFiltros(FILTROS_PADRAO);
  }

  const regionaisDisponiveis = useMemo(() => {
    if (!cidades) return [];
    return [...new Set(cidades.map((c) => c.regional).filter((r) => r != null))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [cidades]);

  const coordenacoesDisponiveis = useMemo(() => {
    if (!cidades) return [];
    return [...new Set(cidades.map((c) => c.coordenacaoRegional).filter((c) => c != null))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [cidades]);

  const gerentesDisponiveis = useMemo(() => {
    if (!cidades) return [];
    return [...new Set(cidades.map((c) => c.gerente).filter((g) => g != null))].sort((a, b) => a.localeCompare(b));
  }, [cidades]);

  const cidadesFiltradas = useMemo(() => {
    if (!cidades) return [];

    const buscaNormalizada = normalizarTextoBusca(filtros.busca);
    const atingimentoMinNumero =
      filtros.atingimentoMin === '' || Number.isNaN(Number(filtros.atingimentoMin))
        ? null
        : Number(filtros.atingimentoMin);
    const filtrosNormalizados = { ...filtros, busca: buscaNormalizada };

    return cidades.filter((cidade) =>
      cidadeCorrespondeAosFiltros(cidade, filtrosNormalizados, atingimentoMinNumero),
    );
  }, [cidades, filtros]);

  const quantidadeFiltrosAtivos =
    (filtros.busca !== '' ? 1 : 0) +
    (filtros.regional !== '' ? 1 : 0) +
    (filtros.coordenacaoRegional !== '' ? 1 : 0) +
    (filtros.gerente !== '' ? 1 : 0) +
    (filtros.status.length > 0 ? 1 : 0) +
    (filtros.vendeFwa !== 'todas' ? 1 : 0) +
    (filtros.metaBatida !== 'todas' ? 1 : 0) +
    (filtros.prioritaria !== 'todas' ? 1 : 0) +
    (filtros.atingimentoMin !== '' ? 1 : 0);

  return {
    filtros,
    atualizarFiltro,
    alternarStatus,
    limparFiltros,
    regionaisDisponiveis,
    coordenacoesDisponiveis,
    gerentesDisponiveis,
    cidadesFiltradas,
    quantidadeFiltrosAtivos,
  };
}