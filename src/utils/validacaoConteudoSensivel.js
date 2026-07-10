/**
 * Detecção de dados sensíveis em texto livre. Centralizado aqui porque o
 * requisito é explícito: a mesma checagem deve poder ser reutilizada em
 * qualquer formulário futuro (planos de ação hoje, outros amanhã).
 *
 * Isto é uma barreira de UX, não a barreira de segurança real — o padrão
 * já usado no resto do projeto (RLS/Edge Function como fronteira de
 * verdade) também vale aqui: a migration `bloquear_dados_sensiveis_plano`
 * repete uma versão mais simples destas checagens direto no Postgres,
 * como defesa em profundidade caso alguém grave via SQL direto ou
 * contornando o client.
 *
 * ARQUITETURA — registro de regras, não uma pilha de `if`s soltos:
 * cada tipo de dado sensível é uma REGRA independente (função pura que
 * recebe o texto já normalizado e devolve true/false). `detectarConteudoSensivel`
 * só percorre o array `REGRAS` e coleta os tipos cuja regra deu positivo.
 *
 * Isso resolve o motivo raiz do RG passando batido: a validação antiga
 * dependia de UM par regex+palavra-chave escrito à mão por tipo, cada um
 * com suas próprias armadilhas (`\bRG\b` não casa "RG12345678" porque não
 * há fronteira de palavra entre "G" e "1"; só "RG"/"identidade" eram
 * reconhecidos como rótulo, então "documento de identidade", "CIN",
 * "carteira de identidade" escapavam). Não era um bug num tipo só — era a
 * abordagem (regra ad-hoc, sem estrutura comum) que deixava esse tipo de
 * buraco fácil de introduzir e difícil de auditar tipo a tipo.
 *
 * Para adicionar um novo tipo de dado sensível no futuro:
 *   1. Adicione o rótulo em `TIPOS`.
 *   2. Escreva uma função `regraXxx(ctx) => boolean`.
 *   3. Empurre `{ tipo: TIPOS.XXX, testar: regraXxx }` no array `REGRAS`.
 * Nenhum outro lugar deste arquivo (ou dos chamadores) precisa mudar.
 */

const TIPOS = {
  CPF: 'CPF',
  RG: 'RG',
  CNH: 'CNH',
  PASSAPORTE: 'Passaporte',
  TITULO_ELEITOR: 'Título de Eleitor',
  PIS_PASEP: 'PIS/PASEP',
  CTPS: 'Carteira de Trabalho (CTPS)',
  CARTAO_CREDITO: 'Número de cartão de crédito/débito',
  DADOS_BANCARIOS: 'Dados bancários (agência/conta/PIX)',
  SENHA: 'Senha',
  TOKEN_OU_CHAVE_API: 'Token ou chave de API',
  EMAIL: 'E-mail',
  TELEFONE: 'Telefone',
  ENDERECO: 'Endereço residencial',
  DATA_NASCIMENTO: 'Data de nascimento',
  INFORMACAO_SIGILOSA: 'Informação sigilosa ou credencial',
};

// --- Normalização --------------------------------------------------------
// Duas visões do mesmo texto: `bruto` (preserva caixa e pontuação — é o
// que os regex de FORMATO usam pra achar o número em si) e `contexto`
// (minúsculo, sem acento — é o que as buscas de PALAVRA-CHAVE usam, pra
// "Título de Eleitor", "TÍTULO DE ELEITOR" e "titulo eleitoral" caírem na
// mesma checagem sem repetir variação de acento/caixa em cada regra).
function normalizarContexto(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function criarContexto(textoBruto) {
  const bruto = String(textoBruto ?? '');
  return {
    bruto,
    contexto: normalizarContexto(bruto),
  };
}

/** true se algum dos padrões (string ou regex) aparecer no texto de contexto. */
function contemAlgum(ctx, padroes) {
  return padroes.some((padrao) => (padrao instanceof RegExp ? padrao.test(ctx.contexto) : ctx.contexto.includes(padrao)));
}

function encontrarTodos(regex, texto) {
  return [...texto.matchAll(regex)].map((m) => m[0]);
}

// --- Validadores de dígito verificador -----------------------------------
// Onde existe checksum oficial (CPF, PIS/PASEP, cartão via Luhn), ele é
// preferido a depender de rótulo no texto: um número que bate o checksum é
// sensível mesmo sem a palavra "CPF" por perto, e reduz falso positivo em
// sequências de dígitos que só coincidem em tamanho.

function cpfValido(digitos) {
  if (!/^\d{11}$/.test(digitos)) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false; // 000.000.000-00, 111.111.111-11 etc.

  function digitoVerificador(base) {
    let soma = 0;
    let peso = base.length + 1;
    for (const char of base) {
      soma += Number(char) * peso;
      peso -= 1;
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  }

  const d1 = digitoVerificador(digitos.slice(0, 9));
  const d2 = digitoVerificador(digitos.slice(0, 9) + d1);
  return digitos === digitos.slice(0, 9) + String(d1) + String(d2);
}

/** Algoritmo de Luhn — reduz falso positivo de números de 13-19 dígitos que não são cartão. */
function passaNoLuhn(digitos) {
  let soma = 0;
  let alternar = false;
  for (let i = digitos.length - 1; i >= 0; i -= 1) {
    let d = Number(digitos[i]);
    if (alternar) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
    alternar = !alternar;
  }
  return soma % 10 === 0;
}

/** PIS/PASEP/NIS/NIT usam o mesmo algoritmo e o mesmo espaço numérico — pesos 3,2,9,8,7,6,5,4,3,2. */
function pisPasepValido(digitos) {
  if (!/^\d{11}$/.test(digitos)) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = pesos.reduce((acc, peso, i) => acc + Number(digitos[i]) * peso, 0);
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return Number(digitos[10]) === dv;
}

// --- Regras ---------------------------------------------------------------
// Cada regra recebe `ctx` (ver `criarContexto`) e devolve true/false.
// Regras com checksum oficial não exigem palavra de contexto (o número por
// si só já é uma identificação forte). Regras sem checksum nacional (RG,
// CNH, título de eleitor, CTPS) exigem uma palavra de contexto — sem isso,
// qualquer sequência de 8-11 dígitos formatados seria sinalizada, o que
// inviabilizaria o formulário (falso positivo em qualquer código interno,
// número de protocolo etc.).

function regraCpf(ctx) {
  return encontrarTodos(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}-?\s?\d{2}\b/g, ctx.bruto).some((trecho) =>
    cpfValido(trecho.replace(/\D/g, '')),
  );
}

function regraRg(ctx) {
  // \bRG\b exige fronteira de palavra nos dois lados — "RG12345678" (rótulo
  // colado no número, sem espaço/pontuação) não tem fronteira depois do
  // "G", então escapava antes. Reconhecer "RG" também colado a dígito ou
  // pontuação, além de variações de "identidade", fecha esse buraco.
  const temRotulo =
    /\brg\b/i.test(ctx.bruto) ||
    /\bidentidade\b/.test(ctx.contexto) ||
    /\brg[:\s.-]?\d/i.test(ctx.bruto) ||
    contemAlgum(ctx, ['cin ', 'doc. de identidade', 'documento de identidade', 'carteira de identidade']);
  if (!temRotulo) return false;
  // Sem \b no início: quando o rótulo está colado no número ("RG12345678"),
  // não há fronteira de palavra entre a letra e o dígito — já estamos
  // dentro do `if (!temRotulo)` acima, então essa checagem já está restrita
  // a texto que contém "RG"/"identidade" em algum lugar, o risco de falso
  // positivo por remover o \b inicial é baixo.
  return /\d{1,2}[.\s]?\d{3}[.\s]?\d{3}[-\s]?[\dXx]\b/.test(ctx.bruto);
}

function regraCnh(ctx) {
  const temRotulo = contemAlgum(ctx, ['cnh', 'carteira de habilitacao', 'carteira nacional de habilitacao', 'habilitacao']);
  if (!temRotulo) return false;
  // Extrai sequências de dígitos (ignorando pontuação) em vez de usar \b:
  // com o rótulo colado ("CNH12345678901"), não há fronteira de palavra
  // entre a letra e o dígito, o mesmo problema já corrigido no RG.
  const sequenciasDeDigitos = ctx.bruto.match(/\d[\d.\s-]*\d|\d/g) ?? [];
  return sequenciasDeDigitos.some((seq) => seq.replace(/\D/g, '').length === 11);
}

function regraPassaporte(ctx) {
  const temRotulo = contemAlgum(ctx, ['passaporte', 'passport']);
  if (!temRotulo) return false;
  // Formato brasileiro atual: 2 letras + 6 dígitos (ex.: FZ123456).
  return /\b[A-Za-z]{2}\s?-?\d{6}\b/.test(ctx.bruto);
}

function regraTituloEleitor(ctx) {
  const temRotulo = contemAlgum(ctx, ['titulo de eleitor', 'titulo eleitoral', 'zona eleitoral', 'secao eleitoral']);
  if (!temRotulo) return false;
  return /\b\d{4}[.\s]?\d{4}[.\s]?\d{4}\b/.test(ctx.bruto);
}

function regraPisPasep(ctx) {
  // Tem checksum oficial — não depende de rótulo, mesma lógica do CPF.
  return encontrarTodos(/\b\d{3}[.\s]?\d{5}[.\s]?\d{2}-?\s?\d\b/g, ctx.bruto).some((trecho) =>
    pisPasepValido(trecho.replace(/\D/g, '')),
  );
}

function regraCtps(ctx) {
  const temRotulo = contemAlgum(ctx, ['ctps', 'carteira de trabalho']);
  if (!temRotulo) return false;
  return /\b\d{5,8}[-\s/]?\d{0,4}\b/.test(ctx.bruto);
}

function regraCartao(ctx) {
  return encontrarTodos(/\b(?:\d[ -]?){13,19}\b/g, ctx.bruto).some((trecho) => {
    const digitos = trecho.replace(/\D/g, '');
    return digitos.length >= 13 && digitos.length <= 19 && passaNoLuhn(digitos);
  });
}

function regraDadosBancarios(ctx) {
  return contemAlgum(ctx, [
    /\bagencia\b/,
    /\bconta[\s-]?corrente\b/,
    /\bconta[\s-]?poupanca\b/,
    /\biban\b/,
    /\bchave\s+pix\b/,
  ]);
}

/** Chave PIX aleatória: UUID v4 — o único formato de chave PIX que não é, por si, CPF/telefone/e-mail (esses já caem nas próprias regras). */
function regraPix(ctx) {
  if (!contemAlgum(ctx, ['pix'])) return false;
  return /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(ctx.bruto);
}

function regraSenha(ctx) {
  return /\b(senha|password|passwd)\s*[:=]\s*\S+/i.test(ctx.bruto);
}

function regraToken(ctx) {
  const rotulo = /\b(token|api[\s_-]?key|chave\s+de\s+api|bearer|secret|client[\s_-]?secret)\s*[:=]\s*\S+/i;
  const formato = /\bsk-[A-Za-z0-9]{16,}\b|\bghp_[A-Za-z0-9]{20,}\b|\bAIza[0-9A-Za-z_-]{20,}\b|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/;
  return rotulo.test(ctx.bruto) || formato.test(ctx.bruto);
}

function regraEmail(ctx) {
  return /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(ctx.bruto);
}

function regraTelefone(ctx) {
  // Com DDD (fixo ou celular), com/sem +55, com/sem parênteses e hífen —
  // formato forte o suficiente pra não precisar de rótulo.
  if (/\b(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/.test(ctx.bruto)) return true;
  // Sem DDD (só 8-9 dígitos com hífen) é ambíguo com nº de protocolo/pedido
  // — só conta como telefone com uma palavra de contexto por perto.
  const temRotulo = contemAlgum(ctx, ['telefone', 'celular', 'whatsapp', 'contato', 'ligar para']);
  return temRotulo && /\b9?\d{4}-\d{4}\b/.test(ctx.bruto);
}

function regraEndereco(ctx) {
  // CEP só é sensível "quando fizer parte de um endereço" (pedido
  // explícito) — por isso exige uma palavra de endereço por perto, não
  // dispara sozinho, pra não travar uma menção solta a uma faixa de CEP
  // que não identifica ninguém.
  const cepComContexto =
    /\b\d{5}-?\d{3}\b/.test(ctx.bruto) &&
    contemAlgum(ctx, ['cep', 'endereco', 'rua ', 'av.', 'avenida', 'bairro', 'logradouro']);

  // Logradouro + número: "Rua Tal, 123" — exige um número depois do nome
  // da via pra não pegar frases como "iremos até a rua verificar o poste".
  const logradouroComNumero = /\b(rua|avenida|av\.?|alameda|travessa|rodovia|estrada)\s+[^\n,]{3,50},?\s*n?[ºo°]?\s*\d{1,6}\b/i.test(
    ctx.bruto,
  );

  return cepComContexto || logradouroComNumero;
}

function regraDataNascimento(ctx) {
  const temRotulo = contemAlgum(ctx, ['data de nascimento', 'nascido em', 'nascida em', 'nasceu em', 'data de nasc']);
  if (!temRotulo) return false;
  return /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/.test(ctx.bruto);
}

/** Registro de regras — adicionar um tipo novo é adicionar uma linha aqui. */
const REGRAS = [
  { tipo: TIPOS.CPF, testar: regraCpf },
  { tipo: TIPOS.RG, testar: regraRg },
  { tipo: TIPOS.CNH, testar: regraCnh },
  { tipo: TIPOS.PASSAPORTE, testar: regraPassaporte },
  { tipo: TIPOS.TITULO_ELEITOR, testar: regraTituloEleitor },
  { tipo: TIPOS.PIS_PASEP, testar: regraPisPasep },
  { tipo: TIPOS.CTPS, testar: regraCtps },
  { tipo: TIPOS.CARTAO_CREDITO, testar: regraCartao },
  { tipo: TIPOS.DADOS_BANCARIOS, testar: regraDadosBancarios },
  { tipo: TIPOS.DADOS_BANCARIOS, testar: regraPix },
  { tipo: TIPOS.SENHA, testar: regraSenha },
  { tipo: TIPOS.TOKEN_OU_CHAVE_API, testar: regraToken },
  { tipo: TIPOS.EMAIL, testar: regraEmail },
  { tipo: TIPOS.TELEFONE, testar: regraTelefone },
  { tipo: TIPOS.ENDERECO, testar: regraEndereco },
  { tipo: TIPOS.DATA_NASCIMENTO, testar: regraDataNascimento },
];

/**
 * Roda todas as regras sobre um texto e retorna os tipos encontrados.
 * Não devolve o trecho capturado no resultado — motivo de bloqueio já
 * basta pra UI, sem precisar ecoar o dado sensível de volta.
 *
 * O retorno (lista de tipos) é útil para logs/telemetria e para os testes
 * deste módulo — nunca deve ser exibido ao usuário como está: a mensagem
 * voltada pro usuário (`mensagemBloqueioSensivel`) é deliberadamente
 * genérica, ver comentário na função.
 */
export function detectarConteudoSensivel(textoBruto) {
  const texto = String(textoBruto ?? '');
  if (!texto.trim()) return [];

  const ctx = criarContexto(texto);
  const tiposEncontrados = new Set();
  REGRAS.forEach(({ tipo, testar }) => {
    if (testar(ctx)) tiposEncontrados.add(tipo);
  });
  return [...tiposEncontrados];
}

/**
 * Valida um conjunto de campos { rotulo: texto } de uma vez.
 * @returns {{ valido: boolean, ocorrencias: { rotulo: string, tipos: string[] }[] }}
 */
export function validarCamposSensiveis(campos) {
  const ocorrencias = Object.entries(campos)
    .map(([rotulo, texto]) => ({ rotulo, tipos: detectarConteudoSensivel(texto) }))
    .filter((item) => item.tipos.length > 0);

  return { valido: ocorrencias.length === 0, ocorrencias };
}

/**
 * Mensagem pronta pra exibir ao usuário quando a validação falha.
 * Deliberadamente genérica: cita os campos afetados (o usuário precisa
 * saber ONDE corrigir), mas nunca o tipo de dado detectado (CPF, RG,
 * cartão...) — expor o tipo ensina exatamente o que o filtro procura,
 * facilitando contornar a checagem no próximo texto.
 */
export function mensagemBloqueioSensivel(ocorrencias) {
  const rotulos = ocorrencias.map((o) => o.rotulo);
  const campos = rotulos.length === 1 ? `no campo "${rotulos[0]}"` : `nos campos ${rotulos.map((r) => `"${r}"`).join(', ')}`;
  return `O Plano de Ação não permite a inclusão de dados pessoais ou sensíveis (${campos}). Edite o conteúdo e tente novamente.`;
}

export { TIPOS as TIPOS_DADO_SENSIVEL };