-- Desacopla a criação do Plano de Ação da anexação de evidências. Hoje só
-- existe um caminho de escrita de evidência (criar_plano_com_evidencias, na
-- criação); esta migration adiciona o segundo caminho — anexar depois — sem
-- alterar o primeiro em nada que já funciona. A própria migration anterior
-- (20260709130000) já deixou isto anotado como pendência:
--   "Se um fluxo de 'adicionar evidência depois' for criado no futuro, esta
--    policy provavelmente precisa ser revisada."
-- É exatamente isso que este arquivo faz.

-- ---------------------------------------------------------------------
-- 1. Endereço estruturado
-- ---------------------------------------------------------------------
-- evidencia_endereco (texto livre, "display_name" do geocoder) já existe
-- desde a migration anterior e continua — é o formato mais legível pra
-- mostrar de primeira. Estas colunas novas são os componentes separados,
-- pedido explícito do negócio pra auditoria (poder filtrar/conferir bairro,
-- cidade etc. individualmente, não só o texto inteiro).
alter table public.planos_acao
  add column if not exists evidencia_numero text,
  add column if not exists evidencia_bairro text,
  add column if not exists evidencia_cidade text,
  add column if not exists evidencia_estado text,
  add column if not exists evidencia_cep text,
  add column if not exists evidencia_pais text;

comment on column public.planos_acao.evidencia_numero is 'Número do endereço da localização capturada, quando o geocoder devolve. Ver evidencia_latitude.';
comment on column public.planos_acao.evidencia_bairro is 'Bairro da localização capturada. Ver evidencia_latitude.';
comment on column public.planos_acao.evidencia_cidade is 'Cidade da localização capturada (pode divergir da cidade do plano — é onde o colaborador estava, não a cidade cadastrada). Ver evidencia_latitude.';
comment on column public.planos_acao.evidencia_estado is 'Estado (UF) da localização capturada. Ver evidencia_latitude.';
comment on column public.planos_acao.evidencia_cep is 'CEP da localização capturada. Ver evidencia_latitude.';
comment on column public.planos_acao.evidencia_pais is 'País da localização capturada. Ver evidencia_latitude.';

-- ---------------------------------------------------------------------
-- 2. Flag "tem evidência" — pendência visível sem custo de leitura
-- ---------------------------------------------------------------------
-- Denormalizado de propósito: a listagem de planos (COLUNAS_PLANO_LISTA no
-- client) é otimizada pra nunca fazer join com planos_acao_evidencias
-- (comentário já existente no service: "Buscar isso na lista é over-fetch").
-- Sem esta coluna, mostrar "evidências pendentes" na listagem exigiria
-- exatamente esse join que o projeto deliberadamente evita. Um boolean
-- mantido por trigger resolve isso sem custo nenhum de leitura.
alter table public.planos_acao
  add column if not exists tem_evidencias boolean not null default false;

comment on column public.planos_acao.tem_evidencias is
  'true quando o plano tem ao menos uma evidência (nova tabela planos_acao_evidencias OU o imagem_path legado). Mantida por trigger — nunca escrita diretamente pelo client.';

-- Backfill: planos que já têm evidência (legada ou na tabela nova) mas
-- foram criados antes desta coluna existir.
update public.planos_acao pa
set tem_evidencias = true
where pa.imagem_path is not null
   or exists (select 1 from public.planos_acao_evidencias pe where pe.plano_id = pa.id);

create or replace function public.sincronizar_tem_evidencias()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  alvo_plano_id uuid := coalesce(new.plano_id, old.plano_id);
begin
  update public.planos_acao
  set tem_evidencias = (
    exists (select 1 from public.planos_acao_evidencias where plano_id = alvo_plano_id)
    or exists (select 1 from public.planos_acao where id = alvo_plano_id and imagem_path is not null)
  )
  where id = alvo_plano_id;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_sincronizar_tem_evidencias on public.planos_acao_evidencias;
create trigger trg_sincronizar_tem_evidencias
  after insert or delete on public.planos_acao_evidencias
  for each row
  execute function public.sincronizar_tem_evidencias();

-- ---------------------------------------------------------------------
-- 3. Evidência pode ser anexada por quem edita o plano, não só quem criou
-- ---------------------------------------------------------------------
-- Policy antiga só permitia o criador original inserir evidência — fazia
-- sentido quando evidência só existia no momento da criação (só o criador
-- estava "no fluxo"). Agora que anexar é uma ação independente e posterior,
-- quem tem permissão de editar o plano (mesma regra já usada pra editar
-- conteúdo/status) também precisa poder anexar — outro colaborador pode
-- legitimamente ser quem vai a campo fotografar a execução.
drop policy if exists "evidencias_insert_dono_do_plano" on public.planos_acao_evidencias;

create policy "evidencias_insert_dono_ou_editor"
  on public.planos_acao_evidencias
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.planos_acao pa
      where pa.id = plano_id
        and (pa.criado_por = auth.uid() or tem_permissao('editar_plano_acao'))
    )
  );

-- ---------------------------------------------------------------------
-- 4. criar_plano_com_evidencias: aceita os campos de endereço estruturado
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE com parâmetros novos só no final (todos com default) —
-- não muda a assinatura pros chamadores existentes, só estende. O client
-- (criarPlano) passa a mandar os campos novos; se algum caller antigo não
-- mandar, os defaults (null) preservam o comportamento de antes.
-- CREATE OR REPLACE não é suficiente aqui: adicionar parâmetros novos —
-- mesmo com default — muda a assinatura (tipos dos parâmetros de entrada),
-- e o Postgres trata isso como uma função NOVA (overload), não uma
-- substituição da antiga. Sem o DROP explícito, as duas versões (14 e 20
-- parâmetros) ficariam coexistindo, e chamadas por nome de parâmetro
-- poderiam resolver pra qualquer uma das duas — ambíguo e exatamente o
-- tipo de bug silencioso que não aparece em teste manual rápido.
drop function if exists public.criar_plano_com_evidencias(
  uuid, text, text, text, text, text, text, date, jsonb, numeric, numeric, numeric, text, timestamptz
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

  for evidencia in select * from jsonb_array_elements(coalesce(p_evidencias, '[]'::jsonb))
  loop
    insert into public.planos_acao_evidencias (plano_id, imagem_path, imagem_metadados, ordem)
    values (
      plano.id,
      evidencia->>'imagem_path',
      evidencia->'imagem_metadados',
      coalesce((evidencia->>'ordem')::int, 0)
    );
  end loop;

  select * into plano from public.planos_acao where id = plano.id;
  return plano;
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. anexar_evidencias_plano: o novo caminho de escrita — evidência depois
-- ---------------------------------------------------------------------
-- Mesma regra de negócio da criação (localização obrigatória quando há
-- evidência), mas: (a) plano já existe, então é UPDATE + INSERT em vez de
-- INSERT + INSERT; (b) `ordem` continua a partir do que já existe, pra
-- anexos em momentos diferentes não colidirem nem embaralharem a ordem das
-- fotos já salvas; (c) a localização capturada AGORA substitui a anterior
-- nas colunas de planos_acao — é o mesmo modelo já usado (localização é um
-- dado por PLANO, não por imagem/lote), então o anexo mais recente é quem
-- fica valendo como "onde a evidência foi registrada". Ver comentário na
-- migration 20260709130000 sobre esse design.
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
begin
  if jsonb_array_length(coalesce(p_evidencias, '[]'::jsonb)) = 0 then
    raise exception 'Informe ao menos uma imagem para anexar.';
  end if;

  if p_evidencia_latitude is null or p_evidencia_longitude is null then
    raise exception 'Localização é obrigatória quando há evidências anexadas.';
  end if;

  select coalesce(max(ordem), -1) + 1 into proxima_ordem
  from public.planos_acao_evidencias
  where plano_id = p_plano_id;

  for evidencia in select * from jsonb_array_elements(p_evidencias)
  loop
    insert into public.planos_acao_evidencias (plano_id, imagem_path, imagem_metadados, ordem)
    values (p_plano_id, evidencia->>'imagem_path', evidencia->'imagem_metadados', proxima_ordem);
    proxima_ordem := proxima_ordem + 1;
  end loop;

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

revoke all on function public.criar_plano_com_evidencias(
  uuid, text, text, text, text, text, text, date, jsonb, numeric, numeric, numeric, text, timestamptz,
  text, text, text, text, text, text
) from public;
grant execute on function public.criar_plano_com_evidencias(
  uuid, text, text, text, text, text, text, date, jsonb, numeric, numeric, numeric, text, timestamptz,
  text, text, text, text, text, text
) to authenticated;

revoke all on function public.anexar_evidencias_plano(
  uuid, jsonb, numeric, numeric, numeric, text, text, text, text, text, text, text, timestamptz
) from public;
grant execute on function public.anexar_evidencias_plano(
  uuid, jsonb, numeric, numeric, numeric, text, text, text, text, text, text, text, timestamptz
) to authenticated;