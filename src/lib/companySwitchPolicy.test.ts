import { describe, expect, it } from 'vitest';
import {
  canSwitchActiveCompany,
  isCompanyScopedQuery,
  resolveSwitchedCompanyRole,
} from './companySwitchPolicy';

describe('política compartilhada de troca de empresa', () => {
  it('autoriza developer apenas quando há múltiplas empresas', () => {
    expect(canSwitchActiveCompany(true, 2)).toBe(true);
    expect(canSwitchActiveCompany(true, 1)).toBe(false);
  });

  it('não autoriza usuário comum mesmo com múltiplas empresas', () => {
    expect(canSwitchActiveCompany(false, 1)).toBe(false);
    expect(canSwitchActiveCompany(false, 3)).toBe(false);
  });

  it('preserva developer diante de papel diferente no vínculo de destino', () => {
    expect(resolveSwitchedCompanyRole(true, 'gerente')).toBe('developer');
    expect(resolveSwitchedCompanyRole(true, null)).toBe('developer');
  });

  it('aplica o papel da empresa de destino aos demais usuários', () => {
    expect(resolveSwitchedCompanyRole(false, 'operador')).toBe('operador');
    expect(resolveSwitchedCompanyRole(false, null)).toBeNull();
  });

  it('identifica somente caches vinculados à empresa anterior', () => {
    expect(isCompanyScopedQuery(['dashboard-op', 'company-a', 30], 'company-a')).toBe(true);
    expect(isCompanyScopedQuery(['runtime-payment-environment'], 'company-a')).toBe(false);
    expect(isCompanyScopedQuery(['dashboard-op', 'company-b', 30], 'company-a')).toBe(false);
  });
});
