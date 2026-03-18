// Mapa centralizado de hostname público -> slug da empresa.
// Para adicionar novos domínios no futuro, basta incluir novas entradas aqui.
const COMPANY_DOMAIN_SLUG_MAP: Record<string, string> = {
  'busaooffoff.com.br': 'busaooffoff',
  'www.busaooffoff.com.br': 'busaooffoff',
};

const normalizeHostname = (hostname: string) => hostname.trim().toLowerCase().replace(/\.$/, '');

export const getCompanySlugForHostname = (hostname: string) => {
  const normalizedHostname = normalizeHostname(hostname);
  return COMPANY_DOMAIN_SLUG_MAP[normalizedHostname] ?? null;
};

interface ResolveCompanyDomainRedirectInput {
  hostname: string;
  pathname: string;
}

export const resolveCompanyDomainRedirect = ({
  hostname,
  pathname,
}: ResolveCompanyDomainRedirectInput) => {
  // A regra atua apenas na raiz pública para não interferir em admin, login ou rotas internas.
  if (pathname !== '/') {
    return null;
  }

  const companySlug = getCompanySlugForHostname(hostname);
  if (!companySlug) {
    return null;
  }

  return `/empresa/${companySlug}`;
};
