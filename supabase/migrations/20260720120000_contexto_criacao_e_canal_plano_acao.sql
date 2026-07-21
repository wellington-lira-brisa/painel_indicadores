-- Duas mudanças em planos_acao, pedidas juntas mas conceitualmente
-- independentes:
--
-- 1. CONTEXTO DE CRIAÇÃO (snapshot imutável): registra o cenário da
--    cidade no exato momento em que o plano foi criado — classificação,
--    até qual mês o score levava em conta, e quais indicadores
--    motivaram. Diferente de planos_acao_historico (que registra
--    MUDANÇAS ao longo da vida do plano), isso é um retrato único,
--    travado no nascimento, que nunca é reescrito depois. Por isso é
--    coluna na própria linha, não tabela filha — não existe "segunda
--    versão" de um contexto de criação.
--
-- 2. CANAL (opcional): mesmo raciocínio já usado pra indicador_id —
--    coluna nullable, sem FK (canal vem do pipeline de CSV, não é
--    entidade gerenciada no Supabase). NULL = plano vale pra cidade
--    inteira. Não é filtro de visibilidade — é só rótulo: o plano
--    aparece na tela da cidade independente do canal selecionado no
--    filtro; `canal` serve só pra análises futuras (ex.: "quantos
--    planos foram feitos especificamente pro canal PAP").

alter table public.planos_acao
  add column if not exists classificacao_no_momento text,
  add column if not exists periodo_referencia_fim date,
  add column if not exists indicadores_motivadores jsonb,
  add column if not exists canal text;

alter table public.planos_acao
  add constraint planos_acao_classificacao_valida
  check (classificacao_no_momento is null or classificacao_no_momento in ('vermelho', 'amarelo', 'verde', 'sem-dado'));

comment on column public.planos_acao.classificacao_no_momento is
  'Status da cidade (mesmo vocabulário de statusCidade() no front: vermelho/amarelo/verde/sem-dado) no momento em que o plano foi criado. Gravado uma única vez, no INSERT — nenhuma RPC de edição escreve nesta coluna. Nullable só por retrocompatibilidade com planos criados antes desta migration (não é possível reconstruir o contexto histórico deles).';

comment on column public.planos_acao.periodo_referencia_fim is
  'Até qual mês (inclusive) o score que gerou classificacao_no_momento levava em conta — equivalente ao último mês apurado entre os indicadores da cidade no momento da criação. Início do período é sempre janeiro do mesmo ano (o acumulado do painel nunca cruza ano).';

comment on column public.planos_acao.indicadores_motivadores is
  'Snapshot (array de objetos: indicador_id, nome, meta, realizado, atingimento, status) dos indicadores que compunham o score no momento da criação — o "porquê" por trás de classificacao_no_momento. Mesmo padrão de planos_acao_historico.alteracoes: jsonb porque o formato não precisa ser filtrado em SQL, só lido e exibido.';

comment on column public.planos_acao.canal is
  'Canal ao qual este plano se refere (LOJA, PAP, ONLINE, ...), quando o usuário optar por vincular. NULL = plano geral da cidade, não específico de um canal. Sem FK: canal é um valor livre vindo do pipeline de CSV (metas-por-canal.csv), não uma entidade gerenciada aqui — mesmo tratamento já dado a indicador_id. Não afeta visibilidade (o plano aparece na tela da cidade independente do filtro de canal ativo) — é só rótulo pra análises futuras.';

-- Substitui o índice anterior: cobre também "planos deste canal" sem
-- precisar de índice extra separado. cidade_id continua primeiro porque
-- toda consulta real já filtra por ele.
drop index if exists idx_planos_acao_cidade_tecnologia;
create index if not exists idx_planos_acao_cidade_tecnologia_canal
  on public.planos_acao (cidade_id, tecnologia_id, canal);

-- Pro relatório de efetividade futuro: "planos criados enquanto crítica"
-- vs "planos criados enquanto saudável" é uma consulta por essa coluna.
create index if not exists idx_planos_acao_classificacao_no_momento
  on public.planos_acao (classificacao_no_momento);

-- ---------------------------------------------------------------------
-- criar_plano_com_evidencias: os 3 campos de contexto entram como
-- obrigatórios (sem default), logo depois de p_quando_previsto — ANTES
-- da cadeia de parâmetros com default que já existia (p_evidencias em
-- diante), porque Postgres exige que todo parâmetro sem default venha
-- antes de qualquer parâmetro com default. p_canal entra no fim da
-- cadeia de defaults (opcional, é o único dos 4 que pode ficar de fora).
--
-- DROP + CREATE (não CREATE OR REPLACE): mudar a lista de parâmetros no
-- meio da assinatura exige isso — mesmo padrão já usado na migration
-- 20260710120000 quando esta função ganhou os campos de endereço.
-- ---------------------------------------------------------------------
drop function if exists public.criar_plano_com_evidencias(
  uuid, text, text, text, text, text, text, date,
  jsonb, numeric, numeric, numeric, text, timestamptz, text, text, text, text, text, text
);

create or replace function public.criar_plano_com_evidencias(
  p_id uuid,
  p_cidade_id text,
  p_tecnologia_id text,
  p_indicador_id text,
  p_o_que text,
  p_como text,
  p_quem text,
  p_quando_previsto date,
  p_classificacao_no_momento text,
  p_periodo_referencia_fim date,
  p_indicadores_motivadores jsonb,
  p_evidencias jsonb default '[]'::jsonb,
  p_evidencia_latitude numeric default null,
  p_evidencia_longitude numeric default null,
  p_evidencia_precisao_metros numeric default null,
  p_evidencia_endereco text default null,
  p_evidencia_capturada_em timestamptz default null,
  p_evidencia_numero text default null,
  p_evidencia_bairro text default null,
  p_evidencia_cidade text default null,
  p_evidencia_estado text default null,
  p_evidencia_cep text default null,
  p_evidencia_pais text default null,
  p_canal text default null
)
returns public.planos_acao
language plpgsql
security invoker
as $function$
declare
  plano public.planos_acao;
  evidencia jsonb;
  nova_localizacao_id uuid;
begin
  if jsonb_array_length(coalesce(p_evidencias, '[]'::jsonb)) > 0
     and (p_evidencia_latitude is null or p_evidencia_longitude is null) then
    raise exception 'Localização é obrigatória quando há evidências anexadas.';
  end if;

  if p_classificacao_no_momento not in ('vermelho', 'amarelo', 'verde', 'sem-dado') then
    raise exception 'Classificação inválida: %', p_classificacao_no_momento;
  end if;

  insert into public.planos_acao (
    id, cidade_id, tecnologia_id, indicador_id, o_que, como, quem, quando_previsto,
    classificacao_no_momento, periodo_referencia_fim, indicadores_motivadores, canal,
    criado_por, evidencia_latitude, evidencia_longitude, evidencia_precisao_metros,
    evidencia_endereco, evidencia_capturada_em, evidencia_numero, evidencia_bairro,
    evidencia_cidade, evidencia_estado, evidencia_cep, evidencia_pais
  )
  values (
    p_id, p_cidade_id, p_tecnologia_id, p_indicador_id, p_o_que, p_como, p_quem, p_quando_previsto,
    p_classificacao_no_momento, p_periodo_referencia_fim, p_indicadores_motivadores, p_canal,
    auth.uid(), p_evidencia_latitude, p_evidencia_longitude, p_evidencia_precisao_metros,
    p_evidencia_endereco, p_evidencia_capturada_em, p_evidencia_numero, p_evidencia_bairro,
    p_evidencia_cidade, p_evidencia_estado, p_evidencia_cep, p_evidencia_pais
  )
  returning * into plano;

  if jsonb_array_length(coalesce(p_evidencias, '[]'::jsonb)) > 0 then
    insert into public.planos_acao_evidencia_localizacoes (
      plano_id, latitude, longitude, precisao_metros, endereco, numero, bairro,
      cidade, estado, cep, pais, capturada_em, criado_por
    )
    values (
      plano.id, p_evidencia_latitude, p_evidencia_longitude, p_evidencia_precisao_metros,
      p_evidencia_endereco, p_evidencia_numero, p_evidencia_bairro, p_evidencia_cidade,
      p_evidencia_estado, p_evidencia_cep, p_evidencia_pais, coalesce(p_evidencia_capturada_em, now()),
      auth.uid()
    )
    returning id into nova_localizacao_id;
  end if;

  for evidencia in select * from jsonb_array_elements(coalesce(p_evidencias, '[]'::jsonb))
  loop
    insert into public.planos_acao_evidencias (plano_id, imagem_path, imagem_metadados, ordem, localizacao_id)
    values (
      plano.id,
      evidencia->>'imagem_path',
      evidencia->'imagem_metadados',
      coalesce((evidencia->>'ordem')::int, 0),
      nova_localizacao_id
    );
  end loop;

  select * into plano from public.planos_acao where id = plano.id;
  return plano;
end;
$function$;

revoke all on function public.criar_plano_com_evidencias(
  uuid, text, text, text, text, text, text, date, text, date, jsonb,
  jsonb, numeric, numeric, numeric, text, timestamptz, text, text, text, text, text, text, text
) from public;

grant execute on function public.criar_plano_com_evidencias(
  uuid, text, text, text, text, text, text, date, text, date, jsonb,
  jsonb, numeric, numeric, numeric, text, timestamptz, text, text, text, text, text, text, text
) to authenticated;