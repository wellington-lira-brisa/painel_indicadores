-- Histórico de alterações do plano de ação — estilo "diff de versionamento":
-- cada linha é um evento de UPDATE, guardando só os campos que mudaram
-- (jsonb { campo: { de, para } }), nunca uma cópia inteira do plano.

create table if not exists public.planos_acao_historico (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.planos_acao(id) on delete cascade,
  alterado_por uuid references public.colaboradores(id),
  alterado_em timestamptz not null default now(),
  motivo text,
  alteracoes jsonb not null
);

-- Toda leitura de histórico é "as alterações deste plano" — índice cobre
-- filtro e ordenação (mais recente primeiro) na mesma estrutura.
create index if not exists idx_planos_acao_historico_plano_id
  on public.planos_acao_historico (plano_id, alterado_em desc);

alter table public.planos_acao_historico enable row level security;

-- Visibilidade do histórico = visibilidade do plano. A subquery já respeita
-- a RLS de planos_acao, então herdamos a regra de permissão sem duplicá-la
-- aqui — quem não pode ver o plano, não vê nem que ele tem histórico.
create policy "historico_select_quem_ve_o_plano"
  on public.planos_acao_historico
  for select
  to authenticated
  using (exists (select 1 from public.planos_acao pa where pa.id = plano_id));

-- Nenhuma policy de insert/update/delete: histórico é imutável por design.
-- A única escrita possível é a trigger abaixo, que roda como security
-- definer e portanto não depende de grant nenhum sobre esta tabela.
grant select on public.planos_acao_historico to authenticated;

-- Trigger de auditoria: compara OLD x NEW e grava só os campos que
-- mudaram. Roda em QUALQUER UPDATE em planos_acao, não importa se veio
-- de atualizar_plano_estruturado, atualizar_plano_legado,
-- atualizar_status_plano ou de qualquer caminho de escrita futuro —
-- diferente de calcular o diff no client, aqui não tem como um novo
-- caminho de escrita "esquecer" de gerar histórico.
create or replace function public.registrar_historico_plano()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  alteracoes jsonb := '{}'::jsonb;
  motivo_atual text;
begin
  if new.status is distinct from old.status then
    alteracoes := alteracoes || jsonb_build_object('status', jsonb_build_object('de', old.status, 'para', new.status));
  end if;
  if new.o_que is distinct from old.o_que then
    alteracoes := alteracoes || jsonb_build_object('o_que', jsonb_build_object('de', old.o_que, 'para', new.o_que));
  end if;
  if new.como is distinct from old.como then
    alteracoes := alteracoes || jsonb_build_object('como', jsonb_build_object('de', old.como, 'para', new.como));
  end if;
  if new.quem is distinct from old.quem then
    alteracoes := alteracoes || jsonb_build_object('quem', jsonb_build_object('de', old.quem, 'para', new.quem));
  end if;
  if new.quando_previsto is distinct from old.quando_previsto then
    alteracoes := alteracoes || jsonb_build_object('quando_previsto', jsonb_build_object('de', old.quando_previsto, 'para', new.quando_previsto));
  end if;
  if new.descricao is distinct from old.descricao then
    alteracoes := alteracoes || jsonb_build_object('descricao', jsonb_build_object('de', old.descricao, 'para', new.descricao));
  end if;

  -- Nada relevante mudou (ex.: um UPDATE que só tocou atualizado_em por
  -- algum motivo técnico) — não registra evento vazio no histórico.
  if alteracoes = '{}'::jsonb then
    return new;
  end if;

  -- GUC de transação: setada pelas RPCs abaixo antes do UPDATE, na mesma
  -- chamada/transação. missing_ok=true faz retornar null em vez de erro
  -- quando ninguém setou (ex.: um UPDATE direto fora das RPCs).
  motivo_atual := nullif(current_setting('app.motivo_alteracao', true), '');

  insert into public.planos_acao_historico (plano_id, alterado_por, motivo, alteracoes)
  values (new.id, new.atualizado_por, motivo_atual, alteracoes);

  return new;
end;
$function$;

drop trigger if exists trg_registrar_historico_plano on public.planos_acao;
create trigger trg_registrar_historico_plano
  after update on public.planos_acao
  for each row
  execute function public.registrar_historico_plano();

-- RPCs de escrita: substituem os `.update()` diretos que o front fazia.
-- SECURITY INVOKER (padrão — explícito aqui só por clareza): a RLS de
-- UPDATE em planos_acao continua sendo a fronteira real de permissão,
-- exatamente como já era. A única mudança é *onde* a chamada acontece —
-- via RPC em vez de update direto — pra poder setar o motivo na mesma
-- transação do UPDATE, e pra derivar quem alterou de auth.uid() em vez
-- de confiar num id que o client mandasse.

create or replace function public.atualizar_plano_estruturado(
  p_plano_id uuid,
  p_o_que text,
  p_como text,
  p_quem text,
  p_quando_previsto date,
  p_motivo text default null
)
returns void
language plpgsql
security invoker
as $function$
begin
  perform set_config('app.motivo_alteracao', coalesce(p_motivo, ''), true);

  update public.planos_acao
  set o_que = p_o_que,
      como = p_como,
      quem = p_quem,
      quando_previsto = p_quando_previsto,
      atualizado_por = auth.uid(),
      atualizado_em = now()
  where id = p_plano_id;

  if not found then
    raise exception 'Plano de ação não encontrado ou sem permissão para editar.';
  end if;
end;
$function$;

create or replace function public.atualizar_plano_legado(
  p_plano_id uuid,
  p_descricao text,
  p_motivo text default null
)
returns void
language plpgsql
security invoker
as $function$
begin
  perform set_config('app.motivo_alteracao', coalesce(p_motivo, ''), true);

  update public.planos_acao
  set descricao = p_descricao,
      atualizado_por = auth.uid(),
      atualizado_em = now()
  where id = p_plano_id;

  if not found then
    raise exception 'Plano de ação não encontrado ou sem permissão para editar.';
  end if;
end;
$function$;

create or replace function public.atualizar_status_plano(
  p_plano_id uuid,
  p_status text,
  p_motivo text default null
)
returns void
language plpgsql
security invoker
as $function$
begin
  if p_status not in ('nao_iniciado', 'em_andamento', 'aguardando', 'parado', 'concluido') then
    raise exception 'Status inválido: %', p_status;
  end if;

  perform set_config('app.motivo_alteracao', coalesce(p_motivo, ''), true);

  update public.planos_acao
  set status = p_status,
      atualizado_por = auth.uid(),
      atualizado_em = now()
  where id = p_plano_id;

  if not found then
    raise exception 'Plano de ação não encontrado ou sem permissão para editar.';
  end if;
end;
$function$;

revoke all on function public.atualizar_plano_estruturado(uuid, text, text, text, date, text) from public;
revoke all on function public.atualizar_plano_legado(uuid, text, text) from public;
revoke all on function public.atualizar_status_plano(uuid, text, text) from public;

grant execute on function public.atualizar_plano_estruturado(uuid, text, text, text, date, text) to authenticated;
grant execute on function public.atualizar_plano_legado(uuid, text, text) to authenticated;
grant execute on function public.atualizar_status_plano(uuid, text, text) to authenticated;