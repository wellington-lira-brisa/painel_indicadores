import { useCallback, useEffect, useState } from 'react';

const CHAVE_LOCALSTORAGE = 'painel-metas:semanas-colapsadas';

function chaveSemana(mesIndice, numeroSemana) {
  return `${mesIndice}:${numeroSemana}`;
}

/** Só preferência de interface (quais colunas de semana estão recolhidas) — nunca dado sensível. */
function carregarColapsosSalvos() {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE);
    const salvo = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(salvo) ? salvo : [];
  } catch {
    return [];
  }
}

/**
 * Estado de colapso de colunas de semana, no estilo "agrupar colunas" do
 * Google Sheets: cada semana guarda seu próprio estado (recolhida ou não);
 * recolher/expandir um mês é uma ação derivada que aplica o mesmo valor a
 * todas as semanas daquele mês de uma vez — não existe um estado de "mês"
 * separado para sincronizar. Persistido em localStorage (só preferência de
 * UI); a mesma preferência vale pra qualquer cidade, já que semanas e meses
 * são a mesma estrutura de calendário em todas as tabelas.
 */
export function useColapsoSemanas() {
  const [colapsadas, setColapsadas] = useState(() => new Set(carregarColapsosSalvos()));

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify([...colapsadas]));
    } catch {
      // preferência de UI — perder isso (quota cheia, modo privado etc.) não é grave.
    }
  }, [colapsadas]);

  const semanaColapsada = useCallback(
    (mesIndice, numeroSemana) => colapsadas.has(chaveSemana(mesIndice, numeroSemana)),
    [colapsadas],
  );

  const alternarSemana = useCallback((mesIndice, numeroSemana) => {
    const chave = chaveSemana(mesIndice, numeroSemana);
    setColapsadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }, []);

  const mesEstaTotalmenteColapsado = useCallback(
    (mesIndice, semanas) => semanas.every((semana) => colapsadas.has(chaveSemana(mesIndice, semana.numero))),
    [colapsadas],
  );

  const alternarMes = useCallback((mesIndice, semanas) => {
    setColapsadas((atual) => {
      const estaTudoColapsado = semanas.every((semana) => atual.has(chaveSemana(mesIndice, semana.numero)));
      const proximo = new Set(atual);
      semanas.forEach((semana) => {
        const chave = chaveSemana(mesIndice, semana.numero);
        if (estaTudoColapsado) proximo.delete(chave);
        else proximo.add(chave);
      });
      return proximo;
    });
  }, []);

  return { semanaColapsada, alternarSemana, mesEstaTotalmenteColapsado, alternarMes };
}