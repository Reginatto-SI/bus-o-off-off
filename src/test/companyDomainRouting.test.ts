import { describe, expect, it } from 'vitest';
import { getCompanySlugForHostname, resolveCompanyDomainRedirect } from '@/lib/companyDomainRouting';

describe('companyDomainRouting', () => {
  it('resolve o slug da empresa para o domínio secundário configurado', () => {
    expect(getCompanySlugForHostname('busaooffoff.com.br')).toBe('busaooffoff');
    expect(getCompanySlugForHostname('WWW.BUSAOOFFOFF.COM.BR')).toBe('busaooffoff');
  });

  it('ignora hostnames não mapeados para não afetar domínio principal, preview e desenvolvimento', () => {
    expect(getCompanySlugForHostname('localhost')).toBeNull();
    expect(getCompanySlugForHostname('preview.lovable.app')).toBeNull();
    expect(getCompanySlugForHostname('smartbusbr.com')).toBeNull();
  });

  it('redireciona somente a raiz pública do domínio vinculado', () => {
    expect(
      resolveCompanyDomainRedirect({
        hostname: 'busaooffoff.com.br',
        pathname: '/',
      }),
    ).toBe('/empresa/busaooffoff');

    expect(
      resolveCompanyDomainRedirect({
        hostname: 'busaooffoff.com.br',
        pathname: '/login',
      }),
    ).toBeNull();

    expect(
      resolveCompanyDomainRedirect({
        hostname: 'smartbusbr.com',
        pathname: '/',
      }),
    ).toBeNull();
  });
});
