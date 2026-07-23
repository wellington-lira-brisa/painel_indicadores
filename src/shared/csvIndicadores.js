// ETL da base real de vendas (FTTH/5G) -> tabela indicadores_realizados.
//
// Este arquivo Ã© intencionalmente livre de I/O (sem fetch, sem fs, sem
// Supabase): recebe texto/objetos, devolve objetos. Isso Ã© o que permite
// testar validaÃ§Ã£o e normalizaÃ§Ã£o com `node --test` sem precisar de rede
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

// Ãšnico mapeamento servico+status_venda -> (tecnologia, indicador) que a
// base oficial hoje sustenta (ver RELATORIO.md, seÃ§Ã£o 5). Qualquer
// combinaÃ§Ã£o fora daqui Ã© uma linha "nÃ£o reconhecida": a validaÃ§Ã£o falha
// o workflow em vez de publicar um indicador inventado.
export const MAPA_INDICADOR = {
  '5G|Assinado': { tecnologia: '5g', indicadorId: 'ativacao' },
  'INTERNET|Criado': { tecnologia: 'ftth', indicadorId: 'orcamento' },
  'INTERNET|Efetivado': { tecnologia: 'ftth', indicadorId: 'efetivado' },
  'INTERNET|Instalado': { tecnologia: 'ftth', indicadorId: 'instalacao' },
};

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const VALOR_NAO_MAPEADO = 'NÃƒO MAPEADO';

/**
 * O export em produÃ§Ã£o usa `decimal=","` (padrÃ£o BR/Spark) â€” "3,5" deve
 * virar 3.5, nÃ£o NaN. SÃ³ troca vÃ­rgula por ponto quando nÃ£o hÃ¡ ponto jÃ¡
 * presente (evita quebrar um valor que por algum motivo jÃ¡ viesse com
 * ponto decimal).
 */
function paraNumero(texto) {
  if (typeof texto !== 'string') return Number(texto);
  const normalizado = texto.includes(',') && !texto.includes('.') ? texto.replace(',', '.') : texto;
  return Number(normalizado);
}

/** Descobre o separador olhando sÃ³ a primeira linha (cabeÃ§alho): conta ocorrÃªncias de cada candidato e usa o mais frequente. Cobre vÃ­rgula (padrÃ£o RFC4180), ponto e vÃ­rgula (comum em export BR, jÃ¡ que "," Ã© separador decimal) e tab. */
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

/** Parser CSV mÃ­nimo (RFC4180: aspas duplas e vÃ­rgula/quebra de linha dentro de campo), com separador auto-detectado. */
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
    const obj = { _linha: indice + 2 }; // +2 = 1 pelo header, 1 por Ã­ndice 1-based
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
 * "ARARIPINA / PE" -> "araripina-pe". Devolve null se nÃ£o der pra separar
 * cidade e UF (formato inesperado) â€” quem chama decide o que fazer (hoje:
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
 * Valida a base crua (linhas jÃ¡ parseadas do CSV, ainda como strings).
 * Devolve { erros, avisos }. `erros` nÃ£o vazio = workflow deve falhar e
 * preservar a Ãºltima versÃ£o publicada (ver publicar.mjs).
 */
export function validar(linhas) {
  const erros = [];
  const avisos = [];

  if (linhas.length === 0) {
    erros.push('Base vazia ou ilegÃ­vel.');
    return { erros, avisos };
  }

  const colunasPresentes = new Set(Object.keys(linhas[0]));
  for (const coluna of COLUNAS_OBRIGATORIAS) {
    if (!colunasPresentes.has(coluna)) erros.push(`Coluna obrigatÃ³ria ausente: ${coluna}`);
  }
  if (erros.length > 0) return { erros, avisos }; // sem colunas, nÃ£o faz sentido validar linha a linha

  const VOLUME_MINIMO_ESPERADO = 100;
  if (linhas.length < VOLUME_MINIMO_ESPERADO) {
    erros.push(`Volume de linhas abaixo do mÃ­nimo esperado (${linhas.length} < ${VOLUME_MINIMO_ESPERADO}).`);
  }

  const combinacoesConhecidas = new Set(Object.keys(MAPA_INDICADOR));
  const vistos = new Set(); // dedupe: linha inteira repetida
  const totalPorGrupoSemana = new Map(); // soma de realizado_semana por (mes,cidade,servico,status,canal,origem)
  const totalMensalPorGrupo = new Map(); // realizado_mes declarado por grupo

  let temFtth = false;
  let temCincoG = false;

  for (const l of linhas) {
    const idLinha = `linha ${l._linha}`;

    // nulos em colunas obrigatÃ³rias (cidade Ã© a Ãºnica que pode ser vazia â€” vira aviso, nÃ£o erro)
    for (const coluna of COLUNAS_OBRIGATORIAS) {
      if (coluna === 'cidade') continue;
      if (l[coluna] === '' || l[coluna] === undefined) {
        erros.push(`${idLinha}: valor ausente na coluna "${coluna}".`);
      }
    }
    if (!l.cidade) avisos.push(`${idLinha}: cidade nÃ£o informada.`);

    // datas
    if (!REGEX_DATA.test(l.mes_ref)) erros.push(`${idLinha}: mes_ref invÃ¡lida ("${l.mes_ref}").`);
    if (!REGEX_DATA.test(l.primeiro_dia_semana)) erros.push(`${idLinha}: primeiro_dia_semana invÃ¡lida.`);
    if (!REGEX_DATA.test(l.ultimo_dia_semana)) erros.push(`${idLinha}: ultimo_dia_semana invÃ¡lida.`);
    if (REGEX_DATA.test(l.primeiro_dia_semana) && REGEX_DATA.test(l.ultimo_dia_semana)) {
      if (l.primeiro_dia_semana > l.ultimo_dia_semana) {
        erros.push(`${idLinha}: primeiro_dia_semana posterior a ultimo_dia_semana.`);
      }
    }

    // combinaÃ§Ã£o servico+status conhecida
    const chave = `${l.servico}|${l.status_venda}`;
    if (!combinacoesConhecidas.has(chave)) {
      erros.push(`${idLinha}: combinaÃ§Ã£o servico/status_venda nÃ£o reconhecida ("${chave}").`);
    } else if (chave.startsWith('INTERNET')) {
      temFtth = true;
    } else {
      temCincoG = true;
    }

    // numÃ©ricos e negativos
    const semana = paraNumero(l.realizado_semana);
    const mensal = paraNumero(l.realizado_mes);
    if (l.realizado_semana === '' || Number.isNaN(semana)) {
      erros.push(`${idLinha}: realizado_semana nÃ£o Ã© numÃ©rico ("${l.realizado_semana}").`);
    } else if (semana < 0) {
      erros.push(`${idLinha}: realizado_semana negativo (${semana}).`);
    }
    if (l.realizado_mes === '' || Number.isNaN(mensal)) {
      erros.push(`${idLinha}: realizado_mes nÃ£o Ã© numÃ©rico ("${l.realizado_mes}").`);
    } else if (mensal < 0) {
      erros.push(`${idLinha}: realizado_mes negativo (${mensal}).`);
    }

    // duplicidade exata de linha
    const assinatura = COLUNAS_OBRIGATORIAS.map((c) => l[c]).join('\u0001');
    if (vistos.has(assinatura)) {
      erros.push(`${idLinha}: linha duplicada.`);
    }
    vistos.add(assinatura);

    // divergÃªncia semana x mÃªs (soma das semanas do mesmo grupo bate com realizado_mes?)
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

  if (!temFtth) erros.push('Base nÃ£o contÃ©m nenhum dado de FTTH (servico=INTERNET).');
  if (!temCincoG) erros.push('Base nÃ£o contÃ©m nenhum dado de 5G (servico=5G).');

  return { erros, avisos };
}

/**
 * Agrega linhas cruas (jÃ¡ validadas) em registros prontos pra
 * indicadores_realizados: soma canal_geral/origem, gera uma linha mensal
 * (semana_mes null) e uma por semana. Assume `validar()` sem erros â€”
 * chamar sem validar antes Ã© erro do chamador, nÃ£o algo que este cÃ³digo
 * deva adivinhar.
 */
export function normalizar(linhas) {
  const mensal = new Map(); // chave -> { cidadeOrigem, cidadeSlug, tecnologia, indicadorId, mesRef, valor }
  const semanal = new Map(); // chave -> idem + semanaMes

  for (const l of linhas) {
    const mapa = MAPA_INDICADOR[`${l.servico}|${l.status_venda}`];
    if (!mapa) continue; // jÃ¡ reportado por validar(); normalizar() nÃ£o republica erro

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
        // datas REAIS da semana, direto da base (nÃ£o os blocos fixos de 7
        // dias que o app usa pra semana fictÃ­cia â€” ver utils/semanas.js).
        // Ã‰ isso que corrige o rÃ³tulo errado da coluna de semana no front.
        primeiroDiaSemana: l.primeiro_dia_semana,
        ultimoDiaSemana: l.ultimo_dia_semana,
        valor: 0,
      });
    }

    // realizado_mes Ã© repetido em toda linha-semana do mesmo grupo (verificado
    // na validaÃ§Ã£o), entÃ£o soma-lo por canal aqui (nÃ£o por linha) evita
    // multiplicar o mensal pelo nÃºmero de semanas do mÃªs.
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
 * Mesma agregaÃ§Ã£o de `normalizar()`, mas SEM somar canal_geral â€” usada sÃ³
 * pra gerar o arquivo separado que alimenta o filtro de canal
 * (`indicadores-realizados-por-canal.csv`). Arquivo Ã  parte, nÃ£o uma
 * coluna a mais no arquivo principal, porque o caso comum (sem filtro de
 * canal) nÃ£o deve pagar o custo de um arquivo ~40x maior â€” ver
 * `indicadorRealizadoService.js`, que sÃ³ busca este aqui quando o filtro
 * de canal Ã© usado.
 *
 * O dedup de `realizado_mes` (repetido em toda linha-semana do mesmo mÃªs)
 * agora Ã© por "canal + origem" dentro da CHAVE MENSAL (que jÃ¡ inclui
 * canal) â€” antes era isso mesmo, sÃ³ que dentro de uma chave que somava
 * todos os canais juntos; aqui cada canal fica com sua prÃ³pria linha.
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
    // valor semanal nÃ£o se repete entre semanas (diferente do mensal), nÃ£o precisa de dedup.
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

/** Serializa a saÃ­da de `normalizarPorCanal()` â€” mesmo parser (`parsearCsv`) lÃª os dois arquivos, sÃ³ muda o conjunto de colunas. */
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
 * Colunas de metainformaÃ§Ã£o de cidade (gerÃªncia regional, gerente e
 * coordenaÃ§Ã£o) â€” opcionais: bases antigas sem essas colunas continuam
 * funcionando, sÃ³ nÃ£o geram metadado nenhum (front cai no que jÃ¡ tinha:
 * mock ou `null`, ver cidadeService.js). Nunca em COLUNAS_OBRIGATORIAS
 * por causa disso.
 *
 * Cada cidade deveria ter sÃ³ um valor de cada campo na base inteira (nÃ£o
 * Ã© algo que muda por semana/mÃªs). Se a base trouxer valores diferentes
 * pra uma mesma cidade â€” inconsistÃªncia de cadastro, nÃ£o erro de
 * parsing â€” mantÃ©m o primeiro valor nÃ£o-"NÃƒO MAPEADO" encontrado (ordem
 * de leitura do CSV) e devolve um aviso, sem derrubar o workflow: dado
 * de gerÃªncia Ã© complementar, nÃ£o pode bloquear a publicaÃ§Ã£o de vendas.
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
    if (!cidadeSlug) continue; // sem cidade mapeada: mesmo critÃ©rio de normalizar()

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
          `Cidade "${l.cidade}": valores divergentes em "${colunaOrigem}" ("${registro[campoDestino]}" vs "${bruto}") â€” mantendo o primeiro.`,
        );
      }
    }
  }

  return { registros: [...porCidade.entries()].map(([cidadeSlug, r]) => ({ cidadeSlug, ...r })), avisos };
}

const COLUNAS_SAIDA_METADADOS = ['cidade_slug', 'cidade_origem', 'gerencia_cidade', 'gerente_cidade', 'coordenacao'];

/** Serializa a saÃ­da de `normalizarMetadadosCidade()` â€” arquivo separado (`cidades-metadados.csv`) porque Ã© 1 linha por cidade, nÃ£o 1 por indicador/semana como `indicadores-realizados.csv`. */
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
 * Serializa a saÃ­da de `normalizar()` de volta pra CSV â€” Ã© o arquivo que
 * o workflow escreve em `public/dados/indicadores-realizados.csv` e que o
 * front lÃª com `parsearCsv()` (mesmo parser, mesmo shape de coluna: Ã© o
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
 * Metas de "Vendas Instaladas"/"Vendas Ativadas" por cidade/mÃªs â€” fonte
 * separada da base de vendas (arquivo prÃ³prio, formato:
 * `data,cidade,indicador,indicador_geral,servico,meta,categoria,...`).
 * Mesmo arquivo cobre as duas tecnologias hoje (a query de origem virou
 * `WHERE indicador_geral IN ('Vendas Instaladas', 'Vendas Ativadas')`) â€”
 * por isso a normalizaÃ§Ã£o em si vive numa funÃ§Ã£o compartilhada
 * (`normalizarMetasCidade`), e cada tecnologia sÃ³ declara o prÃ³prio
 * filtro. O filtro continua restrito e explÃ­cito: sÃ³ entra o que bate
 * `servico`+`indicadorGeral` exatos, `categoria === 'venda'`,
 * `stutus === 'Ativo'` â€” qualquer outra linha (FWA, Banda Larga,
 * indicador desativado) Ã© ignorada, nÃ£o misturada.
 *
 * `data` jÃ¡ vem como primeiro dia do mÃªs ("2026-01-01") â€” mesmo formato
 * de `mes_ref` no resto do pipeline, nÃ£o precisa conversÃ£o.
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
    if (!cidadeSlug) continue; // mesmo critÃ©rio do resto do pipeline: nunca inventa cidade

    const meta = paraNumero(l.meta);
    if (Number.isNaN(meta)) continue;

    const chave = cidadeSlug + '\u0001' + l.data;
    if (porChave.has(chave)) {
      const anterior = porChave.get(chave).meta;
      if (anterior !== meta) {
        avisos.push(`Cidade "${l.cidade}", mÃªs ${l.data}: meta divergente (${anterior} vs ${meta}) â€” mantendo a primeira.`);
      }
      continue;
    }
    porChave.set(chave, { cidadeOrigem: l.cidade, cidadeSlug, mesRef: l.data, meta });
  }

  return { registros: [...porChave.values()], avisos };
}

/** Meta Geral da Cidade â€” FTTH ("Vendas Instaladas"). Comportamento idÃªntico a antes da 5G existir. */
export function normalizarMetasInstalacaoFtth(linhas) {
  return normalizarMetasCidade(linhas, { servico: 'FTTH', indicadorGeral: 'Vendas Instaladas' });
}

/** Meta Geral da Cidade â€” 5G ("Vendas Ativadas"). Mesmo arquivo de origem que o FTTH, filtro prÃ³prio. */
export function normalizarMetasAtivacao5g(linhas) {
  return normalizarMetasCidade(linhas, { servico: '5G', indicadorGeral: 'Vendas Ativadas' });
}

const COLUNAS_SAIDA_METAS_INSTALACAO = ['cidade_slug', 'cidade_origem', 'mes_ref', 'meta'];

/** Serializa a saÃ­da de `normalizarMetasInstalacaoFtth()`/`normalizarMetasAtivacao5g()` â€” mesmo parser (`parsearCsv`) lÃª de volta. */
export function paraCsvMetasInstalacaoFtth(registros) {
  const linhas = registros.map((r) => [r.cidadeSlug, r.cidadeOrigem, r.mesRef, r.meta].map(celulaCsv).join(','));
  return [COLUNAS_SAIDA_METAS_INSTALACAO.join(','), ...linhas].join('\n') + '\n';
}

/** Mesmo formato de `paraCsvMetasInstalacaoFtth` â€” nome prÃ³prio sÃ³ pra deixar o output (`gerarBase.mjs`) explÃ­cito sobre qual arquivo estÃ¡ escrevendo. */
export const paraCsvMetasAtivacao5g = paraCsvMetasInstalacaoFtth;

/**
 * Lista oficial de cidades onde a operaÃ§Ã£o vende (FTTH/5G/FWA) â€” fonte de
 * ESCOPO do Ranking, diferente da base de vendas (que traz qualquer
 * cidade com atividade registrada, incluindo funil que nunca virou venda
 * â€” ver normalizarPorCanal/normalizar).
 *
 * DUAS fontes independentes, cada uma decide sua prÃ³pria tecnologia â€”
 * confirmado com o negÃ³cio (planilha "Cidades Atuais" Ã© sÃ³ 5G; FTTH tem
 * lista prÃ³pria separada, `cidades_ftth.csv`):
 *  - `cidades_ftth.csv`: lista fechada, 1 coluna (`cidade`, "Nome/UF") â€”
 *    presenÃ§a na lista = `vendeFtth: true`. Sem outro atributo.
 *  - `cidades_atuais.csv` (planilha "Cidades Atuais", 5G): colunas
 *    `atuais` (nome da cidade â€” usa essa, nÃ£o `cidades`), `servico`
 *    ("FTTH E 5G" | "5G ONLY" â€” aqui sÃ³ decide `vende5g`, nunca
 *    `vendeFtth`), `fwa` ("VENDENDO" | "PENDENTE"), `lancamento_comercial`
 *    (data yyyy-mm-dd de quando a cidade comeÃ§ou a vender comercialmente
 *    â€” vira o card "AtivaÃ§Ã£o comercial" da PaginaCidade).
 *
 * Cidade que sÃ³ existe numa das duas fontes entra mesmo assim (com a
 * tecnologia que nÃ£o tem fonte prÃ³pria em `false`); cidade nas duas
 * funde os dois lados. Formato invÃ¡lido/ausente vira `null` (mesmo
 * critÃ©rio de "â€”" do resto do painel), sem bloquear a publicaÃ§Ã£o.
 *
 * 1 linha por cidade (sem meses/perÃ­odo) â€” mais simples que
 * `normalizarMetadadosCidade`, nÃ£o precisa de agregaÃ§Ã£o por chave
 * composta.
 */
export function normalizarCidadesOficiais(linhasFtth, linhasAtuais5g) {
  const avisos = [];
  const porCidade = new Map();
  const vistasFtth = new Set();
  const vistasAtuais = new Set();

  // FTTH: lista fechada, sÃ³ nome de cidade (`cidade_ftth.csv`) â€” nenhum
  // outro atributo vem daqui. Confirmado com o negÃ³cio: a coluna
  // `servico` de cidades_atuais.csv NÃƒO decide mais FTTH (aquele arquivo
  // Ã© sÃ³ 5G â€” "FTTH E 5G" ali significa "essa cidade 5G tambÃ©m tem FTTH
  // pela lista prÃ³pria", nÃ£o o contrÃ¡rio).
  for (const l of linhasFtth) {
    const cidadeSlug = normalizarCidade(l.cidade);
    if (!cidadeSlug) continue; // mesmo critÃ©rio do resto do pipeline: nunca inventa cidade

    if (vistasFtth.has(cidadeSlug)) {
      avisos.push(`Cidade "${l.cidade}" aparece mais de uma vez na base FTTH â€” mantendo a primeira ocorrÃªncia.`);
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

  // 5G (cidades_atuais.csv): dÃ¡ vende5g, FWA e lanÃ§amento comercial. Uma
  // cidade que jÃ¡ veio da lista FTTH sÃ³ recebe o que falta (nunca reduz
  // vendeFtth pra false); uma cidade nova (sÃ³ 5G) entra do zero.
  for (const l of linhasAtuais5g) {
    const cidadeSlug = normalizarCidade(l.atuais);
    if (!cidadeSlug) continue;

    if (vistasAtuais.has(cidadeSlug)) {
      avisos.push(`Cidade "${l.atuais}" aparece mais de uma vez na base de cidades atuais (5G) â€” mantendo a primeira ocorrÃªncia.`);
      continue;
    }
    vistasAtuais.add(cidadeSlug);

    const vende5gAqui = l.servico === 'FTTH E 5G' || l.servico === '5G ONLY';
    const lancamentoComercial = REGEX_DATA.test(l.lancamento_comercial) ? l.lancamento_comercial : null;
    if (l.lancamento_comercial && !lancamentoComercial) {
      avisos.push(`Cidade "${l.atuais}": lancamento_comercial invÃ¡lida ("${l.lancamento_comercial}") â€” exibindo "â€”".`);
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

/** Serializa a saÃ­da de `normalizarCidadesOficiais()` â€” mesmo parser (`parsearCsv`) lÃª de volta. */
export function paraCsvCidadesOficiais(registros) {
  const linhas = registros.map((r) =>
    [r.cidadeSlug, r.cidadeOrigem, r.vendeFtth, r.vende5g, r.vendeFwa, r.lancamentoComercial].map(celulaCsv).join(','),
  );
  return [COLUNAS_SAIDA_CIDADES_OFICIAIS.join(','), ...linhas].join('\n') + '\n';
}

/**
 * Meta por canal â€” DIFERENTE da Meta Geral da Cidade
 * (normalizarMetasInstalacaoFtth/normalizarMetasAtivacao5g, acima): fonte
 * prÃ³pria, granularidade prÃ³pria (cidade+canal+mÃªs, nÃ£o sÃ³ cidade+mÃªs), e
 * os nÃºmeros NÃƒO precisam bater entre si â€” sÃ£o conceitos distintos
 * confirmados com o negÃ³cio (Meta Geral da Cidade alimenta Ranking/score;
 * Meta por Canal alimenta a Meta do Indicador na tabela da cidade,
 * filtrÃ¡vel pelo SeletorCanais).
 *
 * Cobre 4 categorias hoje, cada uma Ã© a soma de um subconjunto de
 * indicadores do DicionÃ¡rio de Metas â€” o mesmo indicador nunca pertence a
 * mais de uma categoria:
 *  - "orcamento" (Criado): Vendas criadas Combo 1 Chip/Combo 2+ Chip/avulso
 *  - "efetivado" (Efetivado): Vendas efetivadas Combo 1 Chip/Combo 2+ Chip/avulso
 *  - "instalacao" (Instalado): Vendas instalada(s) Combo/Combo 1 Chip/Combo 2+ Chip/avulso
 *  - "ativacao" (Ativado 5G): "AtivaÃ§Ã£o 5G avulso" OU "Vendas Ativadas - 5G",
 *    dependendo do canal â€” ver INDICADOR_ATIVACAO_POR_CANAL, abaixo.
 *
 * Duas bases de entrada:
 *  - DicionÃ¡rio de Metas: 1 linha por mÃªsÃ—indicadorÃ—canal (o dicionÃ¡rio
 *    ganhou a coluna canal, mas o multiplicador NUNCA varia por canal pro
 *    mesmo indicador+mÃªs â€” validado nas 587 linhas atuais â€” por isso o
 *    Ã­ndice de multiplicador continua ignorando canal).
 *  - Fato de Metas por vendedor: 1 linha por vendedorÃ—mÃªsÃ—indicadorÃ—canal,
 *    dÃ¡ a meta-base e a cidade/canal daquele vendedor.
 *
 * Regra de negÃ³cio (confirmada): multiplicador = max(FTTH, FWA, 5G) da
 * linha do dicionÃ¡rio correspondente (chave: data+indicador); meta
 * calculada = meta-base Ã— multiplicador; a meta final por
 * cidade+canal+categoria+mÃªs Ã© a SOMA das metas calculadas de todo
 * indicador daquela categoria (ver MAPA_INDICADOR_PARA_CATEGORIA_META),
 * respeitando a regra de indicador-por-canal da AtivaÃ§Ã£o 5G.
 */
const INDICADORES_POR_CATEGORIA_META = {
  orcamento: ['Vendas criadas Combo 1 Chip - FTTH', 'Vendas criadas Combo 2+ Chip - FTTH', 'Vendas criadas avulso - FTTH'],
  efetivado: ['Vendas efetivadas Combo 1 Chip - FTTH', 'Vendas efetivadas Combo 2+ Chip - FTTH', 'Vendas efetivadas avulso - FTTH'],
  instalacao: [
    'Vendas instalada Combo - FTTH',
    'Vendas instaladas Combo 1 Chip - FTTH',
    'Vendas instaladas Combo 2+ Chip - FTTH',
    'Vendas instaladas avulso - FTHH', // grafia real da fonte (typo consistente no dicionÃ¡rio e na fato)
    'Vendas instaladas avulso - Banda Larga', // confirmado com o negÃ³cio (reuniÃ£o 20/07/2026): conta como Instalado FTTH; dicionÃ¡rio corrigido na fonte pra dar FTTH=1 pra esse indicador (sem override no cÃ³digo)
  ],
  // Os dois indicadores de ativaÃ§Ã£o 5G â€” qual vale pra qual canal Ã©
  // decidido por INDICADOR_ATIVACAO_POR_CANAL, nÃ£o pelo simples
  // pertencimento a essa lista (diferente das outras 3 categorias).
  ativacao: ['AtivaÃ§Ã£o 5G avulso', 'Vendas Ativadas - 5G'],
};

/** "Vendas criadas avulso - FTTH" -> "orcamento", etc. ConstruÃ­do uma vez a partir de INDICADORES_POR_CATEGORIA_META â€” nunca mantido Ã  mÃ£o em paralelo. */
const MAPA_INDICADOR_PARA_CATEGORIA_META = new Map(
  Object.entries(INDICADORES_POR_CATEGORIA_META).flatMap(([categoria, indicadores]) =>
    indicadores.map((indicador) => [indicador, categoria]),
  ),
);

/**
 * Confirmado com o negÃ³cio: a fonte reporta "AtivaÃ§Ã£o 5G avulso" E "Vendas
 * Ativadas - 5G" simultaneamente pro canal ONLINE, com valores mensais
 * diferentes (nÃ£o Ã© o mesmo evento duplicado) â€” mas cada canal usa sÃ³ o
 * indicador que "pertence" a ele, nunca soma os dois. ONLINE Ã© o Ãºnico
 * canal com indicador prÃ³prio (`Vendas Ativadas - 5G`) hoje; todo outro
 * canal (inclusive canal novo que apareÃ§a no futuro) cai no padrÃ£o
 * (`AtivaÃ§Ã£o 5G avulso`) â€” Ã© assim que a fonte reporta pra eles.
 */
const INDICADOR_ATIVACAO_POR_CANAL = { ONLINE: 'Vendas Ativadas - 5G' };
const INDICADOR_ATIVACAO_PADRAO = 'AtivaÃ§Ã£o 5G avulso';

/** Indicador de ativaÃ§Ã£o que reporta pro canal errado (ex.: "AtivaÃ§Ã£o 5G avulso" registrado sob ONLINE, que usa o indicador prÃ³prio) Ã© excluÃ­do â€” nÃ£o Ã© erro, Ã© o indicador do canal vizinho vazando na mesma fonte. */
function indicadorAtivacaoPertenceAoCanal(indicador, canal) {
  const esperado = INDICADOR_ATIVACAO_POR_CANAL[canal] ?? INDICADOR_ATIVACAO_PADRAO;
  return indicador === esperado;
}

/**
 * DicionÃ¡rio -> Map("mesRef\u0001indicador" -> multiplicador). Uma linha
 * por canal Ã© esperado agora (o dicionÃ¡rio ganhou a coluna canal) â€” sÃ³
 * gera aviso se o MESMO indicador+mÃªs tiver multiplicador DIFERENTE entre
 * canais (o que nunca deveria acontecer, validado hoje), nÃ£o a cada
 * repetiÃ§Ã£o normal.
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
          `DicionÃ¡rio de metas: indicador "${l.indicador}" no mÃªs ${l.data} tem multiplicador divergente entre canais (${anterior} vs ${multiplicador}, canal "${l.canal}") â€” mantendo o primeiro.`,
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
 * cidade+canal+categoria+mÃªs (soma de todo indicador daquela categoria,
 * jÃ¡ multiplicado). Linha sem cidade mapeÃ¡vel (`normalizarCidade` devolve
 * null) fica de fora da tabela por cidade â€” mesmo critÃ©rio do resto do
 * pipeline, nunca inventa cidade. Linha cujo indicador nÃ£o tem regra no
 * dicionÃ¡rio pro mÃªs vira aviso e Ã© descartada (auditÃ¡vel, nÃ£o silenciosa).
 * Linha cujo indicador nÃ£o pertence a nenhuma categoria conhecida Ã©
 * ignorada silenciosamente â€” Ã© o comportamento esperado pra qualquer
 * indicador da fato que ainda nÃ£o tem meta por canal (ex.: Churn, Ticket
 * MÃ©dio), nÃ£o um erro. Linha de ativaÃ§Ã£o 5G que reporta pro indicador do
 * canal errado (ver indicadorAtivacaoPertenceAoCanal) tambÃ©m Ã© ignorada
 * silenciosamente, mesmo critÃ©rio.
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
      avisos.push(`Meta invÃ¡lida: cidade "${l.cidade}", canal "${l.canal}", indicador "${l.indicador}", mÃªs ${l.data}.`);
      continue;
    }

    const chaveDicionario = l.data + '\u0001' + l.indicador;
    const multiplicador = indiceMultiplicadores.get(chaveDicionario);
    if (multiplicador === undefined) {
      avisos.push(`Sem regra no dicionÃ¡rio pro indicador "${l.indicador}" no mÃªs ${l.data} â€” linha descartada.`);
      continue;
    }

    const cidadeSlug = normalizarCidade(l.cidade);
    if (!cidadeSlug) continue; // sem cidade mapeÃ¡vel: fica fora da tabela por cidade (mesmo critÃ©rio de sempre)

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

/** Serializa a saÃ­da de `normalizarMetaPorCanal()` â€” `indicador_id` agora vem do prÃ³prio registro (orcamento/efetivado/instalacao/ativacao), nÃ£o Ã© mais fixo. */
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
 * Valida a base de dias Ãºteis (fonte de verdade do calendÃ¡rio comercial
 * pro rateio semanal de Meta do Indicador â€” ver utils/diasUteis.js).
 * NÃƒO reconcilia com o motor de feriados (vendor/feriados) â€” sÃ£o
 * calendÃ¡rios com propÃ³sitos diferentes, jÃ¡ confirmado que divergem em
 * datas reais (ver comentÃ¡rio em utils/diasUteis.js); esta validaÃ§Ã£o sÃ³
 * garante que o ARQUIVO em si estÃ¡ bem formado, nÃ£o que concorda com
 * outra fonte.
 */
export function validarDiasUteis(linhas) {
  const erros = [];
  const avisos = [];

  if (linhas.length === 0) {
    erros.push('Base de dias Ãºteis vazia.');
    return { erros, avisos };
  }

  for (const coluna of COLUNAS_DIAS_UTEIS) {
    if (!(coluna in linhas[0])) {
      erros.push(`Coluna obrigatÃ³ria "${coluna}" ausente no cabeÃ§alho.`);
    }
  }
  if (erros.length > 0) return { erros, avisos }; // sem as colunas certas, nem vale checar linha a linha

  for (const l of linhas) {
    if (!REGEX_DATA_ISO.test(l.data)) {
      erros.push(`Linha ${l._linha}: data "${l.data}" fora do formato AAAA-MM-DD.`);
    }
    if (l.UF !== '' && !REGEX_UF.test(l.UF)) {
      avisos.push(
        `Linha ${l._linha}: UF "${l.UF}" nÃ£o Ã© uma sigla de 2 letras â€” linha serÃ¡ ignorada no rateio (UF vazia ou invÃ¡lida nunca casa com nenhuma cidade).`,
      );
    }
    if (l.dias_trabalhado !== '' && Number.isNaN(Number(l.dias_trabalhado))) {
      erros.push(`Linha ${l._linha}: dias_trabalhado "${l.dias_trabalhado}" nÃ£o Ã© numÃ©rico.`);
    }
    if (erros.length > 50) break;
  }

  return { erros: erros.slice(0, 50), avisos: avisos.slice(0, 50) };
}

/** Re-serializa a base de dias Ãºteis (pass-through validado): mesmas
 * colunas, ordem e nomes â€” mas via `celulaCsv` (quoting seguro) e sem
 * BOM, mesmo que a fonte baixada tenha vindo com um (Excel/Sheets geram
 * BOM com frequÃªncia â€” `parsearCsv` jÃ¡ tolera isso na leitura, mas
 * publicar jÃ¡ limpo evita depender disso em quem mais vier a ler o
 * arquivo, incluindo abrir num editor de planilha manualmente). */
export function paraCsvDiasUteis(linhas) {
  const corpo = linhas.map((l) => COLUNAS_DIAS_UTEIS.map((coluna) => celulaCsv(l[coluna])).join(','));
  return [COLUNAS_DIAS_UTEIS.join(','), ...corpo].join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Sistema de Quintil (performance individual dos vendedores -> cidade)
// ---------------------------------------------------------------------------

/** Categoria de venda -> tecnologia da pÃ¡gina que a consome. */
const TECNOLOGIA_POR_CATEGORIA_META = { orcamento: 'ftth', efetivado: 'ftth', instalacao: 'ftth', ativacao: '5g' };

/**
 * Faixas de quintil definidas pelo negÃ³cio (percentual de atingimento da
 * meta): 1Âº â‰¥100% Â· 2Âº â‰¥80% Â· 3Âº â‰¥60% Â· 4Âº â‰¥30% Â· 5Âº <30%.
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
 * Fato de metas+realizado por vendedor -> distribuiÃ§Ã£o de quintis por
 * cidade+tecnologia+mÃªs. A mesma passagem tambÃ©m devolve uma saÃ­da
 * individual enxuta por canal para a pÃ¡gina da cidade e para o Ranking:
 * identificador opaco local, nome, canal, meta, realizado, atingimento e
 * quintil. MatrÃ­cula e hash continuam restritos ao ETL e nunca sÃ£o
 * publicados.
 *
 * Atingimento do vendedor (regra fechada com o negÃ³cio): soma de
 * realizado Ã· soma de metaÃ—multiplicador das linhas de VENDA dele na
 * tecnologia â€” exatamente os mesmos indicadores/multiplicadores/regra de
 * ativaÃ§Ã£o-por-canal do pipeline de Meta por Canal
 * (MAPA_INDICADOR_PARA_CATEGORIA_META etc.). Todas essas linhas sÃ£o
 * Qtd/"Maior melhor" (validado na base), entÃ£o a soma Ã© homogÃªnea.
 * Churn/Ticket/Portabilidade ficam de fora por design, como no pipeline
 * de meta. Quintil da cidade = quintil da MÃ‰DIA SIMPLES dos atingimentos
 * dos vendedores dela (decisÃ£o registrada: com times de 1â€“3 pessoas,
 * ponderaÃ§Ã£o Ã© pseudo-precisÃ£o; a nuance fica no TAM exposto ao lado).
 *
 * Vendedor presente no mÃªs/cidade mas sem NENHUMA linha de venda vÃ¡lida
 * em NENHUMA tecnologia entra em `sem_meta` nas DUAS â€” Ã© o Ãºnico caso
 * genuinamente ambÃ­guo. Vendedor que vende sÃ³ a OUTRA tecnologia (ex.:
 * sÃ³ 5G) fica de fora inteiramente do bucket desta â€” ele nÃ£o Ã© "sem
 * meta de FTTH", sÃ³ nÃ£o pertence a esse funil; contÃ¡-lo infolaria o
 * total e o "sem meta" com gente de outro time (achado real na base:
 * Juazeiro do Norte/CE tem vendedores sÃ³-FTTH, sÃ³-5G e ambos no mesmo
 * mÃªs). Isso garante que a soma das faixas SEMPRE bate com o total
 * PUBLICADO da tecnologia (mesma liÃ§Ã£o do "158 vs 161" do ranking, agora
 * aplicada por tecnologia). Linha de venda com meta 0 (existem 46 na
 * base) Ã© descartada do atingimento com aviso, nunca vira divisÃ£o por
 * zero. Linha sem regra no dicionÃ¡rio pro mÃªs: aviso + descarte, mesmo
 * contrato de normalizarMetaPorCanal.
 */
export function normalizarQuintisPorCidade(linhasFato, indiceMultiplicadores) {
  const avisos = [];
  // vendedor(hash) x cidade x tecnologia x mÃªs -> { meta, realizado } (soma das linhas de venda)
  const somasPorVendedor = new Map();
  // Mesma soma, preservando o canal. Ã‰ a fonte do recÃ¡lculo exato quando
  // um ou vÃ¡rios canais sÃ£o selecionados no painel.
  const somasPorVendedorCanal = new Map();
  // Nome de exibiÃ§Ã£o do vendedor. A chave inclui cidade+mÃªs porque a mesma
  // pessoa pode mudar de lotaÃ§Ã£o ou ter o nome corrigido entre competÃªncias.
  const nomesPorVendedor = new Map();
  // Todo vendedor visto em cada cidade+mÃªs (mesmo sem linha de venda),
  // guardando tecnologias vÃ¡lidas no total e dentro de cada canal.
  const vendedoresPorCidadeMes = new Map();
  const cidadeOrigemPorSlug = new Map();

  for (const l of linhasFato) {
    const cidadeSlug = normalizarCidade(l.cidade);
    if (!cidadeSlug) continue; // sem cidade mapeÃ¡vel: fora, mesmo critÃ©rio de todo o pipeline
    cidadeOrigemPorSlug.set(cidadeSlug, l.cidade);

    const chaveCidadeMes = cidadeSlug + '\u0001' + l.data;
    if (!vendedoresPorCidadeMes.has(chaveCidadeMes)) vendedoresPorCidadeMes.set(chaveCidadeMes, new Map());
    const vendedoresDoMes = vendedoresPorCidadeMes.get(chaveCidadeMes);
    if (!vendedoresDoMes.has(l.hash_user)) {
      vendedoresDoMes.set(l.hash_user, { tecnologias: new Set(), canais: new Map() });
    }
    const contextoVendedor = vendedoresDoMes.get(l.hash_user);
    const canal = l.canal || 'SEM CANAL';
    if (!contextoVendedor.canais.has(canal)) contextoVendedor.canais.set(canal, new Set());
    nomesPorVendedor.set(
      l.hash_user + '\u0001' + chaveCidadeMes,
      String(l.vendedor ?? '').trim() || 'Vendedor sem identificaÃ§Ã£o',
    );

    const categoria = MAPA_INDICADOR_PARA_CATEGORIA_META.get(l.indicador);
    if (!categoria) continue; // nÃ£o Ã© indicador de venda (churn/ticket/...): conta sÃ³ pro total do time

    if (categoria === 'ativacao' && !indicadorAtivacaoPertenceAoCanal(l.indicador, canal)) continue;

    const meta = paraNumero(l.meta);
    const realizado = paraNumero(l.realizado);
    if (Number.isNaN(meta) || Number.isNaN(realizado)) {
      avisos.push(`Quintil: meta/realizado invÃ¡lido â€” cidade "${l.cidade}", indicador "${l.indicador}", mÃªs ${l.data}.`);
      continue;
    }
    if (meta === 0) {
      avisos.push(`Quintil: meta 0 descartada â€” cidade "${l.cidade}", indicador "${l.indicador}", mÃªs ${l.data}.`);
      continue;
    }

    const multiplicador = indiceMultiplicadores.get(l.data + '\u0001' + l.indicador);
    if (multiplicador === undefined) {
      avisos.push(`Quintil: sem regra no dicionÃ¡rio pro indicador "${l.indicador}" no mÃªs ${l.data} â€” linha descartada.`);
      continue;
    }

    const tecnologia = TECNOLOGIA_POR_CATEGORIA_META[categoria];
    contextoVendedor.tecnologias.add(tecnologia);
    contextoVendedor.canais.get(canal).add(tecnologia);

    const chave = l.hash_user + '\u0001' + cidadeSlug + '\u0001' + tecnologia + '\u0001' + l.data;
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

  // Agrega por cidade+tecnologia+mÃªs
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

      for (const [hash, contextoVendedor] of vendedoresDoMes) {
        const tecnologiasComVenda = contextoVendedor.tecnologias;
        // Vendedor sÃ³ entra no bucket desta tecnologia se vende ELA, ou se
        // nÃ£o vende NENHUMA das duas (ambÃ­guo â€” conta como "sem meta" nos
        // dois buckets, Ã© o Ãºnico caso genuinamente indefinido). Quem
        // vende sÃ³ a OUTRA tecnologia fica de fora inteiramente: nÃ£o Ã©
        // "sem meta de FTTH" â€” ele simplesmente nÃ£o Ã© FTTH, contÃ¡-lo aqui
        // infla o time e o "sem meta" com gente de outro funil.
        const vendeEstaTecnologia = tecnologiasComVenda.has(tecnologia);
        const naoVendeNenhumaTecnologia = tecnologiasComVenda.size === 0;
        if (!vendeEstaTecnologia && !naoVendeNenhumaTecnologia) continue;

        total += 1;
        const somas = somasPorVendedor.get(hash + '\u0001' + cidadeSlug + '\u0001' + tecnologia + '\u0001' + mesRef);
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

      // ReconciliaÃ§Ã£o embutida: por construÃ§Ã£o q1..q5 + semMeta === total;
      // qualquer divergÃªncia aqui Ã© bug de cÃ³digo, nÃ£o de dado â€” checagem barata que trava publicaÃ§Ã£o errada.
      const somaFaixas = contagem[1] + contagem[2] + contagem[3] + contagem[4] + contagem[5] + semMeta;
      if (somaFaixas !== total) {
        throw new Error(`Quintil: reconciliaÃ§Ã£o falhou em ${cidadeSlug}/${tecnologia}/${mesRef}: faixas=${somaFaixas} total=${total}.`);
      }

      if (comAtingimento === 0) continue; // nenhum vendedor com venda nessa tecnologia nesse mÃªs: nÃ£o publica linha vazia

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

    // Duas linhas por vendedorÃ—canal (FTTH e 5G). A ausÃªncia de soma fica
    // explÃ­cita como null para o front poder distinguir "sem venda nesta
    // tecnologia" de "venda sÃ³ na outra tecnologia" depois de combinar
    // qualquer subconjunto de canais.
    let sequenciaVendedor = 0;
    for (const [hash, contextoVendedor] of vendedoresDoMes) {
      sequenciaVendedor += 1;
      const vendedorId = `v${sequenciaVendedor}`;
      const vendedor = nomesPorVendedor.get(hash + '\u0001' + chaveCidadeMes) ?? 'Vendedor sem identificaÃ§Ã£o';

      for (const canal of contextoVendedor.canais.keys()) {
        for (const tecnologia of ['ftth', '5g']) {
          const chaveCanal =
            hash + '\u0001' + cidadeSlug + '\u0001' + tecnologia + '\u0001' + mesRef + '\u0001' + canal;
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
 * Recalcula vendedores e distribuiÃ§Ã£o da cidade depois de combinar os
 * canais selecionados. A classificaÃ§Ã£o usa as mesmas faixas e a mesma
 * fÃ³rmula do agregado publicado: Î£realizado Ã· Î£meta por vendedor e mÃ©dia
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
        vendedor: l.vendedor || 'Vendedor sem identificaÃ§Ã£o',
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

/** Serializa a saÃ­da agregada de `normalizarQuintisPorCidade()`. */
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

/** Serializa o detalhamento usado apenas na pÃ¡gina da cidade. */
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
 * cidade Ã— canal Ã— tecnologia Ã— mÃªs, usando APENAS os indicadores
 * principais de venda de cada tecnologia (InstalaÃ§Ã£o no FTTH, AtivaÃ§Ã£o
 * no 5G â€” mesma classificaÃ§Ã£o do pipeline de Meta por Canal).
 *
 * Desvio = Î£realizado âˆ’ Î£meta (por canal Ã— cidade Ã— mÃªs). Valor
 * negativo = canal abaixo da meta (dÃ©ficit); positivo = acima (superÃ¡vit).
 * NÃ£o usa multiplicador do dicionÃ¡rio: aqui o objetivo Ã© o desvio em
 * unidades reais (instalaÃ§Ãµes/ativaÃ§Ãµes absolutas), nÃ£o a meta ponderada
 * usada no atingimento do painel â€” sÃ£o grandezas distintas com propÃ³sitos
 * distintos. Meta 0 e canal-lixo descartados (mesmo critÃ©rio dos outros
 * pipelines). Cidade nÃ£o mapeÃ¡vel fica fora (sem slug = sem cidade).
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
      avisos.push(`Desvio: meta/realizado invÃ¡lido â€” cidade "${l.cidade}", canal "${canal}", indicador "${l.indicador}", mÃªs ${l.data}.`);
      continue;
    }
    if (meta === 0) continue; // meta 0: descarta sem aviso (ruÃ­do esperado, jÃ¡ documentado)

    const tecnologia = TECNOLOGIA_POR_CATEGORIA_META[categoria];
    // Agrupa orÃ§amento/efetivado/instalaÃ§Ã£o todos em 'instalacao' como indicador Ãºnico da pÃ¡gina FTTH;
    // ativaÃ§Ã£o em '5g'. O usuÃ¡rio vÃª "InstalaÃ§Ã£o" ou "AtivaÃ§Ã£o" â€” nÃ£o a subdivisÃ£o interna.
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