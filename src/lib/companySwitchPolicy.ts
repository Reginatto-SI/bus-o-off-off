import type { UserRole } from '@/types/database';

// A autorização segue a identificação técnica já usada no carregamento do AuthContext:
// apenas developers com mais de uma empresa resolvida podem alternar o tenant ativo.
export function canSwitchActiveCompany(isDeveloper: boolean, companyCount: number): boolean {
  return isDeveloper && companyCount > 1;
}

// O vínculo da empresa só redefine papéis comuns; a capacidade developer é global
// e não pode ser reduzida por um user_roles específico da empresa de destino.
export function resolveSwitchedCompanyRole(
  isDeveloper: boolean,
  destinationRole: UserRole | null,
): UserRole | null {
  return isDeveloper ? 'developer' : destinationRole;
}

// As query keys tenant-aware existentes carregam o company_id como item da chave.
// O predicado evita apagar caches globais sem manter resultados da empresa anterior.
export function isCompanyScopedQuery(queryKey: readonly unknown[], companyId: string): boolean {
  return queryKey.includes(companyId);
}
