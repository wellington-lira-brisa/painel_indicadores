import { useMemo, useState } from 'react';
import { ANO_PAINEL, MESES } from '../data/mockCidades';
import { indiceMesAtual } from '../utils/tabelaIndicadores';
import { calcularMediaBaseAtiva, calcularMediaIndicador, indicesDoPeriodo } from '../utils/mediaPeriodo';

/**
 * Estado do período de análise (mês inicial/final) de uma cidade e as
 * médias derivadas dele. Cálculo 100% local sobre dados já carregados —
 * mudar o período nunca dispara consulta nova, só recalcula (useMemo) o
 * que já está em memória.
 *
 * `mesesDisponiveis` vem de `MESES` (já dirigido pelos dados mockados/reais):
 * se a base ganhar um 13º mês, os seletores e o cálculo acompanham sem
 * precisar mexer neste hook.
 */
export function usePeriodoAnalise(cidade) {
  const mesAtual = useMemo(() => indiceMesAtual(ANO_PAINEL), []);
  const [mesInicial, setMesInicial] = useState(0);
  const [mesFinal, setMesFinal] = useState(mesAtual);

  const indicesPeriodo = useMemo(() => indicesDoPeriodo(mesInicial, mesFinal), [mesInicial, mesFinal]);

  const mediasPorIndicador = useMemo(() => {
    if (!cidade) return [];
    return cidade.indicadores.map((indicador) => ({
      indicador,
      ...calcularMediaIndicador(indicador, indicesPeriodo),
    }));
  }, [cidade, indicesPeriodo]);

  const mediaBaseAtiva = useMemo(() => {
    if (!cidade?.baseAtiva) return null;
    return calcularMediaBaseAtiva(cidade.baseAtiva, indicesPeriodo);
  }, [cidade, indicesPeriodo]);

  /**
   * Ajusta o mês inicial garantindo que nunca fique depois do final — a
   * seleção inválida é bloqueada na origem (a UI também desabilita as
   * opções fora do intervalo), em vez de só validar depois de acontecer.
   */
  function selecionarMesInicial(indice) {
    setMesInicial(indice);
    setMesFinal((atual) => Math.max(atual, indice));
  }

  function selecionarMesFinal(indice) {
    setMesFinal(indice);
    setMesInicial((atual) => Math.min(atual, indice));
  }

  function aplicarPreset(inicio, fim) {
    setMesInicial(inicio);
    setMesFinal(fim);
  }

  return {
    mesInicial,
    mesFinal,
    mesAtual,
    mesesDisponiveis: MESES,
    quantidadeMeses: indicesPeriodo.length,
    mediasPorIndicador,
    mediaBaseAtiva,
    selecionarMesInicial,
    selecionarMesFinal,
    aplicarPreset,
  };
}