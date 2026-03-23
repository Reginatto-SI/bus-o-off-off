import { describe, expect, it } from 'vitest';

import { resolveCompanyDomainRedirect } from './companyDomainRouting';

// Comentário de suporte: estes testes exercitam a função diretamente,
// cobrindo apenas os cenários explícitos aprovados para o domínio Busão Off Off.
describe('resolveCompanyDomainRedirect', () => {
  it.each([
    ['busaooffoff.com.br', '/', '/empresa/busaooffoff'],
    ['www.busaooffoff.com.br', '/', '/empresa/busaooffoff'],
    ['busaooffoff.com.br', '', '/empresa/busaooffoff'],
    ['www.smartbusbr.com.br', '/', null],
    ['busaooffoff.com.br', '/empresa/busaooffoff', null],
    ['busaooffoff.com.br', '/admin', null],
  ])('resolve %s com pathname %s para %s', (hostname, pathname, expected) => {
    expect(resolveCompanyDomainRedirect(hostname, pathname)).toBe(expected);
  });
});
