/**
 * Exceção de autorização intencional para o catálogo global `/admin/templates-layout`.
 *
 * Regra de negócio:
 * - Não altera role do usuário no sistema.
 * - Libera somente o fluxo técnico de templates de layout.
 * - Fonte de verdade é user_id (não e-mail), para manter rastreabilidade/auditoria.
 */
export const TEMPLATES_LAYOUT_EXCEPTION_USER_ID = 'f1ba5ea7-2d3d-4171-b651-c1917655e5b1';

export const canAccessTemplatesLayoutByUserId = (userId?: string | null) =>
  Boolean(userId && userId === TEMPLATES_LAYOUT_EXCEPTION_USER_ID);
