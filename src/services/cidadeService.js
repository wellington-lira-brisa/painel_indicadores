import { cidadesMock } from '../data/mockCidades';
import { cidadesMock5g } from '../data/mockCidades5g';
import { scoreCidade, statusCidade, tendenciaCidade } from '../utils/status';
import { listarStatusFwa } from './fwaService';
import { listarStatusPlanosAtivosPorCidade } from './planoAcaoService';

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

function enriquecer(cidade, statusFwa, statusPlanoAtivo) {
  return {
    ...cidade,
    score: scoreCidade(cidade),
    status: statusCidade(cidade),
    tendencia: tendenciaCidade(cidade),
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
 * Hoje lê dados mockados; ao integrar com API real, trocar apenas a fonte
 * (`cidadesMockDaTecnologia`) por uma consulta ao Supabase, mantendo o
 * restante igual.
 */
function criarServicoCidades(cidadesMockDaTecnologia, tecnologiaId) {
  async function listarCidades() {
    const [statusFwa, statusPlanoAtivo] = await Promise.all([
      statusFwaComFallback(),
      statusPlanoAtivoComFallback(tecnologiaId),
    ]);
    return cidadesMockDaTecnologia.map((cidade) => enriquecer(cidade, statusFwa, statusPlanoAtivo));
  }

  async function listarRanking() {
    const cidades = await listarCidades();
    return [...cidades].sort((a, b) => b.score - a.score);
  }

  async function buscarCidade(id) {
    const cidade = cidadesMockDaTecnologia.find((c) => c.id === id);
    if (!cidade) return null;
    const [statusFwa, statusPlanoAtivo] = await Promise.all([
      statusFwaComFallback(),
      statusPlanoAtivoComFallback(tecnologiaId),
    ]);
    return enriquecer(cidade, statusFwa, statusPlanoAtivo);
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