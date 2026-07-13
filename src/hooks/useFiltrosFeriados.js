import { useMemo, useState } from 'react';
import { useDebounce } from './useDebounce';
import { buscarFeriados, buscarMunicipios } from '../utils/feriadosBusca';

const ANO_PADRAO = new Date().getFullYear();

const FILTROS_PADRAO = {
  uf: '',
  cidade: '',
  ano: ANO_PADRAO,
  dataInicio: '',
  dataFim: '',
  nomeFeriado: '',
  tipo: '',
};

/**
 * Estado dos filtros da página de Calendário de Feriados + a consulta em
 * si. Cálculo é local e síncrono (ver utils/feriadosBusca.js — não é uma
 * chamada de rede), então "carregando" nunca fica visível por mais que um
 * frame — ainda assim existe como estado pra a UI ter algo pra mostrar se
 * isso mudar no futuro (ex.: se a base virar uma tabela remota).
 *
 * Busca por CIDADE é debounced (300ms): o campo dispara uma busca a cada
 * tecla no índice de 238 municípios, e embora o custo real seja
 * desprezível, o debounce evita recalcular a cada tecla e é a prática
 * pedida explicitamente pro campo de busca principal.
 */
export function useFiltrosFeriados() {
  const [filtros, setFiltros] = useState(FILTROS_PADRAO);
  const [termoBuscaCidade, setTermoBuscaCidade] = useState('');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const ITENS_POR_PAGINA = 20;

  const termoBuscaCidadeComAtraso = useDebounce(termoBuscaCidade, 300);

  const sugestoesCidade = useMemo(
    () => buscarMunicipios(termoBuscaCidadeComAtraso, filtros.uf || null),
    [termoBuscaCidadeComAtraso, filtros.uf],
  );

  function atualizarFiltro(campo, valor) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
    setPaginaAtual(1); // qualquer mudança de filtro volta pro início da lista
  }

  function selecionarCidade(municipio) {
    setFiltros((atual) => ({ ...atual, uf: municipio.uf, cidade: municipio.cidade }));
    setTermoBuscaCidade(municipio.cidade);
    setPaginaAtual(1);
  }

  /**
   * Confirma o texto DIGITADO como cidade, mesmo sem o usuário ter clicado
   * numa sugestão — necessário pra pesquisar qualquer cidade do Brasil, não
   * só as 238 com feriado municipal cadastrado (essas aparecem no
   * dropdown; as demais não, porque o índice de busca só cobre quem tem
   * feriado próprio — mas ainda têm nacional/estadual, então a busca não
   * pode ficar restrita a elas). Exige Estado selecionado: sem UF não dá
   * pra saber qual estadual aplicar nem desambiguar nomes repetidos entre
   * estados.
   */
  function confirmarCidadeDigitada() {
    const texto = termoBuscaCidade.trim();
    if (!texto || !filtros.uf || texto === filtros.cidade) return;
    setFiltros((atual) => ({ ...atual, cidade: texto }));
    setPaginaAtual(1);
  }

  function limparCidade() {
    setFiltros((atual) => ({ ...atual, cidade: '' }));
    setTermoBuscaCidade('');
    setPaginaAtual(1);
  }

  function limparFiltros() {
    setFiltros(FILTROS_PADRAO);
    setTermoBuscaCidade('');
    setPaginaAtual(1);
  }

  // Uma exceção aqui só pode vir de entrada malformada escapando da
  // validação do próprio campo (ex.: data fora do intervalo que o
  // <input type="date"> aceita) — não é uma chamada de rede que possa
  // falhar por conta própria, mas ainda assim tratado como erro
  // recuperável em vez de deixar a página em branco.
  const resultado = useMemo(() => {
    try {
      return { dados: buscarFeriados(filtros), erro: null };
    } catch (excecao) {
      return { dados: null, erro: excecao.message || 'Não foi possível consultar a base de feriados.' };
    }
  }, [filtros]);

  const listaCompleta = resultado.dados?.lista ?? [];
  const listaPaginada = listaCompleta.slice(0, paginaAtual * ITENS_POR_PAGINA);
  const temMaisParaCarregar = listaPaginada.length < listaCompleta.length;

  const quantidadeFiltrosAtivos =
    (filtros.uf !== '' ? 1 : 0) +
    (filtros.cidade !== '' ? 1 : 0) +
    (filtros.dataInicio !== '' ? 1 : 0) +
    (filtros.dataFim !== '' ? 1 : 0) +
    (filtros.nomeFeriado !== '' ? 1 : 0) +
    (filtros.tipo !== '' ? 1 : 0);

  return {
    filtros,
    atualizarFiltro,
    limparFiltros,
    termoBuscaCidade,
    setTermoBuscaCidade,
    sugestoesCidade,
    selecionarCidade,
    confirmarCidadeDigitada,
    limparCidade,
    resumo: resultado.dados?.resumo ?? null,
    erro: resultado.erro,
    listaCompleta,
    listaPaginada,
    temMaisParaCarregar,
    carregarMais: () => setPaginaAtual((p) => p + 1),
    quantidadeFiltrosAtivos,
  };
}