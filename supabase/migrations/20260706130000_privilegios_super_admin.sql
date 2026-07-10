-- 1. Corrige dados sujos: remove duplicata de 'criar_convites' e adiciona
--    'gerenciar_fwa' que ficou de fora quando essa permissão foi criada.
--    Isso resolve o sintoma imediato, mas o problema estrutural (permissão
--    nova exige alteração manual no array) segue existindo para
--    'administrador' — só 'super_administrador' foi corrigido de vez no
--    código (permissaoService.js agora trata esse papel como wildcard).
update perfis_acesso
set permissoes = array(select distinct unnest(permissoes))
where papel in ('administrador', 'super_administrador');

update perfis_acesso
set permissoes = array_append(permissoes, 'gerenciar_fwa')
where papel in ('administrador', 'super_administrador')
  and not ('gerenciar_fwa' = any(permissoes));

-- 2. colaboradores.nivel é uma cópia de perfis_acesso.nivel, feita uma
--    única vez na criação da conta (criar_colaborador_via_convite). Se o
--    nivel de um papel for alterado depois, todo colaborador existente
--    daquele papel fica com valor desatualizado, e nada corrige isso hoje.
--    Este trigger sincroniza automaticamente.
create or replace function public.sincronizar_nivel_colaboradores()
returns trigger
language plpgsql
as $function$
begin
  if new.nivel is distinct from old.nivel then
    update public.colaboradores
    set nivel = new.nivel, atualizado_em = now()
    where papel = new.papel;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sincronizar_nivel_colaboradores on public.perfis_acesso;
create trigger trg_sincronizar_nivel_colaboradores
  after update of nivel on public.perfis_acesso
  for each row
  execute function public.sincronizar_nivel_colaboradores();

-- 3. tem_permissao() (usada em toda RLS) não tinha wildcard pra
--    super_administrador — a UI achava que esse papel tinha acesso total,
--    mas o banco continuava recusando qualquer permissão ausente do array.
--    Sem isso, o fix em permissaoService.js é só cosmético.
create or replace function public.tem_permissao(p_permissao text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from colaboradores c
    left join perfis_acesso p on p.papel = c.papel
    where c.id = auth.uid()
      and c.status = 'ativo'
      and (
        c.papel = 'super_administrador'
        or (
          (p_permissao = any(p.permissoes) or p_permissao = any(c.permissoes_extras))
          and not (p_permissao = any(c.permissoes_revogadas))
        )
      )
  );
$function$;

-- 4. super_administrador agora tem acesso total por definição de código
--    (permissaoService.js), não pelo array de permissoes_extras/revogadas.
--    Esse trigger garante que essas colunas nunca guardem lixo para esse
--    papel, em qualquer via de escrita (RPC, admin UI, SQL direto) —
--    evita estado inconsistente/confuso ao inspecionar a tabela depois.
create or replace function public.limpar_permissoes_super_admin()
returns trigger
language plpgsql
as $function$
begin
  if new.papel = 'super_administrador' then
    new.permissoes_extras := '{}';
    new.permissoes_revogadas := '{}';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_limpar_permissoes_super_admin on public.colaboradores;
create trigger trg_limpar_permissoes_super_admin
  before insert or update on public.colaboradores
  for each row
  execute function public.limpar_permissoes_super_admin();