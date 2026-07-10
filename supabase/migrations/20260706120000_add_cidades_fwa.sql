-- Armazena se uma cidade vende FWA. Tabela separada porque não existe
-- tabela `cidades` no banco hoje (dados de cidade ainda são mock no front) —
-- ao migrar cidades para o banco, considerar mover esta coluna para lá e
-- dropar esta tabela.
create table if not exists public.cidades_fwa (
  cidade_id text primary key,
  vende_fwa boolean not null default false,
  atualizado_por uuid references public.colaboradores(id),
  atualizado_em timestamptz not null default now()
);

alter table public.cidades_fwa enable row level security;

-- Leitura: qualquer usuário autenticado (o badge aparece pra todo mundo).
create policy "cidades_fwa_select_autenticado"
  on public.cidades_fwa
  for select
  to authenticated
  using (true);

-- Escrita: só quem tem a permissão gerenciar_fwa.
-- ATENÇÃO: `usuario_tem_permissao` é um placeholder — troque pelo nome real
-- da função/policy de checagem de permissão já usada nas outras tabelas
-- (colaboradores, planos_acao, etc.). Não tenho essa definição no repo.
create policy "cidades_fwa_upsert_admin"
  on public.cidades_fwa
  for insert
  to authenticated
  with check (public.usuario_tem_permissao('gerenciar_fwa'));

create policy "cidades_fwa_update_admin"
  on public.cidades_fwa
  for update
  to authenticated
  using (public.usuario_tem_permissao('gerenciar_fwa'))
  with check (public.usuario_tem_permissao('gerenciar_fwa'));