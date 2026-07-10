import { useEffect, useState } from 'react';

/**
 * Controla montagem/desmontagem de elementos animados via transições CSS,
 * evitando que o elemento seja removido do DOM antes da transição de
 * saída terminar (o problema clássico de animar `condicional && <div>`).
 *
 * Uso: só renderizar o elemento quando `montado` for true; alternar as
 * classes de transição (opacity/scale/etc.) com `visivel`.
 *
 * @param {boolean} condicao - true para abrir/mostrar, false para fechar/ocultar.
 * @param {number} duracaoMs - duração da transição CSS; deve bater com a
 *   classe `duration-*` usada no elemento.
 */
export function useMontagemAnimada(condicao, duracaoMs = 150) {
  const [montado, setMontado] = useState(condicao);
  const [visivel, setVisivel] = useState(condicao);

  useEffect(() => {
    let quadro;
    let temporizador;

    if (condicao) {
      setMontado(true);
      // Monta primeiro com as classes "fechadas", depois troca para
      // "abertas" no próximo frame — só assim o navegador anima a
      // transição em vez de renderizar direto no estado final.
      quadro = requestAnimationFrame(() => setVisivel(true));
    } else {
      setVisivel(false);
      temporizador = setTimeout(() => setMontado(false), duracaoMs);
    }

    return () => {
      if (quadro) cancelAnimationFrame(quadro);
      if (temporizador) clearTimeout(temporizador);
    };
  }, [condicao, duracaoMs]);

  return { montado, visivel };
}
