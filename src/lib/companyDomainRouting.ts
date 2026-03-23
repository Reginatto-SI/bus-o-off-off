// Mapa centralizado dos hostnames públicos que devem abrir a vitrine da empresa.
// Neste fluxo, a rota canônica é /empresa/:slug porque ela já existe de forma explícita no router público.
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
  // A regra atua apenas na raiz pública para não interferir em landing, admin, login ou links profundos.
  if (pathname !== '/') {
    return null;
  }

  const companySlug = getCompanySlugForHostname(hostname);
  if (!companySlug) {
    return null;
  }

  // Mantemos /empresa/:slug como destino oficial porque /busaooffoff é apenas um atalho dinâmico
  // dependente do public_slug da base. Assim evitamos duplicidade entre app e arquivos de publicação.
  return `/empresa/${companySlug}`;
};
