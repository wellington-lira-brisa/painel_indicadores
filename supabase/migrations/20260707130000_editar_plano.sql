alter table public.planos_acao
  add column if not exists atualizado_por uuid references public.colaboradores(id);