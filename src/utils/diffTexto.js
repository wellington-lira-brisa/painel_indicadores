/**
 * Diff palavra a palavra entre dois textos — a mesma ideia de "diff de
 * versionamento" pedida pro histórico, só que de verdade: compara o
 * conteúdo inteiro (LCS), não um prefixo truncado independente de cada
 * lado. Um truncamento por lado (`antes.slice(0,220)` vs
 * `depois.slice(0,220)`) escondia qualquer mudança que ficasse depois do
 * corte — os dois prefixos pareciam iguais mesmo quando o texto não era.
 */

// LCS é O(n·m) em tokens — para textos de até ~2000 tokens de cada lado
// (bem acima do que os campos do plano permitem hoje: como ≤4000 chars,
// descrição legada ≤8000 chars) roda em milissegundos. Acima disso, cai
// pro fallback abaixo em vez de arriscar travar a UI.
const LIMITE_OPERACOES_DIFF = 4_000_000;

function tokenizar(texto) {
  // Mantém os espaços como tokens próprios — reconstrói o texto original
  // exatamente ao concatenar os tokens de volta.
  return String(texto ?? '')
    .split(/(\s+)/)
    .filter((token) => token.length > 0);
}

function empilhar(partes, tipo, texto) {
  const ultima = partes[partes.length - 1];
  if (ultima && ultima.tipo === tipo) {
    ultima.texto += texto;
  } else {
    partes.push({ tipo, texto });
  }
}

/**
 * @returns {{ tipo: 'igual' | 'removido' | 'adicionado', texto: string }[]}
 */
export function diffTexto(antes, depois) {
  const a = tokenizar(antes);
  const b = tokenizar(depois);
  const n = a.length;
  const m = b.length;

  if (n * m > LIMITE_OPERACOES_DIFF) {
    // Textos grandes demais pra comparar token a token com segurança —
    // melhor mostrar "tudo saiu, tudo entrou" do que travar o navegador.
    const partes = [];
    if (antes) partes.push({ tipo: 'removido', texto: String(antes) });
    if (depois) partes.push({ tipo: 'adicionado', texto: String(depois) });
    return partes;
  }

  // Tabela de LCS construída de trás pra frente, pra dar pra reconstruir
  // o caminho ótimo andando de (0,0) até (n,m) sem precisar de recursão.
  const largura = m + 1;
  const dp = new Uint32Array((n + 1) * largura);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const indiceAtual = i * largura + j;
      if (a[i] === b[j]) {
        dp[indiceAtual] = dp[(i + 1) * largura + (j + 1)] + 1;
      } else {
        const semA = dp[(i + 1) * largura + j];
        const semB = dp[i * largura + (j + 1)];
        dp[indiceAtual] = semA >= semB ? semA : semB;
      }
    }
  }

  const partes = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      empilhar(partes, 'igual', a[i]);
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * largura + j] >= dp[i * largura + (j + 1)]) {
      empilhar(partes, 'removido', a[i]);
      i += 1;
    } else {
      empilhar(partes, 'adicionado', b[j]);
      j += 1;
    }
  }
  while (i < n) {
    empilhar(partes, 'removido', a[i]);
    i += 1;
  }
  while (j < m) {
    empilhar(partes, 'adicionado', b[j]);
    j += 1;
  }

  return partes;
}

const CONTEXTO_IGUAL = 60;

/**
 * Encurta trechos "iguais" longos pro meio (mantém as pontas), igual ao
 * `git diff` mostrando só linhas de contexto perto da mudança — sem isso,
 * um parágrafo idêntico de 2000 caracteres empurraria a mudança de 3
 * palavras pra fora da tela.
 */
function colapsarTrechosIguais(partes) {
  const limite = CONTEXTO_IGUAL * 2 + 10;
  return partes.map((parte) => {
    if (parte.tipo !== 'igual' || parte.texto.length <= limite) return parte;
    const inicio = parte.texto.slice(0, CONTEXTO_IGUAL).trimEnd();
    const fim = parte.texto.slice(-CONTEXTO_IGUAL).trimStart();
    return { tipo: 'igual', texto: `${inicio} … ${fim}` };
  });
}

/** Diff pronto pra exibição na timeline: calcula e já aplica o colapso de trechos iguais longos. */
export function diffTextoParaExibicao(antes, depois) {
  return colapsarTrechosIguais(diffTexto(antes ?? '', depois ?? ''));
}