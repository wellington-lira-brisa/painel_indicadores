-- Status do plano de ação passa a ser um enum fechado de 5 valores em vez
-- de texto livre. Antes de restringir, normaliza qualquer valor existente
-- que não seja um dos 5 — inclui o caso observado em produção ('aberto').

update public.planos_acao
set status = case
  when status in ('nao_iniciado', 'em_andamento', 'aguardando', 'parado', 'concluido') then status
  when status in ('aberto', 'aberta', 'ativo', 'ativa', 'pendente') then 'em_andamento'
  when status in ('concluida', 'finalizado', 'finalizada', 'encerrado', 'encerrada') then 'concluido'
  when status is null then 'nao_iniciado'
  else 'nao_iniciado'
end;

alter table public.planos_acao
  alter column status set default 'nao_iniciado';

alter table public.planos_acao
  add constraint planos_acao_status_valido
  check (status in ('nao_iniciado', 'em_andamento', 'aguardando', 'parado', 'concluido'));

comment on column public.planos_acao.status is
  'Status de execução do plano: nao_iniciado | em_andamento | aguardando | parado | concluido.';