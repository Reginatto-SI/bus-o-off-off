# 1. Objetivo

Registrar a correção mínima, segura e auditável do redirecionamento do domínio secundário da operação Busão Off Off, deixando apenas uma estratégia oficial no repositório.

# 2. Problema corrigido

Antes desta correção, o fluxo estava inconsistente porque havia mais de uma camada tentando decidir o destino do domínio `busaooffoff.com.br`:
- o código React já redirecionava a raiz do hostname para `/empresa/busaooffoff`;
- `public/_redirects` e `vercel.json` ainda tentavam redirecionar para `/busaooffoff`.

Isso criava duplicidade de decisão e mantinha `/busaooffoff` como destino concorrente, mesmo não sendo a rota canônica do app.

# 3. Premissa corrigida do escopo

A hipótese anterior sobre outros domínios estava errada e foi removida deste escopo.

Nesta correção, os únicos hostnames considerados são:
- `busaooffoff.com.br`
- `www.busaooffoff.com.br` (se estiver configurado/publicado)

Nenhum outro domínio foi incluído nesta implementação.

# 4. Estratégia adotada

A estratégia oficial passou a ser **somente a lógica centralizada no app**:
- a rota `/` continua entrando por `PublicRootRedirect`;
- `PublicRootRedirect` consulta `resolveCompanyDomainRedirect`;
- quando o hostname for `busaooffoff.com.br` ou `www.busaooffoff.com.br`, a raiz `/` redireciona para `/empresa/busaooffoff`;
- qualquer hostname não mapeado continua abrindo a landing normal;
- paths profundos não recebem nova regra nesta etapa.

# 5. Arquivos alterados

- `src/lib/companyDomainRouting.ts`
- `src/pages/public/PublicRootRedirect.tsx`
- `public/_redirects` (removido)
- `vercel.json` (removido)

# 6. O que foi removido do fluxo antigo

Foi removida a estratégia concorrente de publicação que ainda apontava para `/busaooffoff`:
- regras em `public/_redirects`;
- regras em `vercel.json`.

Com isso, o repositório deixa de manter duas decisões diferentes para o mesmo caso.

# 7. Regra oficial após a correção

Regra oficial atual:
- `https://busaooffoff.com.br/` -> `/empresa/busaooffoff`
- `https://www.busaooffoff.com.br/` -> `/empresa/busaooffoff` (se esse hostname estiver configurado e servindo o mesmo app)

A regra vale apenas para a raiz `/`.

# 8. Hostnames cobertos

Cobertos no código:
- `busaooffoff.com.br`
- `www.busaooffoff.com.br`

Hostnames não mapeados:
- continuam sem redirect especial;
- continuam usando a landing pública normal.

# 9. Resultado esperado

Depois desta correção:
- o fluxo deixa de depender de `/busaooffoff` como destino canônico;
- o redirecionamento fica centralizado em uma única estratégia auditável no app;
- a landing principal permanece intacta para qualquer hostname não mapeado;
- o comportamento continua restrito à raiz `/`.

# 10. Riscos conhecidos

- Se o domínio estiver sendo forçado externamente por configuração de publicação fora do repositório, o app só conseguirá aplicar a regra depois que a raiz chegar ao React.
- Se `www.busaooffoff.com.br` não estiver configurado para servir o mesmo projeto, o mapeamento em código não será suficiente por si só.
- A validação local confirma a regra no código, mas o comportamento final publicado ainda depende de o projeto servir a aplicação para esse hostname.

# 11. Checklist de validação

- [x] `busaooffoff.com.br/` aponta para `/empresa/busaooffoff` na estratégia oficial do repositório.
- [x] `www.busaooffoff.com.br/` também aponta para `/empresa/busaooffoff` no código, se estiver configurado/publicado.
- [x] Hostnames não mapeados continuam sem redirect especial.
- [x] `/busaooffoff` não permanece como destino canônico deste fluxo.
- [x] Não existem mais estratégias conflitantes no repositório para este caso.
- [x] O comportamento continua limitado à raiz `/`.
- [x] A landing principal não recebeu alteração funcional.
- [x] O código recebeu comentários objetivos sobre a decisão adotada.
- [x] Nenhum domínio fora do escopo foi incluído.
- [x] O antes e o depois ficaram documentados.
