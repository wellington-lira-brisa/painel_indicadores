// Lista fechada de cidades prioritárias, enviada por José Amorim — foco
// inicial de acompanhamento e trabalho do time.
//
// Formato "Nome/UF" (mesmo formato da coluna `cidade` do CSV) porque
// reaproveita `normalizarCidade()` do ETL pra virar slug — a MESMA função
// que gera o `cidade.id` na base real (src/shared/csvIndicadores.js),
// então não existe risco de a comparação divergir por acento/maiúscula.
//
// Pra atualizar a lista: só editar este array. Nada mais no código
// precisa mudar.
const NOMES_CIDADES_PRIORITARIAS = [
  'Maceió/AL',
  'Natal/RN',
  'João Pessoa/PB',
  'Feira de Santana/BA',
  'Campina Grande/PB',
  'Caruaru/PE',
  'Petrolina/PE',
  'Paulista/PE',
  'Mossoró/RN',
  'Arapiraca/AL',
  'Juazeiro/BA',
  'Sobral/CE',
  'Garanhuns/PE',
  'Vitória de Santo Antão/PE',
  'Maranguape/CE',
  'Igarassu/PE',
  'São Lourenço da Mata/PE',
  'Santa Cruz do Capibaribe/PE',
  'Lagarto/SE',
  'Abreu e Lima/PE',
  'Bayeux/PB',
  'Itabaiana/SE',
  'Serra Talhada/PE',
  'Pacatuba/CE',
  'Gravatá/PE',
  'Araripina/PE',
  'Quixeramobim/CE',
  'Aquiraz/CE',
  'Picos/PI',
  'Tianguá/CE',
  'Belo Jardim/PE',
  'Rio Largo/AL',
  'Arcoverde/PE',
  'Palmeira dos Índios/AL',
  'Ouricuri/PE',
  'Sousa/PB',
  'Estância/SE',
  'Cabedelo/PB',
  'Escada/PE',
  'Pesqueira/PE',
  'Surubim/PE',
  'Piripiri/PI',
  'Acaraú/CE',
  'São Miguel dos Campos/AL',
  'Viçosa do Ceará/CE',
  'Salgueiro/PE',
  'Bezerros/PE',
  'Assú/RN',
  'Limoeiro/PE',
  'Acopiara/CE',
  'Itapajé/CE',
  'Tobias Barreto/SE',
  'São Benedito/CE',
  'Toritama/PE',
  'Campo Maior/PI',
  'Pedra Branca/CE',
  'Ipu/CE',
  'Várzea Alegre/CE',
  'Guaraciaba do Norte/CE',
  'Altos/PI',
  'Custódia/PE',
  'Ubajara/CE',
  'Tabuleiro do Norte/CE',
  'Lavras da Mangabeira/CE',
  'Pau dos Ferros/RN',
  'Luís Correia/PI',
  'Milagres/CE',
  'Cedro/CE',
  'Piranhas/AL',
  'Ibiapina/CE',
  'Quixeré/CE',
  // Base grafa sem apóstrofo ("OLHO DAGUA DAS FLORES"), diferente do nome
  // oficial do IBGE — usando a grafia da base pra garantir match com o
  // slug real (`cidade.id`); ver validação em __tests__/cidadesPrioritarias.test.mjs.
  'Olho Dagua das Flores/AL',
  'Uiraúna/PB',
  'Umarizal/RN',
  'Luís Gomes/RN',
  'Portalegre/RN',
  'Martins/RN',
  'Rafael Fernandes/RN',
];

/** Slugifica local e sem acento — igual a `slugificar()` do ETL, mas sem
 * exigir o formato "Nome/UF" (aqui a UF já vem separada). Duplicada de
 * propósito: é 6 linhas, e importar de csvIndicadores.js só por isso
 * criaria acoplamento desnecessário entre config estática e o módulo de
 * parsing do ETL. */
function slugificar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nomeParaSlug(nomeComUf) {
  const [nome, uf] = nomeComUf.split('/').map((p) => p.trim());
  return `${slugificar(nome)}-${slugificar(uf)}`;
}

/** Set de slugs (ex.: "araripina-pe") pra lookup O(1) por `cidade.id`. */
export const SLUGS_CIDADES_PRIORITARIAS = new Set(
  NOMES_CIDADES_PRIORITARIAS.map(nomeParaSlug),
);

export function ehCidadePrioritaria(cidadeId) {
  return SLUGS_CIDADES_PRIORITARIAS.has(cidadeId);
}