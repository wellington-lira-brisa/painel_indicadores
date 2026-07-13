-- Corrige um trade-off que eu tinha documentado (e o negócio não aceitou,
-- corretamente): localização vivia só como colunas em planos_acao —
-- cada novo "Anexar evidências" SOBRESCREVIA a localização anterior.
-- Pedido explícito agora: cada anexação deve preservar a SUA localização,
-- e a tela deve listar todas, mais antiga primeiro (nova aparece embaixo).
--
-- Modelagem: nova tabela planos_acao_evidencia_localizacoes (1 plano -> N
-- localizações, uma por "lote" de anexação) — mesmo padrão já usado por
-- planos_acao_evidencias e planos_acao_historico (tabela filha + RLS
-- espelhando o pai). `planos_acao_evidencias` ganha `localizacao_id`
-- (nullable, FK) pra cada evidência apontar pra localização do lote em
-- que foi anexada — sem isso, o lightbox não teria como saber qual
-- localização mostrar pra uma foto específica quando o plano já tem
-- várias localizações no histórico.
--
-- As colunas antigas (evidencia_latitude etc. em planos_acao) NÃO são
-- removidas: continuam sendo escritas com a localização MAIS RECENTE, por
-- retrocompatibilidade com qualquer leitura que ainda dependa de um valor
-- único — mas deixam de ser a fonte principal de exibição.

create table if not exists public.planos_acao_evidencia_localizacoes (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.planos_acao(id) on delete cascade,
  latitude numeric not null,
  longitude numeric not null,
  precisao_metros numeric,
  endereco text,
  numero text,
  bairro text,
  cidade text,
  estado text,
  cep text,
  pais text,
  capturada_em timestamptz not null default now(),
  criado_por uuid references public.colaboradores(id),
  criado_em timestamptz not null default now()
);

comment on table public.planos_acao_evidencia_localizacoes is
  'Histórico de localizações capturadas ao anexar evidências (1 por lote de anexação, na criação ou depois). Substitui as colunas evidencia_* de planos_acao como fonte de exibição — aquelas continuam existindo só com a localização mais recente, por retrocompatibilidade.';

create index if not exists idx_planos_acao_evid_localizacoes_plano_id
  on public.planos_acao_evidencia_localizacoes (plano_id, capturada_em);

alter table public.planos_acao_evidencia_localizacoes enable row level security;

create policy "evid_localizacoes_select_quem_ve_o_plano"
  on public.planos_acao_evidencia_localizacoes
  for select
  to authenticated
  using (exists (select 1 from public.planos_acao pa where pa.id = plano_id));

-- Mesma regra de quem pode inserir evidência (criador ou tem_permissao
-- editar_plano_acao) — localização e evidência são inseridas juntas, na
-- mesma chamada de RPC, então fazem sentido sob a mesma permissão.
create policy "evid_localizacoes_insert_dono_ou_editor"
  on public.planos_acao_evidencia_localizacoes
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.planos_acao pa
      where pa.id = plano_id
        and (pa.criado_por = auth.uid() or tem_permissao('editar_plano_acao'))
    )
  );

-- Vínculo evidência -> localização do lote em que foi anexada. Nullable:
-- evidências legadas (imagem_path único, ou linhas já existentes antes
-- desta migration) não têm como apontar retroativamente pra um lote.
alter table public.planos_acao_evidencias
  add column if not exists localizacao_id uuid references public.planos_acao_evidencia_localizacoes(id);

comment on column public.planos_acao_evidencias.localizacao_id is
  'Localização capturada no mesmo lote de anexação desta evidência. Null em evidências criadas antes desta migration.';

-- Backfill: planos que já têm localização única (evidencia_latitude etc.
-- em planos_acao) ganham UMA linha no histórico com esse valor, e todas
-- as evidências existentes desse plano passam a apontar pra ela — não é
-- 100% fiel ao que aconteceu de verdade (evidências antigas podem ter
-- vindo de anexações diferentes que só a versão anterior já tinha
-- colapsado numa localização só), mas é a melhor reconstrução possível a
-- partir do dado que já existia, e não perde a localização que já estava
-- lá.
do $$
declare
  linha record;
  nova_localizacao_id uuid;
begin
  for linha in
    select id, evidencia_latitude, evidencia_longitude, evidencia_precisao_metros,
           evidencia_endereco, evidencia_numero, evidencia_bairro, evidencia_cidade,
           evidencia_estado, evidencia_cep, evidencia_pais, evidencia_capturada_em, criado_por
    from public.planos_acao
    where evidencia_latitude is not null and evidencia_longitude is not null
  loop
    insert into public.planos_acao_evidencia_localizacoes (
      plano_id, latitude, longitude, precisao_metros, endereco, numero, bairro,
      cidade, estado, cep, pais, capturada_em, criado_por
    )
    values (
      linha.id, linha.evidencia_latitude, linha.evidencia_longitude, linha.evidencia_precisao_metros,
      linha.evidencia_endereco, linha.evidencia_numero, linha.evidencia_bairro, linha.evidencia_cidade,
      linha.evidencia_estado, linha.evidencia_cep, linha.evidencia_pais,
      coalesce(linha.evidencia_capturada_em, now()), linha.criado_por
    )
    returning id into nova_localizacao_id;

    update public.planos_acao_evidencias
    set localizacao_id = nova_localizacao_id
    where plano_id = linha.id and localizacao_id is null;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- criar_plano_com_evidencias: cria a primeira localização do histórico
-- ---------------------------------------------------------------------
create or replace function public.criar_plano_com_evidencias(
  p_id uuid,
  p_cidade_id text,
  p_tecnologia_id text,
  p_indicador_id text,
  p_o_que text,
  p_como text,
  p_quem text,
  p_quando_previsto date,
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
  p_evidencia_pais text default null
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

  insert into public.planos_acao (
    id, cidade_id, tecnologia_id, indicador_id, o_que, como, quem, quando_previsto,
    criado_por, evidencia_latitude, evidencia_longitude, evidencia_precisao_metros,
    evidencia_endereco, evidencia_capturada_em, evidencia_numero, evidencia_bairro,
    evidencia_cidade, evidencia_estado, evidencia_cep, evidencia_pais
  )
  values (
    p_id, p_cidade_id, p_tecnologia_id, p_indicador_id, p_o_que, p_como, p_quem, p_quando_previsto,
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

-- ---------------------------------------------------------------------
-- anexar_evidencias_plano: cria uma NOVA linha no histórico a cada
-- chamada, em vez de sobrescrever a localização anterior — é essa a
-- mudança pedida.
-- ---------------------------------------------------------------------
create or replace function public.anexar_evidencias_plano(
  p_plano_id uuid,
  p_evidencias jsonb,
  p_evidencia_latitude numeric,
  p_evidencia_longitude numeric,
  p_evidencia_precisao_metros numeric default null,
  p_evidencia_endereco text default null,
  p_evidencia_numero text default null,
  p_evidencia_bairro text default null,
  p_evidencia_cidade text default null,
  p_evidencia_estado text default null,
  p_evidencia_cep text default null,
  p_evidencia_pais text default null,
  p_evidencia_capturada_em timestamptz default null
)
returns public.planos_acao
language plpgsql
security invoker
as $function$
declare
  plano public.planos_acao;
  evidencia jsonb;
  proxima_ordem integer;
  nova_localizacao_id uuid;
begin
  if jsonb_array_length(coalesce(p_evidencias, '[]'::jsonb)) = 0 then
    raise exception 'Informe ao menos uma imagem para anexar.';
  end if;

  if p_evidencia_latitude is null or p_evidencia_longitude is null then
    raise exception 'Localização é obrigatória quando há evidências anexadas.';
  end if;

  -- Nova linha no histórico — NUNCA sobrescreve uma localização anterior
  -- deste plano. É a diferença central desta migration em relação à
  -- versão anterior desta função.
  insert into public.planos_acao_evidencia_localizacoes (
    plano_id, latitude, longitude, precisao_metros, endereco, numero, bairro,
    cidade, estado, cep, pais, capturada_em, criado_por
  )
  values (
    p_plano_id, p_evidencia_latitude, p_evidencia_longitude, p_evidencia_precisao_metros,
    p_evidencia_endereco, p_evidencia_numero, p_evidencia_bairro, p_evidencia_cidade,
    p_evidencia_estado, p_evidencia_cep, p_evidencia_pais, coalesce(p_evidencia_capturada_em, now()),
    auth.uid()
  )
  returning id into nova_localizacao_id;

  select coalesce(max(ordem), -1) + 1 into proxima_ordem
  from public.planos_acao_evidencias
  where plano_id = p_plano_id;

  for evidencia in select * from jsonb_array_elements(p_evidencias)
  loop
    insert into public.planos_acao_evidencias (plano_id, imagem_path, imagem_metadados, ordem, localizacao_id)
    values (p_plano_id, evidencia->>'imagem_path', evidencia->'imagem_metadados', proxima_ordem, nova_localizacao_id);
    proxima_ordem := proxima_ordem + 1;
  end loop;

  -- Colunas legadas em planos_acao continuam recebendo a MAIS RECENTE —
  -- retrocompatibilidade, não a fonte de exibição principal a partir de
  -- agora (ver comentário no topo da migration).
  update public.planos_acao
  set evidencia_latitude = p_evidencia_latitude,
      evidencia_longitude = p_evidencia_longitude,
      evidencia_precisao_metros = p_evidencia_precisao_metros,
      evidencia_endereco = p_evidencia_endereco,
      evidencia_numero = p_evidencia_numero,
      evidencia_bairro = p_evidencia_bairro,
      evidencia_cidade = p_evidencia_cidade,
      evidencia_estado = p_evidencia_estado,
      evidencia_cep = p_evidencia_cep,
      evidencia_pais = p_evidencia_pais,
      evidencia_capturada_em = coalesce(p_evidencia_capturada_em, now()),
      atualizado_por = auth.uid(),
      atualizado_em = now()
  where id = p_plano_id
  returning * into plano;

  if not found then
    raise exception 'Plano de ação não encontrado ou sem permissão para anexar evidências.';
  end if;

  return plano;
end;
$function$;