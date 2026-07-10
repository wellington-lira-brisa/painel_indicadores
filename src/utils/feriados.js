import { obterTodosOsFeriadosParaAno } from '../vendor/feriados/feriadosCalculo';

/**
 * Nome do município na base de feriados vendorizada, por `cidade.id`.
 * Só cidades presentes na base entram aqui — as demais recebem apenas
 * feriados nacionais e estaduais (a base não cobre todo município do
 * Brasil, e passar um nome que não existe nela quebra o cálculo).
 */
const MUNICIPIO_NA_BASE_DE_FERIADOS = {
  'juazeiro-ce': 'Juazeiro do Norte',
  'sobral-ce': 'Sobral',
};

/**
 * Cache em memória por cidade+ano: o cálculo de feriados é puro e
 * determinístico (mesmo UF/município/ano sempre dá o mesmo resultado), então
 * não há razão pra recalcular ao trocar de mês, alternar semanas ou
 * re-renderizar a tabela.
 */
const cacheFeriadosPorCidadeEAno = new Map();

function feriadosDaCidadeNoAno(cidade, ano) {
  const chave = `${cidade.uf}:${cidade.id}:${ano}`;
  if (cacheFeriadosPorCidadeEAno.has(chave)) {
    return cacheFeriadosPorCidadeEAno.get(chave);
  }

  const municipio = MUNICIPIO_NA_BASE_DE_FERIADOS[cidade.id] ?? null;
  const feriados = obterTodosOsFeriadosParaAno(ano, cidade.uf, municipio, false);
  cacheFeriadosPorCidadeEAno.set(chave, feriados);
  return feriados;
}

/** Feriados (nacionais + estaduais + municipais, quando disponíveis) de um mês específico. */
export function feriadosDaCidadeNoMes(cidade, ano, mesIndice) {
  return feriadosDaCidadeNoAno(cidade, ano).filter((feriado) => feriado.data.getMonth() === mesIndice);
}