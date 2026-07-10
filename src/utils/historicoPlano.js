import { removerMarcacaoMarkdown, formatarDataSimples } from './format';
import { STATUS_PLANO_ROTULOS, normalizarStatusPlano } from './statusPlano';

/** Rótulo de exibição por nome de coluna — mesmas colunas que a trigger da migration 20260708140000 audita. Em formato de sentença ("Editou Como"), não de campo de formulário. */
export const ROTULOS_CAMPO_HISTORICO = {
  status: 'Status',
  o_que: 'O quê',
  como: 'Como',
  quem: 'Responsável',
  quando_previsto: 'Prazo',
  descricao: 'Descrição',
};

/**
 * Formata status e data pro "de → para" de uma linha só — únicos campos
 * que não passam por diff textual (valor curto, sem sentido comparar
 * palavra a palavra).
 */
export function formatarValorHistorico(campo, valor) {
  if (campo === 'status') return STATUS_PLANO_ROTULOS[normalizarStatusPlano(valor)] ?? '—';
  if (campo === 'quando_previsto') return formatarDataSimples(valor);
  return removerMarcacaoMarkdown(valor) || '—';
}

/**
 * Campos "curtos": valor único e enumerável (nome, data, status) — mostrados
 * como uma linha "de → para", nunca como diff de palavras.
 *
 * `quem` entra aqui, não nos campos longos: é um nome/responsável, não um
 * texto corrido — diferente de o_que/como/descricao, que são prosa e podem
 * conter checklist.
 */
const CAMPOS_CURTOS = new Set(['status', 'quando_previsto', 'quem']);

export function ehCampoCurto(campo) {
  return CAMPOS_CURTOS.has(campo);
}

/** Campos de prosa — podem ser longos, multi-linha, e conter checklist markdown. Ver utils/diffCampoPlano.js. */
export function ehCampoLongo(campo) {
  return !CAMPOS_CURTOS.has(campo);
}

function mesmoDiaCalendario(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Hoje" / "Ontem" / data — os eventos já vêm ordenados por data (mais recente primeiro) do service. */
function rotuloDia(dataIso) {
  const data = new Date(dataIso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);

  if (mesmoDiaCalendario(data, hoje)) return 'Hoje';
  if (mesmoDiaCalendario(data, ontem)) return 'Ontem';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Agrupa eventos consecutivos do mesmo dia sob um único cabeçalho — evita
 * repetir a data em cada linha quando o histórico cresce (mesmo padrão de
 * GitHub/Linear pra activity feed).
 */
export function agruparEventosPorDia(eventos) {
  const grupos = [];
  for (const evento of eventos) {
    const rotulo = rotuloDia(evento.alteradoEm);
    const grupoAtual = grupos[grupos.length - 1];
    if (grupoAtual && grupoAtual.rotulo === rotulo) {
      grupoAtual.eventos.push(evento);
    } else {
      grupos.push({ rotulo, eventos: [evento] });
    }
  }
  return grupos;
}

/** Tempo relativo pra leitura rápida ("há 2 h"); cai pra data absoluta depois de 30 dias, onde "há 42 dias" deixa de ser útil. */
export function tempoRelativo(dataIso) {
  const diffMs = Date.now() - new Date(dataIso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;

  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `há ${diffHoras} h`;

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 30) return `há ${diffDias} dia${diffDias > 1 ? 's' : ''}`;

  return new Date(dataIso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Iniciais pro avatar do autor — primeira letra do primeiro e do último nome. */
export function iniciaisNome(nome) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}