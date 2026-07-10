-- excluir_plano_acao já existia como constante no front (permissaoService.js)
-- sem nenhuma policy, função ou UI por trás — permissão morta. Esta migration
-- implementa de fato, e adiciona a equivalente para colaboradores.

update perfis_acesso
set permissoes = array(select distinct unnest(permissoes))
where papel in ('administrador', 'super_administrador');

update perfis_acesso
set permissoes = array_append(permissoes, 'excluir_plano_acao')
where papel in ('administrador', 'super_administrador')
  and not ('excluir_plano_acao' = any(permissoes));

update perfis_acesso
set permissoes = array_append(permissoes, 'excluir_colaborador')
where papel in ('administrador', 'super_administrador')
  and not ('excluir_colaborador' = any(permissoes));

-- Exclusão de plano de ação.
create policy "excluir plano com permissao"
  on public.planos_acao
  for delete
  to authenticated
  using (tem_permissao('excluir_plano_acao'));

-- Exclusão da imagem de evidência no Storage — mesma permissão do plano.
create policy "excluir evidencia com permissao"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'plano-evidencias' and tem_permissao('excluir_plano_acao'));

-- Exclusão de colaborador. Mesma regra de hierarquia usada em UPDATE
-- ("gerencia usuarios respeitando hierarquia"): nunca a própria conta,
-- nunca alguém de nível igual ou maior. super_administrador tem nivel=4
-- em todos os registros — ninguém tem nivel>4, então nenhum super admin
-- é excluível por esta policy, mesmo por outro super admin. Intencional.
--
-- Esta policy é defesa em profundidade: a exclusão real acontece via
-- Edge Function excluir-colaborador (service_role, bypassa RLS) porque só
-- a Admin API remove o usuário do Auth — SQL puro não alcança auth.users.
create policy "excluir colaborador respeitando hierarquia"
  on public.colaboradores
  for delete
  to authenticated
  using (
    auth.uid() <> id
    and tem_permissao('excluir_colaborador')
    and (meu_colaborador()).nivel > nivel
  );