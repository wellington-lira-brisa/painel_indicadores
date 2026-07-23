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
  const s = texto.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
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
 * — ver normalizarPorCanal/normalizar).
 *
 * DUAS fontes independentes, cada uma decide sua própria tecnologia —
 * confirmado com o negócio (planilha "Cidades Atuais" é só 5G; FTTH tem
 * lista própria separada, `cidades_ftth.csv`):
 *  - `cidades_ftth.csv`: lista fechada, 1 coluna (`cidade`, "Nome/UF") —
 *    presença na lista = `vendeFtth: true`. Sem outro atributo.
 *  - `cidades_atuais.csv` (planilha "Cidades Atuais", 5G): colunas
 *    `atuais` (nome da cidade — usa essa, não `cidades`), `servico`
 *    ("FTTH E 5G" | "5G ONLY" — aqui só decide `vende5g`, nunca
 *    `vendeFtth`), `fwa` ("VENDENDO" | "PENDENTE"), `lancamento_comercial`
 *    (data yyyy-mm-dd de quando a cidade começou a vender comercialmente
 *    — vira o card "Ativação comercial" da PaginaCidade).
 *
 * Cidade que só existe numa das duas fontes entra mesmo assim (com a
 * tecnologia que não tem fonte própria em `false`); cidade nas duas
 * funde os dois lados. Formato inválido/ausente vira `null` (mesmo
 * critério de "—" do resto do painel), sem bloquear a publicação.
 *
 * 1 linha por cidade (sem meses/período) — mais simples que
 * `normalizarMetadadosCidade`, não precisa de agregação por chave
 * composta.
 */
export function normalizarCidadesOficiais(linhasFtth, linhasAtuais5g) {
  const avisos = [];
  const porCidade = new Map();
  const vistasFtth = new Set();
  const vistasAtuais = new Set();

  // FTTH: lista fechada, só nome de cidade (`cidade_ftth.csv`) — nenhum
  // outro atributo vem daqui. Confirmado com o negócio: a coluna
  // `servico` de cidades_atuais.csv NÃO decide mais FTTH (aquele arquivo
  // é só 5G — "FTTH E 5G" ali significa "essa cidade 5G também tem FTTH
  // pela lista própria", não o contrário).
  for (const l of linhasFtth) {
    const cidadeSlug = normalizarCidade(l.cidade);
    if (!cidadeSlug) continue; // mesmo critério do resto do pipeline: nunca inventa cidade

    if (vistasFtth.has(cidadeSlug)) {
      avisos.push(`Cidade "${l.cidade}" aparece mais de uma vez na base FTTH — mantendo a primeira ocorrência.`);
      continue;
    }
    vistasFtth.add(cidadeSlug);

    porCidade.set(cidadeSlug, {
      cidadeSlug,
      cidadeOrigem: l.cidade,
      vendeFtth: true,
      vende5g: false,
      vendeFwa: false,
      lancamentoComercial: null,
    });
  }

  // 5G (cidades_atuais.csv): dá vende5g, FWA e lançamento comercial. Uma
  // cidade que já veio da lista FTTH só recebe o que falta (nunca reduz
  // vendeFtth pra false); uma cidade nova (só 5G) entra do zero.
  for (const l of linhasAtuais5g) {
    const cidadeSlug = normalizarCidade(l.atuais);
    if (!cidadeSlug) continue;

    if (vistasAtuais.has(cidadeSlug)) {
      avisos.push(`Cidade "${l.atuais}" aparece mais de uma vez na base de cidades atuais (5G) — mantendo a primeira ocorrência.`);
      continue;
    }
    vistasAtuais.add(cidadeSlug);

    const vende5gAqui = l.servico === 'FTTH E 5G' || l.servico === '5G ONLY';
    const lancamentoComercial = REGEX_DATA.test(l.lancamento_comercial) ? l.lancamento_comercial : null;
    if (l.lancamento_comercial && !lancamentoComercial) {
      avisos.push(`Cidade "${l.atuais}": lancamento_comercial inválida ("${l.lancamento_comercial}") — exibindo "—".`);
    }

    const existente = porCidade.get(cidadeSlug);
    porCidade.set(cidadeSlug, {
      cidadeSlug,
      cidadeOrigem: existente?.cidadeOrigem ?? l.atuais,
      vendeFtth: existente?.vendeFtth ?? false,
      vende5g: vende5gAqui,
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
    'Vendas instaladas avulso - Banda Larga', // confirmado com o negócio (reunião 20/07/2026): conta como Instalado FTTH; dicionário corrigido na fonte pra dar FTTH=1 pra esse indicador (sem override no código)
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

const COLUNAS_DIAS_UTEIS = [
  'data',
  'UF',
  'dia_semana_num',
  'flag_feriado',
  'nome_dia_semana',
  'dias_trabalhado',
  'dias_uteis_acumulado',
];
const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_UF = /^[A-Z]{2}$/;

/**
 * Valida a base de dias úteis (fonte de verdade do calendário comercial
 * pro rateio semanal de Meta do Indicador — ver utils/diasUteis.js).
 * NÃO reconcilia com o motor de feriados (vendor/feriados) — são
 * calendários com propósitos diferentes, já confirmado que divergem em
 * datas reais (ver comentário em utils/diasUteis.js); esta validação só
 * garante que o ARQUIVO em si está bem formado, não que concorda com
 * outra fonte.
 */
export function validarDiasUteis(linhas) {
  const erros = [];
  const avisos = [];

  if (linhas.length === 0) {
    erros.push('Base de dias úteis vazia.');
    return { erros, avisos };
  }

  for (const coluna of COLUNAS_DIAS_UTEIS) {
    if (!(coluna in linhas[0])) {
      erros.push(`Coluna obrigatória "${coluna}" ausente no cabeçalho.`);
    }
  }
  if (erros.length > 0) return { erros, avisos }; // sem as colunas certas, nem vale checar linha a linha

  for (const l of linhas) {
    if (!REGEX_DATA_ISO.test(l.data)) {
      erros.push(`Linha ${l._linha}: data "${l.data}" fora do formato AAAA-MM-DD.`);
    }
    if (l.UF !== '' && !REGEX_UF.test(l.UF)) {
      avisos.push(
        `Linha ${l._linha}: UF "${l.UF}" não é uma sigla de 2 letras — linha será ignorada no rateio (UF vazia ou inválida nunca casa com nenhuma cidade).`,
      );
    }
    if (l.dias_trabalhado !== '' && Number.isNaN(Number(l.dias_trabalhado))) {
      erros.push(`Linha ${l._linha}: dias_trabalhado "${l.dias_trabalhado}" não é numérico.`);
    }
    if (erros.length > 50) break;
  }

  return { erros: erros.slice(0, 50), avisos: avisos.slice(0, 50) };
}

/** Re-serializa a base de dias úteis (pass-through validado): mesmas
 * colunas, ordem e nomes — mas via `celulaCsv` (quoting seguro) e sem
 * BOM, mesmo que a fonte baixada tenha vindo com um (Excel/Sheets geram
 * BOM com frequência — `parsearCsv` já tolera isso na leitura, mas
 * publicar já limpo evita depender disso em quem mais vier a ler o
 * arquivo, incluindo abrir num editor de planilha manualmente). */
export function paraCsvDiasUteis(linhas) {
  const corpo = linhas.map((l) => COLUNAS_DIAS_UTEIS.map((coluna) => celulaCsv(l[coluna])).join(','));
  return [COLUNAS_DIAS_UTEIS.join(','), ...corpo].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Sistema de Quintil (performance individual dos vendedores -> cidade)
// ---------------------------------------------------------------------------

/** Categoria de venda -> tecnologia da página que a consome. */
const TECNOLOGIA_POR_CATEGORIA_META = { orcamento: 'ftth', efetivado: 'ftth', instalacao: 'ftth', ativacao: '5g' };

/**
 * Faixas de quintil definidas pelo negócio (percentual de atingimento da
 * meta): 1º ≥100% · 2º ≥80% · 3º ≥60% · 4º ≥30% · 5º <30%.
 */
export function classificarQuintil(atingimento) {
  if (atingimento === null || atingimento === undefined || Number.isNaN(atingimento)) return null;
  if (atingimento >= 1.0) return 1;
  if (atingimento >= 0.8) return 2;
  if (atingimento >= 0.6) return 3;
  if (atingimento >= 0.3) return 4;
  return 5;
}

/**
 * Fato de metas+realizado por vendedor -> distribuição de quintis por
 * cidade+tecnologia+mês. A mesma passagem também devolve uma saída
 * individual enxuta por canal para a página da cidade e para o Ranking:
 * identificador opaco local, nome, canal, meta, realizado, atingimento e
 * quintil. Matrícula e hash continuam restritos ao ETL e nunca são
 * publicados.
 *
 * Atingimento do vendedor (regra fechada com o negócio): soma de
 * realizado ÷ soma de meta×multiplicador das linhas de VENDA dele na
 * tecnologia — exatamente os mesmos indicadores/multiplicadores/regra de
 * ativação-por-canal do pipeline de Meta por Canal
 * (MAPA_INDICADOR_PARA_CATEGORIA_META etc.). Todas essas linhas são
 * Qtd/"Maior melhor" (validado na base), então a soma é homogênea.
 * Churn/Ticket/Portabilidade ficam de fora por design, como no pipeline
 * de meta. Quintil da cidade = quintil da MÉDIA SIMPLES dos atingimentos
 * dos vendedores dela (decisão registrada: com times de 1–3 pessoas,
 * ponderação é pseudo-precisão; a nuance fica no TAM exposto ao lado).
 *
 * Vendedor presente no mês/cidade mas sem NENHUMA linha de venda válida
 * em NENHUMA tecnologia entra em `sem_meta` nas DUAS — é o único caso
 * genuinamente ambíguo. Vendedor que vende só a OUTRA tecnologia (ex.:
 * só 5G) fica de fora inteiramente do bucket desta — ele não é "sem
 * meta de FTTH", só não pertence a esse funil; contá-lo infolaria o
 * total e o "sem meta" com gente de outro time (achado real na base:
 * Juazeiro do Norte/CE tem vendedores só-FTTH, só-5G e ambos no mesmo
 * mês). Isso garante que a soma das faixas SEMPRE bate com o total
 * PUBLICADO da tecnologia (mesma lição do "158 vs 161" do ranking, agora
 * aplicada por tecnologia). Linha de venda com meta 0 (existem 46 na
 * base) é descartada do atingimento com aviso, nunca vira divisão por
 * zero. Linha sem regra no dicionário pro mês: aviso + descarte, mesmo
 * contrato de normalizarMetaPorCanal.
 */
export function normalizarQuintisPorCidade(linhasFato, indiceMultiplicadores) {
  const avisos = [];
  // vendedor(hash) x cidade x tecnologia x mês -> { meta, realizado } (soma das linhas de venda)
  const somasPorVendedor = new Map();
  // Mesma soma, preservando o canal. É a fonte do recálculo exato quando
  // um ou vários canais são selecionados no painel.
  const somasPorVendedorCanal = new Map();
  // Nome de exibição do vendedor. A chave inclui cidade+mês porque a mesma
  // pessoa pode mudar de lotação ou ter o nome corrigido entre competências.
  const nomesPorVendedor = new Map();
  // Todo vendedor visto em cada cidade+mês (mesmo sem linha de venda),
  // guardando tecnologias válidas no total e dentro de cada canal.
  const vendedoresPorCidadeMes = new Map();
  // Identificador opaco e estável dentro de toda a publicação. O mesmo
  // hash recebe o mesmo id em todos os meses e cidades, permitindo o
  // histórico sem publicar hash, matrícula ou outro identificador bruto.
  //
  // hash_user vazio/ausente NÃO é uma chave válida: a base real tem linhas
  // de vendedores distintos publicadas com hash_user="" simultaneamente
  // (achado real: MARIA JOSENIR e RAYSA, ambas em 2026-07 com hash vazio),
  // e colapsar todas sob a mesma chave '' juntaria pessoas diferentes num
  // único "vendedor" fantasma, corrompendo quintil e histórico de ambas.
  // Para essas linhas, a chave de agrupamento cai para nome+cidade+mês:
  // não é estável entre meses (não há garantia de estabilidade sem hash),
  // mas nunca junta duas pessoas diferentes dentro do mesmo mês/cidade.
  const vendedorIdPorHash = new Map();
  const cidadeOrigemPorSlug = new Map();
  // hash_user não-vazio -> Set(matrícula) vistas naquele hash, por mês.
  // Detecta colisão de hash entre pessoas distintas (achado real na base:
  // um mesmo hash servindo a duas matrículas diferentes no mesmo mês,
  // ex. 2026-02/03). É raro (dado de origem, não bug de pipeline) — vira
  // aviso, não altera a chave de agrupamento nem bloqueia a publicação.
  const matriculasPorHashMes = new Map();

  /**
   * hash_user confiável -> usa o hash (estável entre meses/cidades).
   * hash_user vazio/ausente -> chave isolada por linha (nome+cidade+mês):
   * nunca reutilizada entre pessoas diferentes, mesmo que o nome se repita
   * (nomes homônimos entre cidades distintas já eram tratados à parte pela
   * própria chave incluir cidade).
   */
  function chaveAgrupamento(l, cidadeSlug, chaveCidadeMes) {
    const hash = String(l.hash_user ?? '').trim();
    if (hash) return hash;
    avisos.push(
      `Quintil: hash_user vazio — vendedor "${l.vendedor}" tratado sem identificação estável entre meses (cidade "${l.cidade}", mês ${l.data}).`,
    );
    return `SEM-HASH\u0001${chaveCidadeMes}\u0001${String(l.vendedor ?? '').trim()}`;
  }

  for (const l of linhasFato) {
    const cidadeSlug = normalizarCidade(l.cidade);
    if (!cidadeSlug) continue; // sem cidade mapeável: fora, mesmo critério de todo o pipeline
    cidadeOrigemPorSlug.set(cidadeSlug, l.cidade);

    const chaveCidadeMes = cidadeSlug + '\u0001' + l.data;
    const chaveVendedor = chaveAgrupamento(l, cidadeSlug, chaveCidadeMes);

    const hashBruto = String(l.hash_user ?? '').trim();
    const matriculaBruta = String(l.matricula ?? '').trim();
    if (hashBruto && matriculaBruta) {
      const chaveHashMes = hashBruto + '\u0001' + l.data;
      if (!matriculasPorHashMes.has(chaveHashMes)) matriculasPorHashMes.set(chaveHashMes, new Set());
      const matriculasVistas = matriculasPorHashMes.get(chaveHashMes);
      if (matriculasVistas.size > 0 && !matriculasVistas.has(matriculaBruta)) {
        avisos.push(
          `Quintil: hash_user "${hashBruto}" associado a mais de uma matrícula no mês ${l.data} (matrículas: ${[...matriculasVistas, matriculaBruta].join(', ')}) — possível colisão de hash na base de origem.`,
        );
      }
      matriculasVistas.add(matriculaBruta);
    }

    if (!vendedoresPorCidadeMes.has(chaveCidadeMes)) vendedoresPorCidadeMes.set(chaveCidadeMes, new Map());
    const vendedoresDoMes = vendedoresPorCidadeMes.get(chaveCidadeMes);
    if (!vendedoresDoMes.has(chaveVendedor)) {
      vendedoresDoMes.set(chaveVendedor, { tecnologias: new Set(), canais: new Map() });
    }
    if (!vendedorIdPorHash.has(chaveVendedor)) {
      vendedorIdPorHash.set(chaveVendedor, `v${vendedorIdPorHash.size + 1}`);
    }
    const contextoVendedor = vendedoresDoMes.get(chaveVendedor);
    const canal = l.canal || 'SEM CANAL';
    if (!contextoVendedor.canais.has(canal)) contextoVendedor.canais.set(canal, new Set());
    nomesPorVendedor.set(
      chaveVendedor + '\u0001' + chaveCidadeMes,
      String(l.vendedor ?? '').trim() || 'Vendedor sem identificação',
    );

    const categoria = MAPA_INDICADOR_PARA_CATEGORIA_META.get(l.indicador);
    if (!categoria) continue; // não é indicador de venda (churn/ticket/...): conta só pro total do time

    if (categoria === 'ativacao' && !indicadorAtivacaoPertenceAoCanal(l.indicador, canal)) continue;

    const tecnologia = TECNOLOGIA_POR_CATEGORIA_META[categoria];
    // Vendedor conta como "vende FTTH" a partir de QUALQUER categoria FTTH
    // (Criado, Efetivado ou Instalado) — decide só se ele pertence ao
    // bucket da tecnologia, nunca quanto ele vendeu.
    contextoVendedor.tecnologias.add(tecnologia);
    contextoVendedor.canais.get(canal).add(tecnologia);

    // Meta e realizado do QUINTIL usam SOMENTE a categoria "Instalado" em
    // FTTH (e "Ativação" em 5G, que não tem essa subdivisão). Criado e
    // Efetivado são estágios anteriores do MESMO funil de venda, não
    // indicadores adicionais — somá-los ao Instalado infla a meta em até
    // 3x (achado real: GUILHERME LUIZ ANGELO DA SILVA, 2026-07, meta
    // exibida 33 = 12 Criado + 11 Efetivado + 10 Instalado, quando deveria
    // ser 10). Regra de negócio confirmada: quintil usa apenas Instalado,
    // mesmo quando Criado/Efetivado têm valor preenchido — nunca soma,
    // nunca faz fallback aqui (fallback de meta ausente é responsabilidade
    // da fonte/dicionário, não deste cálculo).
    if (categoria === 'orcamento' || categoria === 'efetivado') continue;

    const meta = paraNumero(l.meta);
    const realizado = paraNumero(l.realizado);
    if (Number.isNaN(meta) || Number.isNaN(realizado)) {
      avisos.push(`Quintil: meta/realizado inválido — cidade "${l.cidade}", indicador "${l.indicador}", mês ${l.data}.`);
      continue;
    }
    if (meta === 0) {
      avisos.push(`Quintil: meta 0 descartada — cidade "${l.cidade}", indicador "${l.indicador}", mês ${l.data}.`);
      continue;
    }

    const multiplicador = indiceMultiplicadores.get(l.data + '\u0001' + l.indicador);
    if (multiplicador === undefined) {
      avisos.push(`Quintil: sem regra no dicionário pro indicador "${l.indicador}" no mês ${l.data} — linha descartada.`);
      continue;
    }

    const chave = chaveVendedor + '\u0001' + cidadeSlug + '\u0001' + tecnologia + '\u0001' + l.data;
    const atual = somasPorVendedor.get(chave) ?? { meta: 0, realizado: 0 };
    atual.meta += meta * multiplicador;
    atual.realizado += realizado;
    somasPorVendedor.set(chave, atual);

    const chaveCanal = chave + '\u0001' + canal;
    const atualCanal = somasPorVendedorCanal.get(chaveCanal) ?? { meta: 0, realizado: 0 };
    atualCanal.meta += meta * multiplicador;
    atualCanal.realizado += realizado;
    somasPorVendedorCanal.set(chaveCanal, atualCanal);
  }

  // Agrega por cidade+tecnologia+mês
  const registros = [];
  const vendedores = [];
  for (const [chaveCidadeMes, vendedoresDoMes] of vendedoresPorCidadeMes) {
    const [cidadeSlug, mesRef] = chaveCidadeMes.split('\u0001');
    for (const tecnologia of ['ftth', '5g']) {
      const contagem = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let semMeta = 0;
      let somaAtingimentos = 0;
      let comAtingimento = 0;
      let total = 0;

      for (const [chaveVendedorLoop, contextoVendedor] of vendedoresDoMes) {
        const tecnologiasComVenda = contextoVendedor.tecnologias;
        // Vendedor só entra no bucket desta tecnologia se vende ELA, ou se
        // não vende NENHUMA das duas (ambíguo — conta como "sem meta" nos
        // dois buckets, é o único caso genuinamente indefinido). Quem
        // vende só a OUTRA tecnologia fica de fora inteiramente: não é
        // "sem meta de FTTH" — ele simplesmente não é FTTH, contá-lo aqui
        // infla o time e o "sem meta" com gente de outro funil.
        const vendeEstaTecnologia = tecnologiasComVenda.has(tecnologia);
        const naoVendeNenhumaTecnologia = tecnologiasComVenda.size === 0;
        if (!vendeEstaTecnologia && !naoVendeNenhumaTecnologia) continue;

        total += 1;
        const somas = somasPorVendedor.get(chaveVendedorLoop + '\u0001' + cidadeSlug + '\u0001' + tecnologia + '\u0001' + mesRef);
        if (!somas || somas.meta === 0) {
          semMeta += 1;
          continue;
        }
        const atingimento = somas.realizado / somas.meta;
        const quintil = classificarQuintil(atingimento);
        contagem[quintil] += 1;
        somaAtingimentos += atingimento;
        comAtingimento += 1;
      }

      // Reconciliação embutida: por construção q1..q5 + semMeta === total;
      // qualquer divergência aqui é bug de código, não de dado — checagem barata que trava publicação errada.
      const somaFaixas = contagem[1] + contagem[2] + contagem[3] + contagem[4] + contagem[5] + semMeta;
      if (somaFaixas !== total) {
        throw new Error(`Quintil: reconciliação falhou em ${cidadeSlug}/${tecnologia}/${mesRef}: faixas=${somaFaixas} total=${total}.`);
      }

      if (comAtingimento === 0) continue; // nenhum vendedor com venda nessa tecnologia nesse mês: não publica linha vazia

      const atingimentoMedio = somaAtingimentos / comAtingimento;
      registros.push({
        cidadeSlug,
        cidadeOrigem: cidadeOrigemPorSlug.get(cidadeSlug),
        tecnologia,
        mesRef,
        totalVendedores: total,
        q1: contagem[1],
        q2: contagem[2],
        q3: contagem[3],
        q4: contagem[4],
        q5: contagem[5],
        semMeta,
        atingimentoMedio: Math.round(atingimentoMedio * 10000) / 10000,
        quintilCidade: classificarQuintil(atingimentoMedio),
      });
    }

    // Duas linhas por vendedor×canal (FTTH e 5G). A ausência de soma fica
    // explícita como null para o front poder distinguir "sem venda nesta
    // tecnologia" de "venda só na outra tecnologia" depois de combinar
    // qualquer subconjunto de canais.
    for (const [chaveVendedorLoop, contextoVendedor] of vendedoresDoMes) {
      const vendedorId = vendedorIdPorHash.get(chaveVendedorLoop);
      const vendedor = nomesPorVendedor.get(chaveVendedorLoop + '\u0001' + chaveCidadeMes) ?? 'Vendedor sem identificação';

      for (const canal of contextoVendedor.canais.keys()) {
        for (const tecnologia of ['ftth', '5g']) {
          const chaveCanal =
            chaveVendedorLoop + '\u0001' + cidadeSlug + '\u0001' + tecnologia + '\u0001' + mesRef + '\u0001' + canal;
          const somas = somasPorVendedorCanal.get(chaveCanal);
          const atingimento = somas?.meta ? somas.realizado / somas.meta : null;
          vendedores.push({
            cidadeSlug,
            tecnologia,
            mesRef,
            vendedorId,
            vendedor,
            canal,
            meta: somas ? Math.round(somas.meta * 100) / 100 : null,
            realizado: somas ? Math.round(somas.realizado * 100) / 100 : null,
            atingimento: atingimento === null ? null : Math.round(atingimento * 10000) / 10000,
            quintil: atingimento === null ? null : classificarQuintil(atingimento),
          });
        }
      }
    }
  }

  return { registros, vendedores, avisos };
}

/**
 * Recalcula vendedores e distribuição da cidade depois de combinar os
 * canais selecionados. A classificação usa as mesmas faixas e a mesma
 * fórmula do agregado publicado: Σrealizado ÷ Σmeta por vendedor e média
 * simples dos atingimentos individuais.
 */
export function calcularQuintilVendedores(linhas, tecnologia, canaisSelecionados = []) {
  const canais = new Set(canaisSelecionados);
  const porVendedor = new Map();

  for (const l of linhas) {
    if (canais.size > 0 && !canais.has(l.canal)) continue;
    if (l.tecnologia !== 'ftth' && l.tecnologia !== '5g') continue;

    const vendedorId = l.vendedorId || l.vendedor_id || l.vendedor;
    if (!vendedorId) continue;
    if (!porVendedor.has(vendedorId)) {
      porVendedor.set(vendedorId, {
        vendedorId,
        vendedor: l.vendedor || 'Vendedor sem identificação',
        canais: new Set(),
        ftth: { temMeta: false, meta: 0, realizado: 0 },
        '5g': { temMeta: false, meta: 0, realizado: 0 },
      });
    }
    if (l.canal) porVendedor.get(vendedorId).canais.add(l.canal);

    const meta = l.meta === null || l.meta === undefined || l.meta === '' ? null : paraNumero(String(l.meta));
    const realizado =
      l.realizado === null || l.realizado === undefined || l.realizado === ''
        ? null
        : paraNumero(String(l.realizado));
    if (meta === null || Number.isNaN(meta) || meta === 0) continue;

    const acumulado = porVendedor.get(vendedorId)[l.tecnologia];
    acumulado.temMeta = true;
    acumulado.meta += meta;
    acumulado.realizado += realizado === null || Number.isNaN(realizado) ? 0 : realizado;
  }

  const outraTecnologia = tecnologia === 'ftth' ? '5g' : 'ftth';
  const contagem = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const vendedores = [];
  let semMeta = 0;
  let somaAtingimentos = 0;
  let comAtingimento = 0;

  for (const dados of porVendedor.values()) {
    const alvo = dados[tecnologia];
    if (!alvo.temMeta && dados[outraTecnologia].temMeta) continue;

    if (!alvo.temMeta) {
      semMeta += 1;
      vendedores.push({
        vendedorId: dados.vendedorId,
        vendedor: dados.vendedor,
        canais: [...dados.canais].sort((a, b) => a.localeCompare(b, 'pt-BR')),
        meta: null,
        realizado: null,
        atingimento: null,
        quintil: null,
      });
      continue;
    }

    const atingimento = alvo.realizado / alvo.meta;
    const quintil = classificarQuintil(atingimento);
    contagem[quintil] += 1;
    somaAtingimentos += atingimento;
    comAtingimento += 1;
    vendedores.push({
      vendedorId: dados.vendedorId,
      vendedor: dados.vendedor,
      canais: [...dados.canais].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      meta: Math.round(alvo.meta * 100) / 100,
      realizado: Math.round(alvo.realizado * 100) / 100,
      atingimento: Math.round(atingimento * 10000) / 10000,
      quintil,
    });
  }

  if (comAtingimento === 0) return null;

  vendedores.sort(
    (a, b) =>
      (a.quintil ?? 99) - (b.quintil ?? 99) ||
      (b.atingimento ?? -1) - (a.atingimento ?? -1) ||
      a.vendedor.localeCompare(b.vendedor, 'pt-BR'),
  );

  const atingimentoMedio = somaAtingimentos / comAtingimento;
  return {
    totalVendedores: vendedores.length,
    q1: contagem[1],
    q2: contagem[2],
    q3: contagem[3],
    q4: contagem[4],
    q5: contagem[5],
    semMeta,
    atingimentoMedio: Math.round(atingimentoMedio * 10000) / 10000,
    quintilCidade: classificarQuintil(atingimentoMedio),
    vendedores,
  };
}

const COLUNAS_SAIDA_QUINTIS = [
  'cidade_slug',
  'cidade_origem',
  'tecnologia',
  'mes_ref',
  'total_vendedores',
  'q1',
  'q2',
  'q3',
  'q4',
  'q5',
  'sem_meta',
  'atingimento_medio',
  'quintil_cidade',
];

/** Serializa a saída agregada de `normalizarQuintisPorCidade()`. */
export function paraCsvQuintis(registros) {
  const linhas = registros.map((r) =>
    [
      r.cidadeSlug,
      r.cidadeOrigem,
      r.tecnologia,
      r.mesRef,
      r.totalVendedores,
      r.q1,
      r.q2,
      r.q3,
      r.q4,
      r.q5,
      r.semMeta,
      r.atingimentoMedio,
      r.quintilCidade,
    ]
      .map(celulaCsv)
      .join(','),
  );
  return [COLUNAS_SAIDA_QUINTIS.join(','), ...linhas].join('\n') + '\n';
}

const COLUNAS_SAIDA_QUINTIS_VENDEDORES = [
  'cidade_slug',
  'tecnologia',
  'mes_ref',
  'vendedor_id',
  'vendedor',
  'canal',
  'meta',
  'realizado',
  'atingimento',
  'quintil',
];

/** Serializa o detalhamento usado apenas na página da cidade. */
export function paraCsvQuintisVendedores(vendedores) {
  const linhas = vendedores.map((r) =>
    [
      r.cidadeSlug,
      r.tecnologia,
      r.mesRef,
      r.vendedorId,
      r.vendedor,
      r.canal,
      r.meta,
      r.realizado,
      r.atingimento,
      r.quintil,
    ]
      .map(celulaCsv)
      .join(','),
  );
  return [COLUNAS_SAIDA_QUINTIS_VENDEDORES.join(','), ...linhas].join('\n') + '\n';
}
// ---------------------------------------------------------------------------
// Desvio por Canal (impacto de cada canal no resultado da cidade)
// ---------------------------------------------------------------------------

/**
 * Fato de metas+realizado por vendedor -> desvio agregado por
 * cidade × canal × tecnologia × mês, usando APENAS os indicadores
 * principais de venda de cada tecnologia (Instalação no FTTH, Ativação
 * no 5G — mesma classificação do pipeline de Meta por Canal).
 *
 * Desvio = Σrealizado − Σmeta (por canal × cidade × mês). Valor
 * negativo = canal abaixo da meta (déficit); positivo = acima (superávit).
 * Não usa multiplicador do dicionário: aqui o objetivo é o desvio em
 * unidades reais (instalações/ativações absolutas), não a meta ponderada
 * usada no atingimento do painel — são grandezas distintas com propósitos
 * distintos. Meta 0 e canal-lixo descartados (mesmo critério dos outros
 * pipelines). Cidade não mapeável fica fora (sem slug = sem cidade).
 */
export function normalizarDesvioPorCanal(linhasFato) {
  const avisos = [];
  // "cidadeSlug\x01canal\x01tecnologia\x01mesRef" -> { meta, realizado }
  const porChave = new Map();
  const cidadeOrigemPorSlug = new Map();

  for (const l of linhasFato) {
    const cidadeSlug = normalizarCidade(l.cidade);
    if (!cidadeSlug) continue;
    cidadeOrigemPorSlug.set(cidadeSlug, l.cidade);

    const canal = l.canal || 'SEM CANAL';
    if (['CANAL NAO ENCONTRADO', 'SEM CANAL', 'null', ''].includes(canal)) continue;

    const categoria = MAPA_INDICADOR_PARA_CATEGORIA_META.get(l.indicador);
    if (!categoria) continue; // churn/ticket/portabilidade: fora

    if (categoria === 'ativacao' && !indicadorAtivacaoPertenceAoCanal(l.indicador, canal)) continue;

    const meta = paraNumero(l.meta);
    const realizado = paraNumero(l.realizado);
    if (Number.isNaN(meta) || Number.isNaN(realizado)) {
      avisos.push(`Desvio: meta/realizado inválido — cidade "${l.cidade}", canal "${canal}", indicador "${l.indicador}", mês ${l.data}.`);
      continue;
    }
    if (meta === 0) continue; // meta 0: descarta sem aviso (ruído esperado, já documentado)

    const tecnologia = TECNOLOGIA_POR_CATEGORIA_META[categoria];
    // Agrupa orçamento/efetivado/instalação todos em 'instalacao' como indicador único da página FTTH;
    // ativação em '5g'. O usuário vê "Instalação" ou "Ativação" — não a subdivisão interna.
    const chave = `${cidadeSlug}\x01${canal}\x01${tecnologia}\x01${l.data}`;
    const atual = porChave.get(chave) ?? { cidadeSlug, cidadeOrigem: l.cidade, canal, tecnologia, mesRef: l.data, meta: 0, realizado: 0 };
    atual.meta += meta;
    atual.realizado += realizado;
    porChave.set(chave, atual);
  }

  const registros = [...porChave.values()].map((r) => ({
    ...r,
    desvio: Math.round((r.realizado - r.meta) * 100) / 100,
  }));

  return { registros, avisos };
}

const COLUNAS_SAIDA_DESVIO = ['cidade_slug', 'cidade_origem', 'canal', 'tecnologia', 'mes_ref', 'meta', 'realizado', 'desvio'];

export function paraCsvDesvioPorCanal(registros) {
  const linhas = registros.map((r) =>
    [r.cidadeSlug, r.cidadeOrigem, r.canal, r.tecnologia, r.mesRef, r.meta, r.realizado, r.desvio].map(celulaCsv).join(','),
  );
  return [COLUNAS_SAIDA_DESVIO.join(','), ...linhas].join('\n') + '\n';
}