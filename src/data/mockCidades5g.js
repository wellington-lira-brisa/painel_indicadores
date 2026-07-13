import { indicador, comBaseAtiva } from './mockHelpers';

/**
 * Dados mockados do 5G — mesma estrutura do FTTH (mockCidades.js), gerados
 * pelos mesmos helpers (mockHelpers.js).
 *
 * Conjunto de indicadores é menor que o do FTTH e numa ordem própria,
 * pedido explícito do negócio: Base Ativa (sempre primeiro, indicador
 * implícito — ver `comBaseAtiva` abaixo), Crescimento (base), Ativação
 * (meta + realizado), Churn Rate, Cancelamento. "Orçamento (vendas)" e
 * "Efetivado" — que o FTTH tem — não são rastreados no 5G.
 *
 * Quebra semanal só existe pra Ativação — é o único indicador com
 * apuração real por semana; os demais só fecham no fim do mês (por isso
 * o 6º argumento `false` em Crescimento/Churn/Cancelamento — ver
 * `possuiSemanas` em `indicador()`, mockHelpers.js).
 *
 * Reaproveita o mesmo roster de cidades do FTTH (mesmos `id`), mas com
 * `ativacaoComercial` própria do 5G (lançado depois, cidade a cidade) —
 * os dois datasets são independentes: nada aqui depende de mockCidades.js.
 */
export const cidadesMock5g = [
  {
    id: 'araripina-pe',
    nome: 'Araripina/PE',
    uf: 'PE',
    gerente: 'Jeckson Diogo',
    regional: 'G7',
    coordenadorRegional: 'Andreza Karelly',
    ativacaoComercial: '2024-09-10',
    indicadores: [
      indicador('crescimento', 'Crescimento (base)', 'abs', true,
        [22, 14, 18, 19, 24, 15, 21, 21, 36, 36, 36, 36],
        [-11, 19, 1, 8, 4, 12],
        false),
      indicador('ativacao', 'Ativação', 'abs', true,
        [36, 30, 35, 34, 37, 33, 39, 38, 38, 38, 38, 38],
        [27, 38, 32, 30, 20, 27]),
      indicador('churn', 'Churn Rate', 'pct', false,
        [2.6, 2.5, 2.5, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4],
        [6.4, 3.0, 4.8, 3.5, 2.5, 2.3],
        false),
      indicador('cancelamento', 'Cancelamento', 'abs', false,
        [15, 15, 15, 14, 14, 14, 14, 14, 0, 0, 0, 0],
        [38, 18, 30, 22, 16, 15],
        false),
    ],
  },
  {
    id: 'barbalha-ce',
    nome: 'Barbalha/CE',
    uf: 'CE',
    gerente: 'Jeckson Diogo',
    regional: 'G7',
    coordenadorRegional: 'Bruno Gonçalves',
    ativacaoComercial: '2024-02-14',
    indicadores: [
      indicador('crescimento', 'Crescimento (base)', 'abs', true,
        [44, 64, 80, 80, 86, 68, 86, 86, 86, 86, 86, 86],
        [46, 46, 59, 58, 61, 37],
        false),
      indicador('ativacao', 'Ativação', 'abs', true,
        [77, 96, 113, 112, 118, 100, 118, 118, 118, 118, 118, 118],
        [80, 76, 87, 87, 93, 72]),
      indicador('churn', 'Churn Rate', 'pct', false,
        [2.5, 2.5, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4],
        [2.7, 2.4, 2.3, 2.5, 2.6, 2.8],
        false),
      indicador('cancelamento', 'Cancelamento', 'abs', false,
        [32, 32, 31, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        [34, 30, 28, 29, 32, 35],
        false),
    ],
  },
  {
    id: 'juazeiro-ce',
    nome: 'Juazeiro do Norte/CE',
    uf: 'CE',
    gerente: 'Marcos Lima',
    regional: 'G7',
    coordenadorRegional: 'Bruno Gonçalves',
    ativacaoComercial: '2023-11-20',
    indicadores: [
      indicador('crescimento', 'Crescimento (base)', 'abs', true,
        [84, 88, 93, 92, 98, 95, 103, 99, 99, 99, 95, 99],
        [89, 97, 100, 97, 107, 104],
        false),
      indicador('ativacao', 'Ativação', 'abs', true,
        [132, 136, 140, 138, 144, 140, 148, 144, 144, 144, 140, 144],
        [135, 141, 144, 140, 149, 146]),
      indicador('churn', 'Churn Rate', 'pct', false,
        [2.3, 2.3, 2.3, 2.25, 2.25, 2.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.2],
        [2.2, 2.15, 2.22, 2.18, 2.1, 2.12],
        false),
      indicador('cancelamento', 'Cancelamento', 'abs', false,
        [48, 48, 47, 46, 46, 45, 45, 45, 45, 45, 45, 45],
        [46, 44, 45, 43, 42, 43],
        false),
    ],
  },
  {
    id: 'crato-ce',
    nome: 'Crato/CE',
    uf: 'CE',
    gerente: 'Marcos Lima',
    regional: 'G7',
    coordenadorRegional: 'Bruno Gonçalves',
    ativacaoComercial: '2024-05-08',
    indicadores: [
      indicador('crescimento', 'Crescimento (base)', 'abs', true,
        [38, 41, 44, 43, 46, 45, 48, 46, 46, 46, 43, 46],
        [18, 19, 24, 15, 20, 12],
        false),
      indicador('ativacao', 'Ativação', 'abs', true,
        [66, 69, 71, 69, 72, 71, 74, 72, 72, 72, 69, 72],
        [53, 56, 58, 53, 56, 52]),
      indicador('churn', 'Churn Rate', 'pct', false,
        [2.5, 2.5, 2.5, 2.45, 2.45, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4],
        [2.9, 3.0, 2.85, 3.1, 3.05, 3.2],
        false),
      indicador('cancelamento', 'Cancelamento', 'abs', false,
        [28, 28, 27, 26, 26, 26, 26, 26, 26, 26, 26, 26],
        [35, 37, 34, 38, 36, 40],
        false),
    ],
  },
  {
    id: 'iguatu-ce',
    nome: 'Iguatu/CE',
    uf: 'CE',
    gerente: 'Patrícia Nunes',
    regional: 'G6',
    coordenadorRegional: 'Carlos Andrade',
    ativacaoComercial: '2024-07-22',
    indicadores: [
      indicador('crescimento', 'Crescimento (base)', 'abs', true,
        [28, 29, 31, 31, 34, 32, 35, 34, 34, 34, 31, 34],
        [17, 13, 22, 15, 19, 11],
        false),
      indicador('ativacao', 'Ativação', 'abs', true,
        [50, 51, 53, 52, 54, 53, 56, 54, 54, 54, 52, 54],
        [42, 40, 46, 41, 44, 38]),
      indicador('churn', 'Churn Rate', 'pct', false,
        [2.6, 2.6, 2.55, 2.5, 2.5, 2.45, 2.45, 2.45, 2.45, 2.45, 2.45, 2.45],
        [2.8, 2.9, 2.75, 2.85, 2.8, 2.95],
        false),
      indicador('cancelamento', 'Cancelamento', 'abs', false,
        [22, 22, 21, 20, 20, 20, 20, 20, 20, 20, 20, 20],
        [25, 26, 24, 26, 25, 28],
        false),
    ],
  },
  {
    id: 'sobral-ce',
    nome: 'Sobral/CE',
    uf: 'CE',
    gerente: 'Patrícia Nunes',
    regional: 'G6',
    coordenadorRegional: 'Carlos Andrade',
    ativacaoComercial: '2023-12-01',
    indicadores: [
      indicador('crescimento', 'Crescimento (base)', 'abs', true,
        [61, 65, 69, 68, 73, 70, 76, 74, 74, 74, 69, 74],
        [51, 58, 64, 58, 68, 62],
        false),
      indicador('ativacao', 'Ativação', 'abs', true,
        [99, 103, 106, 104, 109, 106, 111, 109, 109, 109, 104, 109],
        [91, 96, 101, 96, 104, 98]),
      indicador('churn', 'Churn Rate', 'pct', false,
        [2.4, 2.4, 2.35, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3, 2.3],
        [2.5, 2.45, 2.35, 2.4, 2.3, 2.35],
        false),
      indicador('cancelamento', 'Cancelamento', 'abs', false,
        [38, 38, 37, 36, 36, 36, 36, 36, 36, 36, 36, 36],
        [40, 38, 37, 38, 36, 37],
        false),
    ],
  },
];

/** Valor inicial de Base Ativa por cidade, na mesma ordem de `cidadesMock5g` — bem menor que o FTTH (rollout recente). */
const BASE_ATIVA_INICIAL_5G = [3800, 8600, 10200, 6100, 3900, 7200];

cidadesMock5g.forEach((cidade, i) => {
  Object.assign(cidade, comBaseAtiva(cidade, BASE_ATIVA_INICIAL_5G[i]));
});