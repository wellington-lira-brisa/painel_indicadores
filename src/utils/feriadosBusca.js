import { obterTodosOsFeriadosParaAno, estados } from '../vendor/feriados/feriadosCalculo';

/**
 * Camada de consulta sobre a base de feriados vendorizada
 * (vendor/feriados/feriadosCalculo.js — ver diagnóstico completo no PR que
 * introduziu este arquivo). Existe pra a página de Calendário de Feriados
 * não precisar conhecer o formato interno de `estados`/`obterTodosOsFeriadosParaAno`
 * — só chama `buscarFeriados(filtros)` e recebe algo pronto pra exibir.
 *
 * IMPORTANTE sobre a base: é uma biblioteca de CÁLCULO em memória, não um
 * banco de dados. Cobre os 27 estados (feriados nacionais + estaduais
 * completos) mas só 238 municípios têm feriado MUNICIPAL próprio
 * cadastrado — não é "todas as cidades do Brasil" na base municipal, só
 * nacional/estadual. Cidades fora dessa lista de 238 ainda aparecem na
 * busca (mostram nacional + estadual normalmente), só não têm feriado
 * municipal específico. Isso está documentado no diagnóstico entregue
 * junto — repetido aqui porque é a explicação de por que "todo município"
 * não é literalmente verdade pra feriado municipal.
 */

// --- Índice de cidades (pra busca) --------------------------------------
// Construído uma vez, na primeira importação — 238 linhas, custa
// centésimos de milissegundo. Recalcular isso a cada tecla digitada na
// busca seria desperdício; o índice é estático (mesma base pra qualquer
// sessão), então monta uma vez e reusa.
function normalizarBusca(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const INDICE_MUNICIPIOS = estados.flatMap((estado) =>
  estado.cidades.map((cidade) => ({
    uf: estado.acronimo,
    ufNome: estado.nome,
    cidade: cidade.nome,
    cidadeNormalizada: normalizarBusca(cidade.nome),
  })),
);

// Agrupado por UF uma única vez, no load do módulo — troca de estado no
// filtro vira um lookup O(1) num Map em vez de filtrar 238 linhas de novo
// a cada clique. Maior UF (SP) tem 63 cidades; mesmo sem esse Map o custo
// seria imperceptível, mas evita repetir o mesmo filtro sempre que o
// usuário reabre o campo com o mesmo estado já selecionado.
const CIDADES_POR_UF = new Map();
INDICE_MUNICIPIOS.forEach((m) => {
  if (!CIDADES_POR_UF.has(m.uf)) CIDADES_POR_UF.set(m.uf, []);
  CIDADES_POR_UF.get(m.uf).push(m);
});
// Ordenado uma vez, aqui — não a cada abertura do dropdown.
CIDADES_POR_UF.forEach((lista) => lista.sort((a, b) => a.cidade.localeCompare(b.cidade, 'pt-BR')));

export const ESTADOS_DISPONIVEIS = estados
  .map((e) => ({ acronimo: e.acronimo, nome: e.nome }))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

/**
 * Busca de cidade por nome parcial, sem acento, sem diferenciar
 * maiúsculas/minúsculas. Quando `uf` é informado, restringe a esse
 * estado — é o que resolve nomes de cidade ambíguos entre estados (o
 * chamador já filtrou por UF antes de perguntar "qual cidade").
 *
 * Sem termo de busca: só faz sentido devolver algo quando `uf` está
 * definido — é o comportamento "clicou no campo, já vê as cidades do
 * estado selecionado" (lookup direto em `CIDADES_POR_UF`, maior estado
 * tem 63 cidades — cabe inteiro sem paginação). Sem UF e sem termo,
 * devolve vazio (mesmo comportamento de sempre — sem estado selecionado
 * não há lista razoável de "todas as cidades do Brasil" pra mostrar de
 * cara).
 *
 * `limite` é maior quando é uma navegação por UF (uma lista fechada e
 * pequena, cabe inteira) e menor quando é busca livre por nome em todo o
 * Brasil (238 cidades — sem limite curto, o dropdown fica gigante e a
 * busca deixa de ser "rápida e objetiva").
 */
export function buscarMunicipios(termo, uf = null, limite = null) {
  const termoNormalizado = normalizarBusca(termo);

  if (!termoNormalizado) {
    if (!uf) return [];
    return (CIDADES_POR_UF.get(uf) ?? []).slice(0, limite ?? 100);
  }

  return INDICE_MUNICIPIOS.filter(
    (m) => (!uf || m.uf === uf) && m.cidadeNormalizada.includes(termoNormalizado),
  ).slice(0, limite ?? 20);
}

/** true se essa cidade tem feriados municipais próprios cadastrados na base (as outras só mostram nacional/estadual). */
export function municipioTemFeriadosProprios(uf, cidade) {
  return INDICE_MUNICIPIOS.some((m) => m.uf === uf && m.cidade === cidade);
}

// --- Consulta de feriados -------------------------------------------------

const TIPOS_FERIADO = ['NACIONAL', 'ESTADUAL', 'MUNICIPAL'];
export { TIPOS_FERIADO };

const NOMES_DIA_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/** yyyy-mm-dd local (sem depender de fuso — mesmo cuidado já usado em formatarDataSimples). */
function chaveData(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

// Cálculo é puro (mesmo ano+uf+cidade sempre dá o mesmo resultado) — cache
// em memória evita recalcular ao trocar só o filtro de nome/tipo/período,
// que são filtrados EM CIMA do resultado já calculado, não recalculados.
const cachePorAnoUfCidade = new Map();

function feriadosBrutosDoAno(ano, uf, cidade) {
  const chave = `${ano}:${uf ?? ''}:${cidade ?? ''}`;
  if (cachePorAnoUfCidade.has(chave)) return cachePorAnoUfCidade.get(chave);

  const feriados = obterTodosOsFeriadosParaAno(ano, uf || null, cidade || null, true); // true = marca emendas
  cachePorAnoUfCidade.set(chave, feriados);
  return feriados;
}

/**
 * Consulta principal da página. Recebe os filtros já validados e devolve
 * a lista pronta (ordenada, com dia da semana e emenda calculados) mais o
 * resumo analítico do MESMO conjunto filtrado — a lista e o resumo nunca
 * divergem porque vêm da mesma passada de dados.
 *
 * @param {{ uf?: string, cidade?: string, ano: number, dataInicio?: string,
 *   dataFim?: string, nomeFeriado?: string, tipo?: string }} filtros
 */
export function buscarFeriados(filtros) {
  const { uf, cidade, ano, dataInicio, dataFim, nomeFeriado, tipo } = filtros;

  const brutos = feriadosBrutosDoAno(ano, uf, cidade);

  const nomeNormalizado = normalizarBusca(nomeFeriado);
  const inicio = dataInicio ? new Date(`${dataInicio}T00:00:00`) : null;
  const fim = dataFim ? new Date(`${dataFim}T23:59:59`) : null;

  const filtrados = brutos.filter((f) => {
    if (f.ehEmenda) return false; // tratado à parte abaixo — nunca uma linha própria na listagem
    if (tipo && f.tipo !== tipo) return false;
    if (nomeNormalizado && !normalizarBusca(f.descricao).includes(nomeNormalizado)) return false;
    if (inicio && f.data < inicio) return false;
    if (fim && f.data > fim) return false;
    return true;
  });

  // Dias de possível emenda vêm do ANO INTEIRO sem filtro de tipo/nome —
  // é uma propriedade do calendário (dia útil espremido entre feriado e
  // fim de semana), não deveria sumir só porque o usuário filtrou por
  // "feriados municipais" ou por um nome específico.
  const diasDeEmenda = new Set(brutos.filter((f) => f.ehEmenda).map((f) => chaveData(f.data)));

  const lista = filtrados
    .map((f) => ({
      data: f.data,
      chaveData: chaveData(f.data),
      diaSemana: NOMES_DIA_SEMANA[f.data.getDay()],
      ehFimDeSemana: f.data.getDay() === 0 || f.data.getDay() === 6,
      descricao: f.descricao,
      tipo: f.tipo,
      // "possibilidade de emenda": o dia adjacente (não o feriado em si)
      // está marcado como emenda pela biblioteca — olha os dois vizinhos.
      possibilidadeDeEmenda:
        diasDeEmenda.has(chaveData(new Date(f.data.getTime() - 86400000))) ||
        diasDeEmenda.has(chaveData(new Date(f.data.getTime() + 86400000))),
    }))
    .sort((a, b) => a.data - b.data);

  return {
    lista,
    resumo: calcularResumo(lista, ano),
  };
}

/** Resumo analítico do MESMO conjunto já filtrado — nunca recalcula a partir da base bruta, só agrega o que já foi filtrado. */
function calcularResumo(lista, ano) {
  const porMes = Array.from({ length: 12 }, () => 0);
  let emDiaUtil = 0;
  let emFimDeSemana = 0;

  lista.forEach((f) => {
    porMes[f.data.getMonth()] += 1;
    if (f.ehFimDeSemana) emFimDeSemana += 1;
    else emDiaUtil += 1;
  });

  const maiorConcentracao = Math.max(0, ...porMes);
  const mesesComMaiorConcentracao =
    maiorConcentracao === 0
      ? []
      : porMes
          .map((qtd, i) => ({ mes: i, quantidade: qtd }))
          .filter((m) => m.quantidade === maiorConcentracao);

  const hoje = new Date();
  const proximo =
    ano === hoje.getFullYear() ? lista.find((f) => f.data >= new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) : lista[0];

  return {
    total: lista.length,
    emDiasUteis: emDiaUtil,
    emFinsDeSemana: emFimDeSemana,
    porMes,
    proximoFeriado: proximo ?? null,
    mesesComMaiorConcentracao,
  };
}