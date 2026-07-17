// ETL da base real de vendas (FTTH/5G) -> tabela indicadores_realizados.
//
// Este arquivo é intencionalmente livre de I/O (sem fetch, sem fs, sem
// Supabase): recebe texto/objetos, devolve objetos. Isso é o que permite
// testar validação e normalização com `node --test` sem precisar de rede
// nem de credenciais (ver __tests__/lib.test.mjs).

export const COLUNAS_OBRIGATORIAS = [
  'mes_ref',
  'mes_semana',
  'semana_mes',
  'primeiro_dia_semana',
  'ultimo_dia_semana',
  'dias_uteis_mes',
  'dias_uteis_semana',
  'dias_trab_semana',
  'cidade',
  'servico',
  'canal_geral',
  'status_venda',
  'origem',
  'realizado_semana',
  'realizado_mes',
];

// Único mapeamento servico+status_venda -> (tecnologia, indicador) que a
// base oficial hoje sustenta (ver RELATORIO.md, seção 5). Qualquer
// combinação fora daqui é uma linha "não reconhecida": a validação falha
// o workflow em vez de publicar um indicador inventado.
export const MAPA_INDICADOR = {
  '5G|Assinado': { tecnologia: '5g', indicadorId: 'ativacao' },
  'INTERNET|Criado': { tecnologia: 'ftth', indicadorId: 'orcamento' },
  'INTERNET|Efetivado': { tecnologia: 'ftth', indicadorId: 'efetivado' },
  'INTERNET|Instalado': { tecnologia: 'ftth', indicadorId: 'instalacao' },
};

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const VALOR_NAO_MAPEADO = 'NÃO MAPEADO';

/**
 * O export em produção usa `decimal=","` (padrão BR/Spark) — "3,5" deve
 * virar 3.5, não NaN. Só troca vírgula por ponto quando não há ponto já
 * presente (evita quebrar um valor que por algum motivo já viesse com
 * ponto decimal).
 */
function paraNumero(texto) {
  if (typeof texto !== 'string') return Number(texto);
  const normalizado = texto.includes(',') && !texto.includes('.') ? texto.replace(',', '.') : texto;
  return Number(normalizado);
}

/** Descobre o separador olhando só a primeira linha (cabeçalho): conta ocorrências de cada candidato e usa o mais frequente. Cobre vírgula (padrão RFC4180), ponto e vírgula (comum em export BR, já que "," é separador decimal) e tab. */
function detectarSeparador(primeiraLinha) {
  const candidatos = [',', ';', '\t'];
  let melhor = ',';
  let maiorContagem = 0;
  for (const c of candidatos) {
    const contagem = primeiraLinha.split(c).length - 1;
    if (contagem > maiorContagem) { maiorContagem = contagem; melhor = c; }
  }
  return melhor;
}

/** Parser CSV mínimo (RFC4180: aspas duplas e vírgula/quebra de linha dentro de campo), com separador auto-detectado. */
export function parsearCsv(texto) {
  const linhas = [];
  let campo = '';
  let linha = [];
  let dentroDeAspas = false;
  const s = texto.replace(/\r\n/g, '\n');
  const primeiraQuebra = s.indexOf('\n');
  const separador = detectarSeparador(primeiraQuebra === -1 ? s : s.slice(0, primeiraQuebra));

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; } else { dentroDeAspas = false; }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') { dentroDeAspas = true; continue; }
    if (c === separador) { linha.push(campo); campo = ''; continue; }
    if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; continue; }
    campo += c;
  }
  if (campo.length > 0 || linha.length > 0) { linha.push(campo); linhas.push(linha); }

  const linhasNaoVazias = linhas.filter((l) => !(l.length === 1 && l[0] === ''));
  if (linhasNaoVazias.length === 0) return [];

  const cabecalho = linhasNaoVazias[0];
  return linhasNaoVazias.slice(1).map((valores, indice) => {
    const obj = { _linha: indice + 2 }; // +2 = 1 pelo header, 1 por índice 1-based
    cabecalho.forEach((coluna, i) => { obj[coluna.trim()] = (valores[i] ?? '').trim(); });
    return obj;
  });
}

function slugificar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * "ARARIPINA / PE" -> "araripina-pe". Devolve null se não der pra separar
 * cidade e UF (formato inesperado) — quem chama decide o que fazer (hoje:
 * publica com cidade_slug null, nunca inventa uma cidade).
 */
export function normalizarCidade(cidadeBruta) {
  if (!cidadeBruta || !cidadeBruta.trim()) return null;
  const partes = cidadeBruta.split('/');
  if (partes.length !== 2) return null;
  const [nome, uf] = partes.map((p) => p.trim());
  if (!nome || uf.length !== 2) return null;
  return `${slugificar(nome)}-${slugificar(uf)}`;
}

/**
 * Valida a base crua (linhas já parseadas do CSV, ainda como strings).
 * Devolve { erros, avisos }. `erros` não vazio = workflow deve falhar e
 * preservar a última versão publicada (ver publicar.mjs).
 */
export function validar(linhas) {
  const erros = [];
  const avisos = [];

  if (linhas.length === 0) {
    erros.push('Base vazia ou ilegível.');
    return { erros, avisos };
  }

  const colunasPresentes = new Set(Object.keys(linhas[0]));
  for (const coluna of COLUNAS_OBRIGATORIAS) {
    if (!colunasPresentes.has(coluna)) erros.push(`Coluna obrigatória ausente: ${coluna}`);
  }
  if (erros.length > 0) return { erros, avisos }; // sem colunas, não faz sentido validar linha a linha

  const VOLUME_MINIMO_ESPERADO = 100;
  if (linhas.length < VOLUME_MINIMO_ESPERADO) {
    erros.push(`Volume de linhas abaixo do mínimo esperado (${linhas.length} < ${VOLUME_MINIMO_ESPERADO}).`);
  }

  const combinacoesConhecidas = new Set(Object.keys(MAPA_INDICADOR));
  const vistos = new Set(); // dedupe: linha inteira repetida
  const totalPorGrupoSemana = new Map(); // soma de realizado_semana por (mes,cidade,servico,status,canal,origem)
  const totalMensalPorGrupo = new Map(); // realizado_mes declarado por grupo

  let temFtth = false;
  let temCincoG = false;

  for (const l of linhas) {
    const idLinha = `linha ${l._linha}`;

    // nulos em colunas obrigatórias (cidade é a única que pode ser vazia — vira aviso, não erro)
    for (const coluna of COLUNAS_OBRIGATORIAS) {
      if (coluna === 'cidade') continue;
      if (l[coluna] === '' || l[coluna] === undefined) {
        erros.push(`${idLinha}: valor ausente na coluna "${coluna}".`);
      }
    }
    if (!l.cidade) avisos.push(`${idLinha}: cidade não informada.`);

    // datas
    if (!REGEX_DATA.test(l.mes_ref)) erros.push(`${idLinha}: mes_ref inválida ("${l.mes_ref}").`);
    if (!REGEX_DATA.test(l.primeiro_dia_semana)) erros.push(`${idLinha}: primeiro_dia_semana inválida.`);
    if (!REGEX_DATA.test(l.ultimo_dia_semana)) erros.push(`${idLinha}: ultimo_dia_semana inválida.`);
    if (REGEX_DATA.test(l.primeiro_dia_semana) && REGEX_DATA.test(l.ultimo_dia_semana)) {
      if (l.primeiro_dia_semana > l.ultimo_dia_semana) {
        erros.push(`${idLinha}: primeiro_dia_semana posterior a ultimo_dia_semana.`);
      }
    }

    // combinação servico+status conhecida
    const chave = `${l.servico}|${l.status_venda}`;
    if (!combinacoesConhecidas.has(chave)) {
      erros.push(`${idLinha}: combinação servico/status_venda não reconhecida ("${chave}").`);
    } else if (chave.startsWith('INTERNET')) {
      temFtth = true;
    } else {
      temCincoG = true;
    }

    // numéricos e negativos
    const semana = paraNumero(l.realizado_semana);
    const mensal = paraNumero(l.realizado_mes);
    if (l.realizado_semana === '' || Number.isNaN(semana)) {
      erros.push(`${idLinha}: realizado_semana não é numérico ("${l.realizado_semana}").`);
    } else if (semana < 0) {
      erros.push(`${idLinha}: realizado_semana negativo (${semana}).`);
    }
    if (l.realizado_mes === '' || Number.isNaN(mensal)) {
      erros.push(`${idLinha}: realizado_mes não é numérico ("${l.realizado_mes}").`);
    } else if (mensal < 0) {
      erros.push(`${idLinha}: realizado_mes negativo (${mensal}).`);
    }

    // duplicidade exata de linha
    const assinatura = COLUNAS_OBRIGATORIAS.map((c) => l[c]).join('\u0001');
    if (vistos.has(assinatura)) {
      erros.push(`${idLinha}: linha duplicada.`);
    }
    vistos.add(assinatura);

    // divergência semana x mês (soma das semanas do mesmo grupo bate com realizado_mes?)
    const grupo = [l.mes_ref, l.cidade, l.servico, l.status_venda, l.canal_geral, l.origem].join('\u0001');
    if (!Number.isNaN(semana)) {
      totalPorGrupoSemana.set(grupo, (totalPorGrupoSemana.get(grupo) ?? 0) + semana);
    }
    if (!Number.isNaN(mensal)) {
      if (totalMensalPorGrupo.has(grupo) && totalMensalPorGrupo.get(grupo) !== mensal) {
        erros.push(`${idLinha}: realizado_mes divergente entre semanas do mesmo grupo ("${l.cidade}", ${l.servico}/${l.status_venda}).`);
      }
      totalMensalPorGrupo.set(grupo, mensal);
    }
  }

  for (const [grupo, somaSemanas] of totalPorGrupoSemana) {
    const declarado = totalMensalPorGrupo.get(grupo);
    if (declarado !== undefined && Math.abs(somaSemanas - declarado) > 0.01) {
      const [mesRef, cidade, servico, status] = grupo.split('\u0001');
      erros.push(
        `Soma semanal (${somaSemanas}) diverge de realizado_mes (${declarado}) para ${cidade || '(sem cidade)'} / ${servico}/${status} em ${mesRef}.`,
      );
    }
  }

  if (!temFtth) erros.push('Base não contém nenhum dado de FTTH (servico=INTERNET).');
  if (!temCincoG) erros.push('Base não contém nenhum dado de 5G (servico=5G).');

  return { erros, avisos };
}

/**
 * Agrega linhas cruas (já validadas) em registros prontos pra
 * indicadores_realizados: soma canal_geral/origem, gera uma linha mensal
 * (semana_mes null) e uma por semana. Assume `validar()` sem erros —
 * chamar sem validar antes é erro do chamador, não algo que este código
 * deva adivinhar.
 */
export function normalizar(linhas) {
  const mensal = new Map(); // chave -> { cidadeOrigem, cidadeSlug, tecnologia, indicadorId, mesRef, valor }
  const semanal = new Map(); // chave -> idem + semanaMes

  for (const l of linhas) {
    const mapa = MAPA_INDICADOR[`${l.servico}|${l.status_venda}`];
    if (!mapa) continue; // já reportado por validar(); normalizar() não republica erro

    const cidadeSlug = normalizarCidade(l.cidade);
    const cidadeChaveAgrupamento = cidadeSlug ?? `__bruta__${l.cidade}`;

    const chaveMensal = [cidadeChaveAgrupamento, mapa.tecnologia, mapa.indicadorId, l.mes_ref].join('\u0001');
    if (!mensal.has(chaveMensal)) {
      mensal.set(chaveMensal, {
        cidadeOrigem: l.cidade,
        cidadeSlug,
        tecnologia: mapa.tecnologia,
        indicadorId: mapa.indicadorId,
        mesRef: l.mes_ref,
        semanaMes: null,
        valor: 0,
      });
    }

    const chaveSemanal = [cidadeChaveAgrupamento, mapa.tecnologia, mapa.indicadorId, l.mes_ref, l.semana_mes].join('\u0001');
    if (!semanal.has(chaveSemanal)) {
      semanal.set(chaveSemanal, {
        cidadeOrigem: l.cidade,
        cidadeSlug,
        tecnologia: mapa.tecnologia,
        indicadorId: mapa.indicadorId,
        mesRef: l.mes_ref,
        semanaMes: Number(l.semana_mes),
        // datas REAIS da semana, direto da base (não os blocos fixos de 7
        // dias que o app usa pra semana fictícia — ver utils/semanas.js).
        // É isso que corrige o rótulo errado da coluna de semana no front.
        primeiroDiaSemana: l.primeiro_dia_semana,
        ultimoDiaSemana: l.ultimo_dia_semana,
        valor: 0,
      });
    }

    // realizado_mes é repetido em toda linha-semana do mesmo grupo (verificado
    // na validação), então soma-lo por canal aqui (não por linha) evita
    // multiplicar o mensal pelo número de semanas do mês.
    const chaveCanalMensal = chaveMensal + '\u0001' + l.canal_geral + '\u0001' + l.origem;
    if (!mensal.get(chaveMensal)._canaisSomados) mensal.get(chaveMensal)._canaisSomados = new Set();
    const registroMensal = mensal.get(chaveMensal);
    if (!registroMensal._canaisSomados.has(l.canal_geral + '\u0001' + l.origem)) {
      registroMensal._canaisSomados.add(l.canal_geral + '\u0001' + l.origem);
      registroMensal.valor += paraNumero(l.realizado_mes);
    }

    semanal.get(chaveSemanal).valor += paraNumero(l.realizado_semana);
  }

  const limpar = (r) => { const { _canaisSomados, ...resto } = r; return resto; };
  return [...mensal.values()].map(limpar).concat([...semanal.values()].map(limpar));
}

/**
 * Mesma agregação de `normalizar()`, mas SEM somar canal_geral — usada só
 * pra gerar o arquivo separado que alimenta o filtro de canal
 * (`indicadores-realizados-por-canal.csv`). Arquivo à parte, não uma
 * coluna a mais no arquivo principal, porque o caso comum (sem filtro de
 * canal) não deve pagar o custo de um arquivo ~40x maior — ver
 * `indicadorRealizadoService.js`, que só busca este aqui quando o filtro
 * de canal é usado.
 *
 * O dedup de `realizado_mes` (repetido em toda linha-semana do mesmo mês)
 * agora é por "canal + origem" dentro da CHAVE MENSAL (que já inclui
 * canal) — antes era isso mesmo, só que dentro de uma chave que somava
 * todos os canais juntos; aqui cada canal fica com sua própria linha.
 */
export function normalizarPorCanal(linhas) {
  const mensal = new Map();
  const semanal = new Map();

  for (const l of linhas) {
    const mapa = MAPA_INDICADOR[`${l.servico}|${l.status_venda}`];
    if (!mapa) continue;

    const cidadeSlug = normalizarCidade(l.cidade);
    const cidadeChaveAgrupamento = cidadeSlug ?? `__bruta__${l.cidade}`;
    const canal = l.canal_geral || VALOR_NAO_MAPEADO;

    const chaveMensal = [cidadeChaveAgrupamento, mapa.tecnologia, mapa.indicadorId, l.mes_ref, canal].join('\u0001');
    if (!mensal.has(chaveMensal)) {
      mensal.set(chaveMensal, {
        cidadeOrigem: l.cidade,
        cidadeSlug,
        tecnologia: mapa.tecnologia,
        indicadorId: mapa.indicadorId,
        mesRef: l.mes_ref,
        semanaMes: null,
        canal,
        valor: 0,
        _origensSomadas: new Set(),
      });
    }
    const registroMensal = mensal.get(chaveMensal);
    if (!registroMensal._origensSomadas.has(l.origem)) {
      registroMensal._origensSomadas.add(l.origem);
      registroMensal.valor += paraNumero(l.realizado_mes);
    }

    const chaveSemanal = [cidadeChaveAgrupamento, mapa.tecnologia, mapa.indicadorId, l.mes_ref, l.semana_mes, canal].join(
      '\u0001',
    );
    if (!semanal.has(chaveSemanal)) {
      semanal.set(chaveSemanal, {
        cidadeOrigem: l.cidade,
        cidadeSlug,
        tecnologia: mapa.tecnologia,
        indicadorId: mapa.indicadorId,
        mesRef: l.mes_ref,
        semanaMes: Number(l.semana_mes),
        primeiroDiaSemana: l.primeiro_dia_semana,
        ultimoDiaSemana: l.ultimo_dia_semana,
        canal,
        valor: 0,
      });
    }
    // valor semanal não se repete entre semanas (diferente do mensal), não precisa de dedup.
    semanal.get(chaveSemanal).valor += paraNumero(l.realizado_semana);
  }

  const limparCanal = (r) => { const { _origensSomadas, ...resto } = r; return resto; };
  return [...mensal.values()].map(limparCanal).concat([...semanal.values()].map(limparCanal));
}

const COLUNAS_SAIDA_POR_CANAL = [
  'cidade_slug',
  'cidade_origem',
  'tecnologia',
  'indicador_id',
  'canal',
  'mes_ref',
  'semana_mes',
  'primeiro_dia_semana',
  'ultimo_dia_semana',
  'valor',
];

/** Serializa a saída de `normalizarPorCanal()` — mesmo parser (`parsearCsv`) lê os dois arquivos, só muda o conjunto de colunas. */
export function paraCsvPorCanal(registros) {
  const linhas = registros.map((r) =>
    [
      r.cidadeSlug,
      r.cidadeOrigem,
      r.tecnologia,
      r.indicadorId,
      r.canal,
      r.mesRef,
      r.semanaMes,
      r.primeiroDiaSemana,
      r.ultimoDiaSemana,
      r.valor,
    ]
      .map(celulaCsv)
      .join(','),
  );
  return [COLUNAS_SAIDA_POR_CANAL.join(','), ...linhas].join('\n') + '\n';
}

/**
 * Colunas de metainformação de cidade (gerência regional, gerente e
 * coordenação) — opcionais: bases antigas sem essas colunas continuam
 * funcionando, só não geram metadado nenhum (front cai no que já tinha:
 * mock ou `null`, ver cidadeService.js). Nunca em COLUNAS_OBRIGATORIAS
 * por causa disso.
 *
 * Cada cidade deveria ter só um valor de cada campo na base inteira (não
 * é algo que muda por semana/mês). Se a base trouxer valores diferentes
 * pra uma mesma cidade — inconsistência de cadastro, não erro de
 * parsing — mantém o primeiro valor não-"NÃO MAPEADO" encontrado (ordem
 * de leitura do CSV) e devolve um aviso, sem derrubar o workflow: dado
 * de gerência é complementar, não pode bloquear a publicação de vendas.
 */
export function normalizarMetadadosCidade(linhas) {
  const avisos = [];
  const porCidade = new Map(); // cidadeSlug -> { cidadeOrigem, gerenciaCidade, gerenteCidade, coordenacao }

  const CAMPOS = [
    ['gerencia_cidade', 'gerenciaCidade'],
    ['gerente_cidade', 'gerenteCidade'],
    ['coordenacao', 'coordenacao'],
  ];

  for (const l of linhas) {
    const cidadeSlug = normalizarCidade(l.cidade);
    if (!cidadeSlug) continue; // sem cidade mapeada: mesmo critério de normalizar()

    if (!porCidade.has(cidadeSlug)) {
      porCidade.set(cidadeSlug, { cidadeOrigem: l.cidade, gerenciaCidade: null, gerenteCidade: null, coordenacao: null });
    }
    const registro = porCidade.get(cidadeSlug);

    for (const [colunaOrigem, campoDestino] of CAMPOS) {
      const bruto = l[colunaOrigem];
      if (bruto === undefined || bruto === '' || bruto === VALOR_NAO_MAPEADO) continue;

      if (registro[campoDestino] === null) {
        registro[campoDestino] = bruto;
      } else if (registro[campoDestino] !== bruto) {
        avisos.push(
          `Cidade "${l.cidade}": valores divergentes em "${colunaOrigem}" ("${registro[campoDestino]}" vs "${bruto}") — mantendo o primeiro.`,
        );
      }
    }
  }

  return { registros: [...porCidade.entries()].map(([cidadeSlug, r]) => ({ cidadeSlug, ...r })), avisos };
}

const COLUNAS_SAIDA_METADADOS = ['cidade_slug', 'cidade_origem', 'gerencia_cidade', 'gerente_cidade', 'coordenacao'];

/** Serializa a saída de `normalizarMetadadosCidade()` — arquivo separado (`cidades-metadados.csv`) porque é 1 linha por cidade, não 1 por indicador/semana como `indicadores-realizados.csv`. */
export function paraCsvMetadados(registros) {
  const linhas = registros.map((r) =>
    [r.cidadeSlug, r.cidadeOrigem, r.gerenciaCidade, r.gerenteCidade, r.coordenacao].map(celulaCsv).join(','),
  );
  return [COLUNAS_SAIDA_METADADOS.join(','), ...linhas].join('\n') + '\n';
}

const COLUNAS_SAIDA = [
  'cidade_slug',
  'cidade_origem',
  'tecnologia',
  'indicador_id',
  'mes_ref',
  'semana_mes',
  'primeiro_dia_semana',
  'ultimo_dia_semana',
  'valor',
];

function celulaCsv(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Serializa a saída de `normalizar()` de volta pra CSV — é o arquivo que
 * o workflow escreve em `public/dados/indicadores-realizados.csv` e que o
 * front lê com `parsearCsv()` (mesmo parser, mesmo shape de coluna: é o
 * que garante que gerar e ler nunca ficam dessincronizados).
 */
export function paraCsv(registros) {
  const linhas = registros.map((r) =>
    [
      r.cidadeSlug,
      r.cidadeOrigem,
      r.tecnologia,
      r.indicadorId,
      r.mesRef,
      r.semanaMes,
      r.primeiroDiaSemana,
      r.ultimoDiaSemana,
      r.valor,
    ]
      .map(celulaCsv)
      .join(','),
  );
  return [COLUNAS_SAIDA.join(','), ...linhas].join('\n') + '\n';
}

/**
 * Metas de "Vendas Instaladas"/"Vendas Ativadas" por cidade/mês — fonte
 * separada da base de vendas (arquivo próprio, formato:
 * `data,cidade,indicador,indicador_geral,servico,meta,categoria,...`).
 * Mesmo arquivo cobre as duas tecnologias hoje (a query de origem virou
 * `WHERE indicador_geral IN ('Vendas Instaladas', 'Vendas Ativadas')`) —
 * por isso a normalização em si vive numa função compartilhada
 * (`normalizarMetasCidade`), e cada tecnologia só declara o próprio
 * filtro. O filtro continua restrito e explícito: só entra o que bate
 * `servico`+`indicadorGeral` exatos, `categoria === 'venda'`,
 * `stutus === 'Ativo'` — qualquer outra linha (FWA, Banda Larga,
 * indicador desativado) é ignorada, não misturada.
 *
 * `data` já vem como primeiro dia do mês ("2026-01-01") — mesmo formato
 * de `mes_ref` no resto do pipeline, não precisa conversão.
 */
function normalizarMetasCidade(linhas, { servico, indicadorGeral }) {
  const avisos = [];
  const porChave = new Map(); // "cidadeSlug\u0001mesRef" -> { cidadeOrigem, cidadeSlug, mesRef, meta }

  for (const l of linhas) {
    if (l.servico !== servico) continue;
    if (l.indicador_geral !== indicadorGeral) continue;
    if (l.categoria !== 'venda') continue;
    if (l.stutus !== 'Ativo') continue;

    const cidadeSlug = normalizarCidade(l.cidade);
    if (!cidadeSlug) continue; // mesmo critério do resto do pipeline: nunca inventa cidade

    const meta = paraNumero(l.meta);
    if (Number.isNaN(meta)) continue;

    const chave = cidadeSlug + '\u0001' + l.data;
    if (porChave.has(chave)) {
      const anterior = porChave.get(chave).meta;
      if (anterior !== meta) {
        avisos.push(`Cidade "${l.cidade}", mês ${l.data}: meta divergente (${anterior} vs ${meta}) — mantendo a primeira.`);
      }
      continue;
    }
    porChave.set(chave, { cidadeOrigem: l.cidade, cidadeSlug, mesRef: l.data, meta });
  }

  return { registros: [...porChave.values()], avisos };
}

/** Meta Geral da Cidade — FTTH ("Vendas Instaladas"). Comportamento idêntico a antes da 5G existir. */
export function normalizarMetasInstalacaoFtth(linhas) {
  return normalizarMetasCidade(linhas, { servico: 'FTTH', indicadorGeral: 'Vendas Instaladas' });
}

/** Meta Geral da Cidade — 5G ("Vendas Ativadas"). Mesmo arquivo de origem que o FTTH, filtro próprio. */
export function normalizarMetasAtivacao5g(linhas) {
  return normalizarMetasCidade(linhas, { servico: '5G', indicadorGeral: 'Vendas Ativadas' });
}

const COLUNAS_SAIDA_METAS_INSTALACAO = ['cidade_slug', 'cidade_origem', 'mes_ref', 'meta'];

/** Serializa a saída de `normalizarMetasInstalacaoFtth()`/`normalizarMetasAtivacao5g()` — mesmo parser (`parsearCsv`) lê de volta. */
export function paraCsvMetasInstalacaoFtth(registros) {
  const linhas = registros.map((r) => [r.cidadeSlug, r.cidadeOrigem, r.mesRef, r.meta].map(celulaCsv).join(','));
  return [COLUNAS_SAIDA_METAS_INSTALACAO.join(','), ...linhas].join('\n') + '\n';
}

/** Mesmo formato de `paraCsvMetasInstalacaoFtth` — nome próprio só pra deixar o output (`gerarBase.mjs`) explícito sobre qual arquivo está escrevendo. */
export const paraCsvMetasAtivacao5g = paraCsvMetasInstalacaoFtth;

/**
 * Lista oficial de cidades onde a operação vende (FTTH/5G/FWA) — fonte de
 * ESCOPO do Ranking, diferente da base de vendas (que traz qualquer
 * cidade com atividade registrada, incluindo funil que nunca virou venda
 * — ver normalizarPorCanal/normalizar). Arquivo próprio
 * (`base_mesa_performace_ATUAL.csv`), atualizado mensalmente pelo
 * negócio, colunas: `atuais` (nome da cidade — usa essa, não `cidades`;
 * ver aviso abaixo), `servico` ("FTTH E 5G" | "5G ONLY"), `fwa`
 * ("VENDENDO" | "PENDENTE"), `lancamento_comercial` (data yyyy-mm-dd de
 * quando a cidade começou a vender comercialmente — vira o card
 * "Ativação comercial" da PaginaCidade). Formato inválido/ausente vira
 * `null` (mesmo critério de "—" do resto do painel), sem bloquear a
 * publicação.
 *
 * 1 linha por cidade (sem meses/período) — mais simples que
 * `normalizarMetadadosCidade`, não precisa de agregação por chave
 * composta.
 */
export function normalizarCidadesOficiais(linhas) {
  const avisos = [];
  const porCidade = new Map();

  for (const l of linhas) {
    const cidadeSlug = normalizarCidade(l.atuais);
    if (!cidadeSlug) continue; // mesmo critério do resto do pipeline: nunca inventa cidade

    if (porCidade.has(cidadeSlug)) {
      avisos.push(`Cidade "${l.atuais}" aparece mais de uma vez na base oficial — mantendo a primeira ocorrência.`);
      continue;
    }

    const lancamentoComercial = REGEX_DATA.test(l.lancamento_comercial) ? l.lancamento_comercial : null;
    if (l.lancamento_comercial && !lancamentoComercial) {
      avisos.push(`Cidade "${l.atuais}": lancamento_comercial inválida ("${l.lancamento_comercial}") — exibindo "—".`);
    }

    porCidade.set(cidadeSlug, {
      cidadeSlug,
      cidadeOrigem: l.atuais,
      vendeFtth: l.servico === 'FTTH E 5G',
      vende5g: l.servico === 'FTTH E 5G' || l.servico === '5G ONLY',
      vendeFwa: l.fwa === 'VENDENDO',
      lancamentoComercial,
    });
  }

  return { registros: [...porCidade.values()], avisos };
}

const COLUNAS_SAIDA_CIDADES_OFICIAIS = [
  'cidade_slug',
  'cidade_origem',
  'vende_ftth',
  'vende_5g',
  'vende_fwa',
  'lancamento_comercial',
];

/** Serializa a saída de `normalizarCidadesOficiais()` — mesmo parser (`parsearCsv`) lê de volta. */
export function paraCsvCidadesOficiais(registros) {
  const linhas = registros.map((r) =>
    [r.cidadeSlug, r.cidadeOrigem, r.vendeFtth, r.vende5g, r.vendeFwa, r.lancamentoComercial].map(celulaCsv).join(','),
  );
  return [COLUNAS_SAIDA_CIDADES_OFICIAIS.join(','), ...linhas].join('\n') + '\n';
}

/**
 * Meta por canal — DIFERENTE da Meta Geral da Cidade
 * (normalizarMetasInstalacaoFtth/normalizarMetasAtivacao5g, acima): fonte
 * própria, granularidade própria (cidade+canal+mês, não só cidade+mês), e
 * os números NÃO precisam bater entre si — são conceitos distintos
 * confirmados com o negócio (Meta Geral da Cidade alimenta Ranking/score;
 * Meta por Canal alimenta a Meta do Indicador na tabela da cidade,
 * filtrável pelo SeletorCanais).
 *
 * Cobre 4 categorias hoje, cada uma é a soma de um subconjunto de
 * indicadores do Dicionário de Metas — o mesmo indicador nunca pertence a
 * mais de uma categoria:
 *  - "orcamento" (Criado): Vendas criadas Combo 1 Chip/Combo 2+ Chip/avulso
 *  - "efetivado" (Efetivado): Vendas efetivadas Combo 1 Chip/Combo 2+ Chip/avulso
 *  - "instalacao" (Instalado): Vendas instalada(s) Combo/Combo 1 Chip/Combo 2+ Chip/avulso
 *  - "ativacao" (Ativado 5G): "Ativação 5G avulso" OU "Vendas Ativadas - 5G",
 *    dependendo do canal — ver INDICADOR_ATIVACAO_POR_CANAL, abaixo.
 *
 * Duas bases de entrada:
 *  - Dicionário de Metas: 1 linha por mês×indicador×canal (o dicionário
 *    ganhou a coluna canal, mas o multiplicador NUNCA varia por canal pro
 *    mesmo indicador+mês — validado nas 587 linhas atuais — por isso o
 *    índice de multiplicador continua ignorando canal).
 *  - Fato de Metas por vendedor: 1 linha por vendedor×mês×indicador×canal,
 *    dá a meta-base e a cidade/canal daquele vendedor.
 *
 * Regra de negócio (confirmada): multiplicador = max(FTTH, FWA, 5G) da
 * linha do dicionário correspondente (chave: data+indicador); meta
 * calculada = meta-base × multiplicador; a meta final por
 * cidade+canal+categoria+mês é a SOMA das metas calculadas de todo
 * indicador daquela categoria (ver MAPA_INDICADOR_PARA_CATEGORIA_META),
 * respeitando a regra de indicador-por-canal da Ativação 5G.
 */
const INDICADORES_POR_CATEGORIA_META = {
  orcamento: ['Vendas criadas Combo 1 Chip - FTTH', 'Vendas criadas Combo 2+ Chip - FTTH', 'Vendas criadas avulso - FTTH'],
  efetivado: ['Vendas efetivadas Combo 1 Chip - FTTH', 'Vendas efetivadas Combo 2+ Chip - FTTH', 'Vendas efetivadas avulso - FTTH'],
  instalacao: [
    'Vendas instalada Combo - FTTH',
    'Vendas instaladas Combo 1 Chip - FTTH',
    'Vendas instaladas Combo 2+ Chip - FTTH',
    'Vendas instaladas avulso - FTHH', // grafia real da fonte (typo consistente no dicionário e na fato)
  ],
  // Os dois indicadores de ativação 5G — qual vale pra qual canal é
  // decidido por INDICADOR_ATIVACAO_POR_CANAL, não pelo simples
  // pertencimento a essa lista (diferente das outras 3 categorias).
  ativacao: ['Ativação 5G avulso', 'Vendas Ativadas - 5G'],
};

/** "Vendas criadas avulso - FTTH" -> "orcamento", etc. Construído uma vez a partir de INDICADORES_POR_CATEGORIA_META — nunca mantido à mão em paralelo. */
const MAPA_INDICADOR_PARA_CATEGORIA_META = new Map(
  Object.entries(INDICADORES_POR_CATEGORIA_META).flatMap(([categoria, indicadores]) =>
    indicadores.map((indicador) => [indicador, categoria]),
  ),
);

/**
 * Confirmado com o negócio: a fonte reporta "Ativação 5G avulso" E "Vendas
 * Ativadas - 5G" simultaneamente pro canal ONLINE, com valores mensais
 * diferentes (não é o mesmo evento duplicado) — mas cada canal usa só o
 * indicador que "pertence" a ele, nunca soma os dois. ONLINE é o único
 * canal com indicador próprio (`Vendas Ativadas - 5G`) hoje; todo outro
 * canal (inclusive canal novo que apareça no futuro) cai no padrão
 * (`Ativação 5G avulso`) — é assim que a fonte reporta pra eles.
 */
const INDICADOR_ATIVACAO_POR_CANAL = { ONLINE: 'Vendas Ativadas - 5G' };
const INDICADOR_ATIVACAO_PADRAO = 'Ativação 5G avulso';

/** Indicador de ativação que reporta pro canal errado (ex.: "Ativação 5G avulso" registrado sob ONLINE, que usa o indicador próprio) é excluído — não é erro, é o indicador do canal vizinho vazando na mesma fonte. */
function indicadorAtivacaoPertenceAoCanal(indicador, canal) {
  const esperado = INDICADOR_ATIVACAO_POR_CANAL[canal] ?? INDICADOR_ATIVACAO_PADRAO;
  return indicador === esperado;
}

/**
 * Dicionário -> Map("mesRef\u0001indicador" -> multiplicador). Uma linha
 * por canal é esperado agora (o dicionário ganhou a coluna canal) — só
 * gera aviso se o MESMO indicador+mês tiver multiplicador DIFERENTE entre
 * canais (o que nunca deveria acontecer, validado hoje), não a cada
 * repetição normal.
 */
export function indexarMultiplicadoresDicionarioMetas(linhasDicionario) {
  const avisos = [];
  const indice = new Map();

  for (const l of linhasDicionario) {
    const chave = l.data + '\u0001' + l.indicador;
    const ftth = paraNumero(l.FTTH) || 0;
    const fwa = paraNumero(l.FWA) || 0;
    const g5 = paraNumero(l['5G']) || 0;
    const multiplicador = Math.max(ftth, fwa, g5);

    if (indice.has(chave)) {
      const anterior = indice.get(chave);
      if (anterior !== multiplicador) {
        avisos.push(
          `Dicionário de metas: indicador "${l.indicador}" no mês ${l.data} tem multiplicador divergente entre canais (${anterior} vs ${multiplicador}, canal "${l.canal}") — mantendo o primeiro.`,
        );
      }
      continue;
    }
    indice.set(chave, multiplicador);
  }

  return { indice, avisos };
}

/**
 * Fato de metas por vendedor -> registros agregados em
 * cidade+canal+categoria+mês (soma de todo indicador daquela categoria,
 * já multiplicado). Linha sem cidade mapeável (`normalizarCidade` devolve
 * null) fica de fora da tabela por cidade — mesmo critério do resto do
 * pipeline, nunca inventa cidade. Linha cujo indicador não tem regra no
 * dicionário pro mês vira aviso e é descartada (auditável, não silenciosa).
 * Linha cujo indicador não pertence a nenhuma categoria conhecida é
 * ignorada silenciosamente — é o comportamento esperado pra qualquer
 * indicador da fato que ainda não tem meta por canal (ex.: Churn, Ticket
 * Médio), não um erro. Linha de ativação 5G que reporta pro indicador do
 * canal errado (ver indicadorAtivacaoPertenceAoCanal) também é ignorada
 * silenciosamente, mesmo critério.
 */
export function normalizarMetaPorCanal(linhasFato, indiceMultiplicadores) {
  const avisos = [];
  const porChave = new Map(); // "cidadeSlug\u0001canal\u0001categoria\u0001mesRef" -> { cidadeSlug, cidadeOrigem, canal, indicadorId, mesRef, meta }

  for (const l of linhasFato) {
    const categoria = MAPA_INDICADOR_PARA_CATEGORIA_META.get(l.indicador);
    if (!categoria) continue;

    const canal = l.canal || 'SEM CANAL';
    if (categoria === 'ativacao' && !indicadorAtivacaoPertenceAoCanal(l.indicador, canal)) continue;

    const metaBase = paraNumero(l.meta);
    if (Number.isNaN(metaBase)) {
      avisos.push(`Meta inválida: cidade "${l.cidade}", canal "${l.canal}", indicador "${l.indicador}", mês ${l.data}.`);
      continue;
    }

    const chaveDicionario = l.data + '\u0001' + l.indicador;
    const multiplicador = indiceMultiplicadores.get(chaveDicionario);
    if (multiplicador === undefined) {
      avisos.push(`Sem regra no dicionário pro indicador "${l.indicador}" no mês ${l.data} — linha descartada.`);
      continue;
    }

    const cidadeSlug = normalizarCidade(l.cidade);
    if (!cidadeSlug) continue; // sem cidade mapeável: fica fora da tabela por cidade (mesmo critério de sempre)

    const chave = cidadeSlug + '\u0001' + canal + '\u0001' + categoria + '\u0001' + l.data;
    const atual = porChave.get(chave) ?? {
      cidadeSlug,
      cidadeOrigem: l.cidade,
      canal,
      indicadorId: categoria,
      mesRef: l.data,
      meta: 0,
    };
    atual.meta += metaBase * multiplicador;
    porChave.set(chave, atual);
  }

  return { registros: [...porChave.values()], avisos };
}

const COLUNAS_SAIDA_META_POR_CANAL = ['cidade_slug', 'cidade_origem', 'canal', 'indicador_id', 'mes_ref', 'meta'];

/** Serializa a saída de `normalizarMetaPorCanal()` — `indicador_id` agora vem do próprio registro (orcamento/efetivado/instalacao/ativacao), não é mais fixo. */
export function paraCsvMetaPorCanal(registros) {
  const linhas = registros.map((r) =>
    [r.cidadeSlug, r.cidadeOrigem, r.canal, r.indicadorId, r.mesRef, r.meta].map(celulaCsv).join(','),
  );
  return [COLUNAS_SAIDA_META_POR_CANAL.join(','), ...linhas].join('\n') + '\n';
}