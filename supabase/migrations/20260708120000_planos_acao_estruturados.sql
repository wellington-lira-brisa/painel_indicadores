-- Planos de ação deixam de ser um campo livre único (`descricao`) e passam
-- a ter 4 perguntas obrigatórias: o_que, como, quem, quando_previsto.
--
-- `descricao` é mantida (nullable) só como histórico do que já foi
-- gravado antes desta migration — nada a partir de agora escreve nela.
-- Não migramos o conteúdo antigo para os campos novos porque não há como
-- separar "o quê/como/quem/quando" de forma confiável a partir de texto
-- livre existente; a UI trata `descricao` isolado (sem os 4 campos) como
-- plano legado e mostra só o texto corrido, sem quebrar.

alter table public.planos_acao
  add column if not exists o_que text,
  add column if not exists como text,
  add column if not exists quem text,
  add column if not exists quando_previsto date;

alter table public.planos_acao
  alter column descricao drop not null;

alter table public.planos_acao
  add constraint planos_acao_o_que_tamanho check (o_que is null or char_length(o_que) <= 300),
  add constraint planos_acao_como_tamanho check (como is null or char_length(como) <= 4000),
  add constraint planos_acao_quem_tamanho check (quem is null or char_length(quem) <= 200);

comment on column public.planos_acao.o_que is 'O que será feito. Obrigatório para planos criados após a versão estruturada.';
comment on column public.planos_acao.como is 'Como a ação será executada.';
comment on column public.planos_acao.quem is 'Responsável pela execução.';
comment on column public.planos_acao.quando_previsto is 'Prazo/data prevista para execução.';
comment on column public.planos_acao.descricao is 'Campo livre legado. Planos novos usam o_que/como/quem/quando_previsto; nulo para eles.';

-- Defesa em profundidade: a checagem "de verdade" (com validação de CPF/
-- Luhn) vive no front (src/utils/validacaoConteudoSensivel.js), reutilizável
-- em qualquer formulário. Esta trigger é um backstop mais simples (sem
-- checksum) contra gravação via SQL direto ou client alterado — mesmo
-- princípio já usado no projeto (RLS/Edge Function como fronteira real,
-- front como camada de UX).
create or replace function public.bloquear_dados_sensiveis_plano()
returns trigger
language plpgsql
as $function$
declare
  texto_verificado text;
begin
  texto_verificado := concat_ws(' ', new.o_que, new.como, new.quem);

  if texto_verificado ~* '\d{3}\.?\d{3}\.?\d{3}-?\d{2}' then
    raise exception 'Conteúdo bloqueado: possível CPF detectado no plano de ação.';
  end if;

  if texto_verificado ~* '\y(senha|password|token|api[_ -]?key|secret|bearer)\y\s*[:=]' then
    raise exception 'Conteúdo bloqueado: possível senha, token ou chave de API detectado no plano de ação.';
  end if;

  if texto_verificado ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
    raise exception 'Conteúdo bloqueado: e-mail detectado no plano de ação.';
  end if;

  if texto_verificado ~* '(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}' then
    raise exception 'Conteúdo bloqueado: telefone detectado no plano de ação.';
  end if;

  if texto_verificado ~* '\y(ag[eê]ncia|conta[ -]?corrente|conta[ -]?poupan[cç]a|chave\s+pix|iban)\y' then
    raise exception 'Conteúdo bloqueado: possível dado bancário detectado no plano de ação.';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_bloquear_dados_sensiveis_plano on public.planos_acao;
create trigger trg_bloquear_dados_sensiveis_plano
  before insert or update of o_que, como, quem on public.planos_acao
  for each row
  execute function public.bloquear_dados_sensiveis_plano();