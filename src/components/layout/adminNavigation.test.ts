import { describe, expect, it } from 'vitest';
import {
  TECHNICAL_DESKTOP_ONLY_ROUTES,
  canAccessTechnicalDesktopRoute,
  canViewAdminNavigationItem,
  navigationGroups,
} from './adminNavigation';

describe('navegação das telas técnicas', () => {
  const technicalItems = navigationGroups
    .flatMap((group) => group.items)
    .filter((item) => item.href && TECHNICAL_DESKTOP_ONLY_ROUTES.includes(item.href as typeof TECHNICAL_DESKTOP_ONLY_ROUTES[number]));

  it('mantém as quatro opções técnicas exclusivas de developer e ocultas no mobile', () => {
    expect(technicalItems).toHaveLength(4);
    technicalItems.forEach((item) => {
      expect(item.roles).toEqual(['developer']);
      expect(item.desktopOnly).toBe(true);
      expect(canViewAdminNavigationItem({ item, userRole: 'gerente', isDeveloper: false })).toBe(false);
      expect(canViewAdminNavigationItem({ item, userRole: 'developer', isDeveloper: true })).toBe(true);
    });
  });

  it('restaura o relatório por evento na navegação dos perfis administrativos em desktop e mobile', () => {
    const eventReportItem = navigationGroups
      .flatMap((group) => group.items)
      .find((item) => item.href === '/admin/relatorios/eventos') ?? null;

    expect(TECHNICAL_DESKTOP_ONLY_ROUTES).not.toContain('/admin/relatorios/eventos');
    expect(eventReportItem?.desktopOnly).toBeUndefined();
    expect(eventReportItem?.roles).toBeUndefined();
    expect(canViewAdminNavigationItem({ item: eventReportItem, userRole: 'gerente', isDeveloper: false })).toBe(true);
    expect(canViewAdminNavigationItem({ item: eventReportItem, userRole: 'operador', isDeveloper: false })).toBe(true);
    expect(canAccessTechnicalDesktopRoute({
      pathname: '/admin/relatorios/eventos',
      isDeveloper: false,
      isBelowDesktopBreakpoint: true,
    })).toBe(true);
  });

  it('bloqueia acesso direto no mobile e para não desenvolvedores', () => {
    TECHNICAL_DESKTOP_ONLY_ROUTES.forEach((pathname) => {
      expect(canAccessTechnicalDesktopRoute({ pathname, isDeveloper: true, isBelowDesktopBreakpoint: true })).toBe(false);
      expect(canAccessTechnicalDesktopRoute({ pathname, isDeveloper: false, isBelowDesktopBreakpoint: false })).toBe(false);
      expect(canAccessTechnicalDesktopRoute({ pathname, isDeveloper: true, isBelowDesktopBreakpoint: false })).toBe(true);
    });
  });
});
