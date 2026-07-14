import { indicador, comBaseAtiva } from './mockHelpers';

/**
 * Dados mockados do 5G — mesma estrutura do FTTH (mockCidades.js), gerados
 * pelos mesmos helpers (mockHelpers.js).
 *
 * Conjunto de indicadores é menor que o do FTTH e numa ordem própria,
 * pedido explícito do negócio: Base Ativa (sempre primeiro, indicador
 * implícito — ver `comBaseAtiva` abaixo), Crescimento (base), Ativação
 * (meta + realizado). "Orçamento (vendas)" e "Efetivado" — que o FTTH tem
 * — não são rastreados no 5G. Churn Rate e Cancelamento existiam aqui
 * antes, mas foram removidos a pedido do negócio (não usados no momento)
 * — ver histórico do arquivo se precisar recuperar os valores mockados.
 *
 * Quebra semanal só existe pra Ativação — é o único indicador com
 * apuração real por semana; Crescimento só fecha no fim do mês (por isso
 * o 6º argumento `false` — ver `possuiSemanas` em `indicador()`,
 * mockHelpers.js).
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
    ],
  },
];

/** Valor inicial de Base Ativa por cidade, na mesma ordem de `cidadesMock5g` — bem menor que o FTTH (rollout recente). */
const BASE_ATIVA_INICIAL_5G = [3800, 8600, 10200, 6100, 3900, 7200];

cidadesMock5g.forEach((cidade, i) => {
  Object.assign(cidade, comBaseAtiva(cidade, BASE_ATIVA_INICIAL_5G[i]));
});