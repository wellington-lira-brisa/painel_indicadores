/** Permissões atômicas disponíveis no sistema (iguais às cadastradas em perfis_acesso). */
export const PERMISSOES = {
  VISUALIZAR_DASHBOARD: 'visualizar_dashboard',
  VISUALIZAR_RANKING: 'visualizar_ranking',
  CRIAR_PLANO_ACAO: 'criar_plano_acao',
  EDITAR_PLANO_ACAO: 'editar_plano_acao',
  EXCLUIR_PLANO_ACAO: 'excluir_plano_acao',
  VISUALIZAR_DADOS_SENSIVEIS: 'visualizar_dados_sensiveis',
  ACESSAR_ADMIN: 'acessar_admin',
  GERENCIAR_USUARIOS: 'gerenciar_usuarios',
  VISUALIZAR_LOGS: 'visualizar_logs',
  CRIAR_CONVITES: 'criar_convites',
  GERENCIAR_FWA: 'gerenciar_fwa',
  EXCLUIR_COLABORADOR: 'excluir_colaborador',
};

export const PERMISSAO_ROTULOS = {
  [PERMISSOES.VISUALIZAR_DASHBOARD]: 'Visualizar dashboard',
  [PERMISSOES.VISUALIZAR_RANKING]: 'Visualizar ranking de cidades',
  [PERMISSOES.CRIAR_PLANO_ACAO]: 'Criar plano de ação',
  [PERMISSOES.EDITAR_PLANO_ACAO]: 'Editar plano de ação',
  [PERMISSOES.EXCLUIR_PLANO_ACAO]: 'Excluir plano de ação',
  [PERMISSOES.VISUALIZAR_DADOS_SENSIVEIS]: 'Visualizar dados sensíveis',
  [PERMISSOES.ACESSAR_ADMIN]: 'Acessar painel administrativo',
  [PERMISSOES.GERENCIAR_USUARIOS]: 'Gerenciar usuários',
  [PERMISSOES.VISUALIZAR_LOGS]: 'Visualizar logs de auditoria',
  [PERMISSOES.CRIAR_CONVITES]: 'Criar códigos de convite',
  [PERMISSOES.GERENCIAR_FWA]: 'Gerenciar venda de FWA por cidade',
  [PERMISSOES.EXCLUIR_COLABORADOR]: 'Excluir colaborador definitivamente',
};

/** Rótulos dos papéis cadastrados em perfis_acesso. */
export const PAPEL_ROTULOS = {
  colaborador_comum: 'Colaborador',
  gestor: 'Gestor',
  gerente: 'Gerente',
  administrador: 'Administrador',
  super_administrador: 'Super Administrador',
};

/**
 * Permissão efetiva = (permissões do papel ∪ extras individuais) − revogadas.
 * Exceção: super_administrador tem acesso a TODAS as permissões cadastradas
 * em `PERMISSOES`, sempre — não depende do array salvo em perfis_acesso.
 * Isso evita a falha recorrente de esquecer de adicionar uma permissão nova
 * ao perfil de Super Admin: qualquer permissão criada no código já vale
 * automaticamente para esse papel, sem exigir migration.
 *
 * `colaborador` é o registro retornado por usuarioService/authService, já
 * com o join de perfis_acesso — nenhuma consulta adicional acontece aqui,
 * isto é cálculo puro em memória.
 */
export function permissoesEfetivas(colaborador) {
  if (!colaborador) return [];
  if (colaborador.papel === 'super_administrador') return Object.values(PERMISSOES);

  const base = colaborador.perfis_acesso?.permissoes ?? [];
  const extras = colaborador.permissoes_extras ?? [];
  const revogadas = new Set(colaborador.permissoes_revogadas ?? []);

  return [...new Set([...base, ...extras])].filter((permissao) => !revogadas.has(permissao));
}

export function temPermissao(colaborador, permissao) {
  if (!colaborador || colaborador.status !== 'ativo') return false;
  return permissoesEfetivas(colaborador).includes(permissao);
}

/**
 * Calcula os novos arrays de permissoes_extras/permissoes_revogadas para
 * um colaborador ao ligar/desligar uma permissão específica na tela de
 * gerenciamento de usuários. Função pura — não persiste nada.
 *
 * @param {object} colaborador - registro com perfis_acesso.permissoes já carregado
 * @param {string} permissao
 * @param {boolean} concedida - true para conceder, false para revogar
 * @returns {{ permissoesExtras: string[], permissoesRevogadas: string[] }}
 */
export function alternarPermissao(colaborador, permissao, concedida) {
  if (colaborador.papel === 'super_administrador') {
    throw new Error('Super Administrador tem acesso total por padrão e não pode ser editado.');
  }

  const baseTem = (colaborador.perfis_acesso?.permissoes ?? []).includes(permissao);
  const extras = new Set(colaborador.permissoes_extras ?? []);
  const revogadas = new Set(colaborador.permissoes_revogadas ?? []);

  if (concedida) {
    revogadas.delete(permissao);
    if (!baseTem) extras.add(permissao);
  } else {
    extras.delete(permissao);
    if (baseTem) revogadas.add(permissao);
  }

  return { permissoesExtras: [...extras], permissoesRevogadas: [...revogadas] };
}