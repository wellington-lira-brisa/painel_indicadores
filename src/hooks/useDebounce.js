import { useEffect, useState } from 'react';

/**
 * Devolve `valor` com atraso — só atualiza depois que `valor` parou de
 * mudar por `atrasoMs`. Genérico (não sabe nada sobre feriados/busca);
 * qualquer campo de texto que dispare um filtro caro pode reusar.
 */
export function useDebounce(valor, atrasoMs = 300) {
  const [valorComAtraso, setValorComAtraso] = useState(valor);

  useEffect(() => {
    const temporizador = setTimeout(() => setValorComAtraso(valor), atrasoMs);
    return () => clearTimeout(temporizador);
  }, [valor, atrasoMs]);

  return valorComAtraso;
}