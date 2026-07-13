import { cidadesMock } from '../data/mockCidades';
import { cidadesMock5g } from '../data/mockCidades5g';
import { scoreCidade, statusCidade, tendenciaCidade } from '../utils/status';
import { listarStatusFwa } from './fwaService';
import { listarStatusPlanosAtivosPorCidade } from './planoAcaoService';
import { carregarIndiceRealizados, indiceEmCacheOuNulo, aplicarRealizadosReais } from './indicadorRealizadoService';

/**
 * Indicadores realizados (ver INDICADORES_COM_DADO_REAL em
 * indicadorRealizadoService.js) são complementares no mesmo sentido que
 * FWA e plano de ação: uma falha ao buscar a base real não pode derrubar
 * a listagem de cidades. Na falha, reaproveita o último índice carregado
 * com sucesso nesta sessão (se houver) — nunca mostra o valor mockado no
 * lugar do real.
 */
async function indiceRealizadosComFallback(tecnologiaId) {
  try {
    return await carregarIndiceRealizados(tecnologiaId);
  } catch (excecao) {
    console.error(`Falha ao carregar dados reais de ${tecnologiaId}, mantendo último valor conhecido:`, excecao);
    return indiceEmCacheOuNulo(tecnologiaId);
  }
}

/**
 * FWA é informação complementar: se a consulta falhar (RLS, rede, etc.),
 * a listagem de cidades não pode quebrar por causa dela. Degrada para
 * "nenhuma cidade com FWA configurado" e loga o erro real.
 */
async function statusFwaComFallback() {
  try {
    return await listarStatusFwa();
  } catch (excecao) {
    console.error('Falha ao carregar status de FWA, seguindo sem essa informação:', excecao);
    return {};
  }
}

/** Mesmo raciocínio do FWA: plano de ação é complementar, nunca pode quebrar o Ranking. */
async function statusPlanoAtivoComFallback(tecnologiaId) {
  try {
    return await listarStatusPlanosAtivosPorCidade(tecnologiaId);
  } catch (excecao) {
    console.error('Falha ao carregar status de plano de ação, seguindo sem essa informação:', excecao);
    return {};
  }
}

function enriquecer(cidade, statusFwa, statusPlanoAtivo, indiceRealizados, tecnologiaId) {
  const cidadeComDadosReais = aplicarRealizadosReais(cidade, indiceRealizados, tecnologiaId);
  return {
    ...cidadeComDadosReais,
    score: scoreCidade(cidadeComDadosReais),
    status: statusCidade(cidadeComDadosReais),
    tendencia: tendenciaCidade(cidadeComDadosReais),
    vendeFwa: statusFwa[cidade.id] ?? false,
    temPlanoAtivo: statusPlanoAtivo[cidade.id] ?? false,
  };
}

/**
 * Fábrica de serviço de cidades: recebe o dataset mockado e o id da
 * tecnologia correspondente, devolve o mesmo contrato de 3 funções
 * assíncronas. FWA não depende de tecnologia (é atributo da cidade em si);
 * plano de ação depende — por isso `tecnologiaId` é passado a
 * `listarStatusPlanosAtivosPorCidade`, garantindo que o badge "possui
 * plano" do Ranking do 5G nunca conte um plano de FTTH (e vice-versa).
 *
 * A metainformação da cidade (nome, gerente, regional, coordenador,
 * ativação comercial) e os indicadores sem cobertura na base real (meta,
 * churn, cancelamento, crescimento) ainda vêm de `cidadesMockDaTecnologia`
 * — só o `realizado` dos indicadores em INDICADORES_COM_DADO_REAL
 * (indicadorRealizadoService.js) é substituído pela base real, dentro de
 * `enriquecer`. Ver RELATORIO.md, "O que continua mockado".
 */
function criarServicoCidades(cidadesMockDaTecnologia, tecnologiaId) {
  async function listarCidades() {
    const [statusFwa, statusPlanoAtivo, indiceRealizados] = await Promise.all([
      statusFwaComFallback(),
      statusPlanoAtivoComFallback(tecnologiaId),
      indiceRealizadosComFallback(tecnologiaId),
    ]);
    return cidadesMockDaTecnologia.map((cidade) =>
      enriquecer(cidade, statusFwa, statusPlanoAtivo, indiceRealizados, tecnologiaId),
    );
  }

  async function listarRanking() {
    const cidades = await listarCidades();
    return [...cidades].sort((a, b) => b.score - a.score);
  }

  async function buscarCidade(id) {
    const cidade = cidadesMockDaTecnologia.find((c) => c.id === id);
    if (!cidade) return null;
    const [statusFwa, statusPlanoAtivo, indiceRealizados] = await Promise.all([
      statusFwaComFallback(),
      statusPlanoAtivoComFallback(tecnologiaId),
      indiceRealizadosComFallback(tecnologiaId),
    ]);
    return enriquecer(cidade, statusFwa, statusPlanoAtivo, indiceRealizados, tecnologiaId);
  }

  return { listarCidades, listarRanking, buscarCidade };
}

// Serviço padrão (FTTH) — exports nomeados individuais mantidos por
// compatibilidade: todo import existente (`import { listarCidades, ... }
// from '../services/cidadeService'`) continua funcionando sem mudança.
const servicoFtth = criarServicoCidades(cidadesMock, 'ftth');
export const { listarCidades, listarRanking, buscarCidade } = servicoFtth;

/** Mesmo contrato do serviço padrão, operando sobre o dataset e a tecnologia do 5G. */
export const cidadeService5g = criarServicoCidades(cidadesMock5g, '5g');