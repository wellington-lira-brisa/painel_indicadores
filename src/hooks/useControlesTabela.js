import { useMemo, useState } from 'react';
import { ANO_PAINEL, MESES } from '../data/mockCidades';
import {
  JANELAS_HISTORICO,
  indiceMesAtual,
  indicesMesesVisiveis,
} from '../utils/tabelaIndicadores';

/**
 * Estado de exibição de uma tabela de indicadores: mostrar/ocultar colunas
 * semanais e limitar quantos meses aparecem. Puramente de apresentação —
 * os dados da cidade já estão carregados; alternar aqui nunca busca nada
 * de novo no backend. Não depende de qual cidade está sendo exibida: o
 * "mês atual" vem do calendário real (ANO_PAINEL + relógio do sistema),
 * não dos dados da cidade.
 */
export function useControlesTabela() {
  const [mostrarSemanas, setMostrarSemanas] = useState(false);
  const [janelaHistorico, setJanelaHistorico] = useState(JANELAS_HISTORICO.TODOS);

  const indiceAtual = useMemo(() => indiceMesAtual(ANO_PAINEL), []);

  const indicesVisiveis = useMemo(
    () => indicesMesesVisiveis(MESES.length, janelaHistorico, indiceAtual),
    [janelaHistorico, indiceAtual],
  );

  return {
    mostrarSemanas,
    alternarSemanas: () => setMostrarSemanas((atual) => !atual),
    janelaHistorico,
    setJanelaHistorico,
    indicesVisiveis,
    indiceMesAtual: indiceAtual,
  };
}