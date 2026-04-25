# Objetivo

Implementar a menor correção possível para que os hostnames `busaooffoff.com.br` e `www.busaooffoff.com.br` levem a entrada pública raiz do projeto para a vitrine canônica `/empresa/busaooffoff`.

# Causa do problema

A rota raiz `/` estava centralizada em `PublicRootRedirect`, mas esse ponto apenas renderizava a landing page institucional. Assim, o app não diferenciava os hostnames Busão Off Off da navegação pública padrão.

# Ponto escolhido para implementação

O ponto escolhido foi a própria rota pública raiz:
- `src/pages/public/PublicRootRedirect.tsx`

A regra auxiliar foi extraída para:
- `src/lib/companyDomainRouting.ts`

Esse é o local mais seguro porque:
- já é a entrada pública central do app;
- não mexe nas rotas administrativas;
- não altera a rota canônica `/empresa/:nick`;
- evita espalhar condicionais de hostname por componentes diferentes.

# Estratégia adotada

1. Detectar explicitamente apenas os hostnames:
   - `busaooffoff.com.br`
   - `www.busaooffoff.com.br`
2. Aplicar redirect somente quando o `pathname` atual for a raiz pública (`/`).
3. Redirecionar para a rota canônica já existente `/empresa/busaooffoff`.
4. Manter qualquer outro hostname e qualquer outro path sem alteração.

# Arquivos alterados

- `src/pages/public/PublicRootRedirect.tsx`
- `src/lib/companyDomainRouting.ts`
- `src/lib/companyDomainRouting.test.ts`
- `analise-29-redirect-hostname-busaooffoff.md`

## Ajuste posterior de teste

Após a implementação inicial, o arquivo `src/lib/companyDomainRouting.test.ts` foi revisado para ficar explicitamente como teste real da função `resolveCompanyDomainRedirect`, usando o runner Vitest já configurado no projeto e cobrindo os cenários exigidos pela revisão.

# Riscos evitados

- Não foi criada nova arquitetura de roteamento.
- Não foi alterada a estrutura de `src/App.tsx`.
- Não houve mudança em login, admin, checkout ou outras vitrines.
- O redirect não roda fora da raiz, evitando loop ou redirecionamento agressivo.
- Os hostnames foram tratados explicitamente, sem regex ampla.

# Cenários validados

1. `busaooffoff.com.br` na raiz resolve para `/empresa/busaooffoff`.
2. `www.busaooffoff.com.br` na raiz resolve para `/empresa/busaooffoff`.
3. O domínio principal continua sem redirect especial na raiz.
4. `/empresa/busaooffoff` não entra em loop.
5. Rotas administrativas não são interceptadas, porque a regra só atua na raiz pública.
6. Outros hostnames públicos continuam sem impacto.
7. `busaooffoff.com.br` com pathname vazio `''` continua resolvendo para `/empresa/busaooffoff`.
8. `busaooffoff.com.br` com pathname `/admin` retorna `null` e não intercepta fluxo administrativo.
