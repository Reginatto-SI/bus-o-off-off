const BUSAO_OFF_OFF_HOSTS = ['busaooffoff.com.br', 'www.busaooffoff.com.br'] as const;
const BUSAO_OFF_OFF_CANONICAL_PATH = '/empresa/busaooffoff';

const PUBLIC_ENTRY_PATHS = ['/', ''] as const;

export function resolveCompanyDomainRedirect(hostname: string, pathname: string): string | null {
  const normalizedHostname = hostname.trim().toLowerCase();

  // Regra centralizada para o domínio Busão Off Off: quando a entrada pública é a raiz,
  // mantemos a navegação na vitrine canônica já existente do app, sem espalhar ifs por outras rotas.
  if (BUSAO_OFF_OFF_HOSTS.includes(normalizedHostname as (typeof BUSAO_OFF_OFF_HOSTS)[number])) {
    return PUBLIC_ENTRY_PATHS.includes(pathname as (typeof PUBLIC_ENTRY_PATHS)[number])
      ? BUSAO_OFF_OFF_CANONICAL_PATH
      : null;
  }

  return null;
}
