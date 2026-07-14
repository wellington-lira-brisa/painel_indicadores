import { MESES, ANO_PAINEL, indicador, comBaseAtiva } from './mockHelpers';

/**
 * Dados mockados no formato esperado da futura API.
 * `realizado: null` indica mês ainda não apurado.
 *
 * Reexporta MESES/ANO_PAINEL de mockHelpers.js pra não quebrar os vários
 * arquivos que já importam `{ MESES, ANO_PAINEL } from '../data/mockCidades'`
 * — só a geração (`indicador`/`comBaseAtiva`) foi extraída pra ser
 * compartilhada com outras tecnologias (ver mockCidades5g.js).
 */
export { MESES, ANO_PAINEL };

export const cidadesMock = [
  {
    id: 'araripina-pe',
    nome: 'Araripina/PE',
    uf: 'PE',
    gerente: 'Jeckson Diogo',
    regional: 'G7',
    coordenadorRegional: 'Andreza Karelly',
    ativacaoComercial: '2022-03-02',
    indicadores: [
      indicador('orcamento', 'Orçamento (vendas)', 'abs', true,
        [127, 90, 104, 102, 107, 99, 110, 103, 101, 103, 92, 101],
        [92, 108, 100, 79, 72, 72]),
      indicador('efetivado', 'Efetivado', 'abs', true,
        [108, 80, 94, 93, 104, 85, 97, 97, 97, 97, 97, 97],
        [76, 95, 94, 69, 62, 71]),
      indicador('instalacao', 'Instalação', 'abs', true,
        [95, 72, 84, 83, 98, 76, 89, 89, 89, 89, 89, 89],
        [69, 95, 79, 74, 49, 68]),
    ],
  },
  {
    id: 'barbalha-ce',
    nome: 'Barbalha/CE',
    uf: 'CE',
    gerente: 'Jeckson Diogo',
    regional: 'G7',
    coordenadorRegional: 'Bruno Gonçalves',
    ativacaoComercial: '2017-04-01',
    indicadores: [
      indicador('orcamento', 'Orçamento (vendas)', 'abs', true,
        [255, 284, 330, 322, 340, 314, 348, 327, 320, 327, 293, 320],
        [283, 265, 321, 331, 314, 279]),
      indicador('efetivado', 'Efetivado', 'abs', true,
        [217, 262, 305, 301, 329, 278, 316, 316, 316, 316, 316, 316],
        [240, 240, 267, 270, 266, 241]),
      indicador('instalacao', 'Instalação', 'abs', true,
        [192, 241, 282, 279, 294, 249, 294, 294, 294, 294, 294, 294],
        [201, 190, 218, 217, 232, 181]),
    ],
  },
  {
    id: 'juazeiro-ce',
    nome: 'Juazeiro do Norte/CE',
    uf: 'CE',
    gerente: 'Marcos Lima',
    regional: 'G7',
    coordenadorRegional: 'Bruno Gonçalves',
    ativacaoComercial: '2016-08-15',
    indicadores: [
      indicador('orcamento', 'Orçamento (vendas)', 'abs', true,
        [400, 410, 420, 415, 430, 420, 440, 430, 430, 430, 420, 430],
        [410, 425, 431, 420, 445, 438]),
      indicador('efetivado', 'Efetivado', 'abs', true,
        [360, 370, 380, 375, 390, 380, 400, 390, 390, 390, 380, 390],
        [365, 380, 392, 381, 402, 395]),
      indicador('instalacao', 'Instalação', 'abs', true,
        [330, 340, 350, 345, 360, 350, 370, 360, 360, 360, 350, 360],
        [338, 352, 361, 350, 372, 366]),
    ],
  },
  {
    id: 'crato-ce',
    nome: 'Crato/CE',
    uf: 'CE',
    gerente: 'Marcos Lima',
    regional: 'G7',
    coordenadorRegional: 'Bruno Gonçalves',
    ativacaoComercial: '2018-02-10',
    indicadores: [
      indicador('orcamento', 'Orçamento (vendas)', 'abs', true,
        [200, 210, 215, 210, 220, 215, 225, 220, 220, 220, 210, 220],
        [175, 182, 190, 178, 185, 176]),
      indicador('efetivado', 'Efetivado', 'abs', true,
        [180, 189, 194, 189, 198, 194, 203, 198, 198, 198, 189, 198],
        [150, 158, 165, 152, 160, 149]),
      indicador('instalacao', 'Instalação', 'abs', true,
        [165, 173, 178, 173, 181, 177, 186, 181, 181, 181, 173, 181],
        [132, 140, 146, 133, 141, 129]),
    ],
  },
  {
    id: 'iguatu-ce',
    nome: 'Iguatu/CE',
    uf: 'CE',
    gerente: 'Patrícia Nunes',
    regional: 'G6',
    coordenadorRegional: 'Carlos Andrade',
    ativacaoComercial: '2019-11-05',
    indicadores: [
      indicador('orcamento', 'Orçamento (vendas)', 'abs', true,
        [150, 155, 160, 158, 165, 160, 168, 165, 165, 165, 158, 165],
        [138, 130, 149, 135, 142, 128]),
      indicador('efetivado', 'Efetivado', 'abs', true,
        [135, 140, 144, 142, 149, 144, 151, 149, 149, 149, 142, 149],
        [120, 112, 130, 116, 124, 110]),
      indicador('instalacao', 'Instalação', 'abs', true,
        [124, 128, 132, 130, 136, 132, 139, 136, 136, 136, 130, 136],
        [106, 99, 116, 102, 110, 96]),
    ],
  },
  {
    id: 'sobral-ce',
    nome: 'Sobral/CE',
    uf: 'CE',
    gerente: 'Patrícia Nunes',
    regional: 'G6',
    coordenadorRegional: 'Carlos Andrade',
    ativacaoComercial: '2020-06-20',
    indicadores: [
      indicador('orcamento', 'Orçamento (vendas)', 'abs', true,
        [300, 310, 320, 315, 330, 320, 336, 330, 330, 330, 315, 330],
        [285, 296, 310, 298, 318, 305]),
      indicador('efetivado', 'Efetivado', 'abs', true,
        [270, 279, 288, 284, 297, 288, 302, 297, 297, 297, 284, 297],
        [252, 264, 278, 265, 285, 272]),
      indicador('instalacao', 'Instalação', 'abs', true,
        [248, 257, 265, 261, 273, 265, 278, 273, 273, 273, 261, 273],
        [228, 240, 252, 240, 260, 246]),
    ],
  },
];

/** Valor inicial de Base Ativa por cidade, na mesma ordem de `cidadesMock`. */
const BASE_ATIVA_INICIAL = [12000, 28000, 34000, 21000, 13500, 24000];

cidadesMock.forEach((cidade, i) => {
  Object.assign(cidade, comBaseAtiva(cidade, BASE_ATIVA_INICIAL[i]));
});