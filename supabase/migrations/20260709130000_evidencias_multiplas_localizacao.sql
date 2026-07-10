-- Evolui o módulo de evidências: múltiplas imagens por plano (antes só uma,
-- em imagem_path/imagem_metadados) e localização obrigatória quando há
-- evidência anexada.
--
-- Modelagem: nova tabela `planos_acao_evidencias` (1 plano -> N imagens),
-- no mesmo padrão já usado por `planos_acao_historico` (tabela filha com FK
-- + cascade, RLS de leitura espelhando a visibilidade do plano pai) — não
-- é uma abordagem nova, é consistência com o que já existe no projeto.
-- Guardar um array de imagens dentro de um jsonb só, por exemplo, foi
-- descartado: perde a possibilidade de indexar/consultar por evidência
-- individual e mistura "muitos registros" com "um campo", que é exatamente
-- o problema que uma tabela relacional resolve.
--
-- `imagem_path`/`imagem_metadados` em `planos_acao` NÃO são removidas —
-- planos criados antes desta migration continuam com sua imagem única
-- intacta; o mapeamento no client (mapearPlano) trata isso como uma
-- evidência legada de item único quando não há linhas em
-- planos_acao_evidencias.
--
-- A localização, diferente das imagens, é um dado por PLANO, não por
-- imagem: representa "onde o colaborador estava ao anexar as evidências",
-- um único instante de captura pra todo o lote, então vive como colunas em
-- planos_acao, não replicada em cada linha de evidência.

alter table public.planos_acao
  add column if not exists evidencia_latitude numeric,
  add column if not exists evidencia_longitude numeric,
  add column if not exists evidencia_precisao_metros numeric,
  add column if not exists evidencia_endereco text,
  add column if not exists evidencia_capturada_em timestamptz;

comment on column public.planos_acao.evidencia_latitude is
  'Latitude capturada do dispositivo do colaborador no momento em que as evidências foram anexadas (não é EXIF da foto). Obrigatória junto com evidencia_longitude sempre que o plano tiver ao menos uma evidência — ver função criar_plano_com_evidencias.';
comment on column public.planos_acao.evidencia_longitude is 'Ver evidencia_latitude.';

-- Consistência simples e sempre válida, independente de quantas evidências
-- existem: latitude e longitude sempre juntas (as duas nulas ou as duas
-- preenchidas), nunca uma só. A regra "obrigatória SE existir evidência" é
-- mais forte que isso e depende de outra tabela — essa parte fica na RPC
-- abaixo, não dá pra expressar como CHECK declarativo aqui.
alter table public.planos_acao
  add constraint planos_acao_evidencia_lat_lon_par
  check ((evidencia_latitude is null) = (evidencia_longitude is null));

create table if not exists public.planos_acao_evidencias (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.planos_acao(id) on delete cascade,
  imagem_path text not null,
  imagem_metadados jsonb,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

comment on table public.planos_acao_evidencias is
  'Imagens de evidência de um plano de ação (0..N por plano). Substitui, pra planos novos, as colunas únicas imagem_path/imagem_metadados de planos_acao — que continuam existindo só pra não quebrar planos antigos.';

create index if not exists idx_planos_acao_evidencias_plano_id
  on public.planos_acao_evidencias (plano_id, ordem);

alter table public.planos_acao_evidencias enable row level security;

-- Visibilidade da evidência = visibilidade do plano — mesmo raciocínio (e
-- mesma forma) da policy de planos_acao_historico: a subquery já herda a
-- RLS de planos_acao, sem duplicar a regra de permissão aqui.
create policy "evidencias_select_quem_ve_o_plano"
  on public.planos_acao_evidencias
  for select
  to authenticated
  using (exists (select 1 from public.planos_acao pa where pa.id = plano_id));

-- Escopo desta policy: só cobre a criação do plano (evidências são
-- inseridas junto com o plano, via criar_plano_com_evidencias, nunca
-- adicionadas depois numa tela de edição — essa tela não existe hoje). Só
-- quem está criando o próprio plano (criado_por = auth.uid()) pode inserir
-- evidências para ele. Se um fluxo de "adicionar evidência depois" for
-- criado no futuro, esta policy provavelmente precisa ser revisada.
create policy "evidencias_insert_dono_do_plano"
  on public.planos_acao_evidencias
  for insert
  to authenticated
  with check (exists (select 1 from public.planos_acao pa where pa.id = plano_id and pa.criado_por = auth.uid()));

-- Exclusão de evidência individual segue a mesma permissão já usada pra
-- excluir o plano inteiro — não existe uma permissão "excluir evidência"
-- separada, e criar uma agora seria granularidade sem uso real (nenhuma UI
-- de remover evidência de um plano já salvo existe ainda).
create policy "evidencias_delete_com_permissao"
  on public.planos_acao_evidencias
  for delete
  to authenticated
  using (tem_permissao('excluir_plano_acao'));

-- RPC transacional: cria o plano e suas evidências numa única transação
-- (corpo de função Postgres é atômico por padrão), e é o único lugar que
-- garante de verdade a regra "localização obrigatória se houver evidência"
-- — não dá pra expressar isso como CHECK porque depende de contar linhas
-- de outra tabela inserida na mesma operação. O client (FormularioPlanoAcao)
-- já bloqueia isso antes de chamar aqui; esta função é a segunda camada,
-- a que realmente importa pra integridade dos dados.
--
-- SECURITY INVOKER (padrão, explícito por clareza): a RLS de INSERT em
-- planos_acao (já existente, não alterada por esta migration) e a nova
-- policy de planos_acao_evidencias continuam sendo a fronteira real de
-- permissão — a função não contorna RLS, só agrupa duas inserções numa
-- transação só.
create or replace function public.criar_plano_com_evidencias(
  p_id uuid,
  p_cidade_id text,
  p_tecnologia_id text,
  p_indicador_id text,
  p_o_que text,
  p_como text,
  p_quem text,
  p_quando_previsto date,
  p_evidencias jsonb default '[]'::jsonb, -- array de { imagem_path, imagem_metadados, ordem }
  p_evidencia_latitude numeric default null,
  p_evidencia_longitude numeric default null,
  p_evidencia_precisao_metros numeric default null,
  p_evidencia_endereco text default null,
  p_evidencia_capturada_em timestamptz default null
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
    evidencia_endereco, evidencia_capturada_em
  )
  values (
    p_id, p_cidade_id, p_tecnologia_id, p_indicador_id, p_o_que, p_como, p_quem, p_quando_previsto,
    auth.uid(), p_evidencia_latitude, p_evidencia_longitude, p_evidencia_precisao_metros,
    p_evidencia_endereco, p_evidencia_capturada_em
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

  return plano;
end;
$function$;

revoke all on function public.criar_plano_com_evidencias(
  uuid, text, text, text, text, text, text, date, jsonb, numeric, numeric, numeric, text, timestamptz
) from public;

grant execute on function public.criar_plano_com_evidencias(
  uuid, text, text, text, text, text, text, date, jsonb, numeric, numeric, numeric, text, timestamptz
) to authenticated;