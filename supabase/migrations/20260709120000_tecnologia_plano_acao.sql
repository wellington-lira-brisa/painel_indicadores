-- Separa Planos de Ação por tecnologia (FTTH, 5G, ...). Hoje um plano criado
-- na tela do FTTH também aparecia na tela do 5G da mesma cidade — o filtro
-- real de negócio sempre foi cidade + tecnologia, não só cidade.
--
-- Modelagem escolhida: tabela de referência `tecnologias` + FK em
-- `planos_acao.tecnologia_id`, em vez de um `check (tecnologia in (...))`.
-- Motivo: com CHECK, toda tecnologia nova (FWA, IoT, ...) exige uma
-- migration alterando a constraint. Com tabela de referência, é um INSERT —
-- sem migration, sem downtime, e ainda com integridade referencial (FK
-- continua garantindo que ninguém grava um valor inválido). É também o
-- padrão já usado neste projeto pra outras entidades de referência
-- (perfis_acesso, colaboradores) — não é uma abordagem nova, é consistência
-- com o que já existe.

create table if not exists public.tecnologias (
  id text primary key,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

comment on table public.tecnologias is
  'Catálogo de tecnologias suportadas (FTTH, 5G, ...). Referenciada por planos_acao — e por qualquer tabela futura que precise ser separada por tecnologia — via FK. Adicionar uma tecnologia nova é um INSERT aqui, nunca uma migration.';

insert into public.tecnologias (id, nome) values
  ('ftth', 'FTTH'),
  ('5g', '5G')
on conflict (id) do nothing;

alter table public.tecnologias enable row level security;

-- Leitura: qualquer usuário autenticado (populam os seletores de tecnologia da UI).
create policy "tecnologias_select_autenticado"
  on public.tecnologias
  for select
  to authenticated
  using (true);

-- Sem policy de escrita por enquanto: nenhuma UI de gestão de tecnologias
-- ainda existe. Cadastrar uma tecnologia nova é feito direto no banco até
-- que essa tela exista.

-- Plano de ação passa a pertencer a uma tecnologia.
-- NOT NULL com default 'ftth': todo plano existente hoje é FTTH (única
-- tecnologia com Planos de Ação até esta migration) — o default preenche
-- esses registros automaticamente, sem precisar de um UPDATE em massa à parte.
alter table public.planos_acao
  add column if not exists tecnologia_id text not null default 'ftth' references public.tecnologias(id);

-- Depois do backfill, o default sai: toda escrita nova (criarPlano) passa a
-- informar explicitamente a tecnologia, em vez de cair silenciosamente em
-- FTTH por omissão.
alter table public.planos_acao
  alter column tecnologia_id drop default;

comment on column public.planos_acao.tecnologia_id is
  'Tecnologia à qual este plano pertence (FTTH, 5G, ...). Filtro obrigatório em toda listagem — um plano de FTTH nunca deve aparecer na tela do 5G, mesmo sendo a mesma cidade. Imutável após a criação (não faz sentido "mudar de tecnologia" um plano já registrado).';

-- Reservado para quando indicadores forem persistidos no banco (hoje vivem
-- só no front, em mockCidades.js/mockCidades5g.js). Sem FK por ora — não há
-- tabela de indicadores pra referenciar ainda; nullable porque a maioria dos
-- planos hoje é sobre a cidade como um todo, não sobre um indicador específico.
alter table public.planos_acao
  add column if not exists indicador_id text;

comment on column public.planos_acao.indicador_id is
  'Indicador ao qual o plano se relaciona (ex.: "instalacao", "ativacao"), quando aplicável. Nullable e sem FK por ora — indicadores ainda não são persistidos no banco. Preparado para quando forem, sem precisar de nova migration estrutural (só adicionar a FK depois).';

-- Índice pro padrão de consulta real: "planos desta cidade, nesta
-- tecnologia" (tela da cidade, listarPlanosPorCidade) e "planos ativos por
-- cidade, nesta tecnologia" (badge do Ranking, listarStatusPlanosAtivosPorCidade).
-- cidade_id primeiro porque toda consulta de listagem já filtra por ele;
-- tecnologia_id como segunda coluna cobre o filtro composto sem precisar
-- de um índice extra separado.
create index if not exists idx_planos_acao_cidade_tecnologia
  on public.planos_acao (cidade_id, tecnologia_id);

-- RLS: nenhuma policy muda. Quem pode ver/editar um plano continua sendo
-- decidido por permissão (tem_permissao / hierarquia) — isso sempre foi
-- checagem de segurança, independente de cidade ou tecnologia. cidade_id e
-- tecnologia_id são (e sempre foram, no caso de cidade_id) filtros de
-- aplicação — WHERE na consulta feita pelo front — não fronteira de RLS.