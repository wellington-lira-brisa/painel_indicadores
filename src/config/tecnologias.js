import { listarCidades, listarRanking, buscarCidade, carregarCanaisDisponiveis, cidadeService5g } from '../services/cidadeService';

/**
 * Um único lugar que descreve o que muda entre tecnologias (FTTH, 5G, e as
 * que vierem depois). Páginas e componentes de tabela/ranking recebem essa
 * config via prop em vez de terem uma cópia inteira por tecnologia — é o
 * que permite `PaginaRanking`/`PaginaCidade` (e tudo que elas renderizam:
 * TabelaIndicadores, TabelaRanking, filtros, médias por período...) serem
 * 100% reaproveitados, sem duplicar arquivo nenhum.
 *
 * O que já é automaticamente reaproveitado SEM precisar de nada aqui:
 * nome de indicador (ex.: "Ativação" em vez de "Instalação" já vem de
 * `mockCidades5g.js` — nenhum componente tem "Instalação" hardcoded),
 * cálculo de semanas/feriados/médias, colapso de colunas (tudo já lê os
 * dados da cidade, nunca o nome da tecnologia).
 */
export const TECNOLOGIAS = {
  ftth: {
    id: 'ftth',
    nome: 'FTTH',
    /** Classe que re-tema as variáveis --color-brand-* (ver index.css); vazio = paleta padrão (azul). */
    classeTema: '',
    /** Prefixo de rota: '' -> '/', '/cidades/:id'. */
    rotaBase: '',
    servicoCidades: { listarCidades, listarRanking, buscarCidade, carregarCanaisDisponiveis },
    chaveFiltros: 'painel-metas:filtros-ranking',
  },
  cincoG: {
    id: '5g',
    nome: '5G',
    classeTema: 'tema-5g',
    rotaBase: '/5g',
    servicoCidades: cidadeService5g,
    chaveFiltros: 'painel-metas:filtros-ranking-5g',
  },
};