## 1. Resumo executivo

Foi aplicada a correção mínima e segura em dois pontos:

1. **Backend admin auth links:** a edge function `admin-user-auth-support` passou a gerar links com `redirectTo` explícito por ação (`recovery`, `signup`, `magiclink`), eliminando dependência de default silencioso do Supabase.
2. **Front recovery flow:** a tela de login passou a reconhecer o contexto de recuperação e permitir a definição de nova senha no próprio fluxo, sem cair na landing genérica.

Com isso, os links administrativos deixam de herdar redirect legado para `lovable.app` e o usuário consegue concluir a redefinição de senha de forma funcional.

---

## 2. Problema confirmado

A causa raiz já validada e agora corrigida era composta por dois fatores combinados:

- **Ausência de `redirectTo` explícito** na chamada `generateLink(...)` do backend administrativo.
- **Ausência de tratamento adequado de recovery no front**, que fazia o usuário entrar no fluxo genérico após o clique do e-mail.

---

## 3. Arquivos alterados

1. `supabase/functions/admin-user-auth-support/index.ts`
   - inclusão de resolução explícita de base URL de redirect (`ADMIN_AUTH_REDIRECT_BASE_URL`/`PUBLIC_APP_URL` com fallback oficial `https://www.smartbusbr.com.br`);
   - mapeamento de destino por ação (`/login?flow=recovery`, `/login?flow=signup`, `/login?flow=magiclink`);
   - `generateLink` atualizado para enviar `options.redirectTo`.

2. `src/pages/Login.tsx`
   - detecção de fluxo por query/hash (`flow` e `type`);
   - tratamento dedicado para `recovery` com formulário de nova senha;
   - atualização de senha via `supabase.auth.updateUser({ password })`;
   - encerramento controlado do fluxo (sign out + mensagem de sucesso para próximo login).

3. `analise-56-correcao-reset-auth-links.md`
   - documentação do que foi corrigido, estratégia, riscos e checklist.

---

## 4. Estratégia aplicada

Estratégia mínima escolhida:

- **Não refatorar arquitetura** de auth inteira.
- **Reaproveitar rota existente `/login`** como ponto único de retorno dos links administrativos.
- **Controlar o tipo de fluxo por parâmetro explícito** (`flow`) definido no backend por ação.
- **Aplicar UI mínima no login** para recovery sem criar novo sistema paralelo.

Essa abordagem reduz superfície de risco, mantém padrão atual e resolve diretamente as duas causas raízes.

---

## 5. Fluxo final após correção

1. Admin em `/admin/usuarios` aciona recovery/ativação/magic link.
2. `admin-user-auth-support` gera link com `redirectTo` explícito e domínio canônico.
3. Usuário recebe e-mail com `action_link` já contendo destino controlado.
4. Ao clicar:
   - `recovery` retorna para `/login?flow=recovery`, o front reconhece e abre formulário de nova senha.
   - `magiclink` retorna para `/login?flow=magiclink`, o fluxo de sessão continua na entrada padrão.
   - `signup` retorna para `/login?flow=signup`, mantendo entrada consistente para primeiro acesso.
5. Em recovery, após salvar nova senha, o usuário recebe confirmação e segue para login com a senha nova.

---

## 6. Riscos e cuidados

- O valor final de `redirectTo` depende da configuração de env da função (`ADMIN_AUTH_REDIRECT_BASE_URL`/`PUBLIC_APP_URL`) quando presente; sem env, cai no domínio oficial de produção (fallback explícito).
- Para preview, é necessário configurar env específico no deploy da função para não usar domínio de produção por padrão.
- O fluxo recovery exige sessão válida pós-clique (comportamento padrão do Supabase); links expirados continuarão exigindo novo envio.

---

## 7. Checklist de validação executado

### Validado no código
- [x] `admin-user-auth-support` passou a informar `redirectTo` explicitamente.
- [x] recovery/magiclink/signup agora usam destino explícito por ação.
- [x] retorno de recovery é tratado no front sem cair diretamente na landing.
- [x] existe fluxo funcional para definição de nova senha no login.
- [x] ajuste implementado sem refatoração ampla de auth/roteamento.

### Validado por comando
- [x] build de produção executado com sucesso.
- [x] teste automatizado (`src/test/example.test.ts`) executado com sucesso.

### Ainda depende de teste manual em ambiente
- [ ] conferir URL final de e-mail gerado (recovery/magiclink/signup) no ambiente de produção.
- [ ] validar cenário de usuário deslogado e usuário já logado para cada fluxo.
- [ ] validar configuração de env para preview na edge function.
