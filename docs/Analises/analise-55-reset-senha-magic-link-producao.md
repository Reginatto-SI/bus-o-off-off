## 1. Resumo executivo

Foi mapeado o fluxo completo de `/admin/usuarios` e o diagnóstico indica um problema em **duas camadas ao mesmo tempo**:

1. **Causa raiz principal (confirmada no código):** a edge function `admin-user-auth-support` gera links via `supabaseAdmin.auth.admin.generateLink(...)` **sem informar `redirectTo`** (nem por ação, nem por ambiente). Assim, o `redirect_to` final depende exclusivamente da configuração de Auth do projeto Supabase (ex.: `SITE_URL`/allowlist), e não do domínio oficial de produção do app. Isso explica o link real observado com `redirect_to=https://busaooofoof.lovable.app`.
2. **Causa estrutural adicional (confirmada no front):** o app não possui rota/tela dedicada de redefinição de senha (ex.: `/reset-password`) nem tratamento explícito de evento/tipo de recuperação (`PASSWORD_RECOVERY`/`type=recovery`) para abrir UI de troca de senha. Com isso, mesmo quando a autenticação pelo link acontece, o usuário tende a cair no fluxo genérico de entrada (`/` => landing page).

Em conjunto, o sistema hoje pode: (a) redirecionar para domínio indevido; e (b) quando cai no domínio correto, não abrir uma tela específica de nova senha.

---

## 2. Fluxo atual mapeado

### 2.1 Origem em `/admin/usuarios`
- A ação **“Enviar redefinição de senha”** chama `handleSendRecovery`.
- A ação **“Reenviar ativação”** chama `handleResendConfirmation`.
- A ação **“Gerar magic link”** chama `handleGenerateMagicLink`.
- Todas passam por `invokeAuthSupportAction(...)`, que invoca a edge function `admin-user-auth-support`.

### 2.2 Backend usado para os 3 fluxos
- A edge function `admin-user-auth-support` recebe `action` e mapeia:
  - `send_recovery` -> `generateLink(type: "recovery")`
  - `resend_confirmation` -> `generateLink(type: "signup")`
  - `generate_magic_link` -> `generateLink(type: "magiclink")`
- Depois, envia o e-mail via `sendAuthEmailViaResend` usando `action_link` retornado por `generateLink`.

### 2.3 Onde o link final nasce
- O link clicável enviado no e-mail é exatamente `confirmationUrl` (ou seja, `action_link`) vindo do Supabase e repassado pelo template.
- Não há reescrita do `redirect_to` nos templates de e-mail.
- Logo, o `redirect_to` que aparece no link final é definido no momento da geração do link (Supabase Auth config + parâmetros da chamada).

### 2.4 Retorno ao front após clique no e-mail
- O fluxo retorna para a URL de redirecionamento do link (`redirect_to`).
- No app, a raiz `/` renderiza `PublicRootRedirect`.
- Se não houver regra de hostname específica, `PublicRootRedirect` devolve `LandingPage`.
- Não existe rota dedicada de redefinição para consumir recuperação e abrir formulário de nova senha.

---

## 3. Pontos exatos encontrados no código

### 3.1 Tela `/admin/usuarios` (origem das ações)
- `src/pages/admin/Users.tsx`
  - Menu de ações com os botões de auth.
  - `handleSendRecovery`, `handleResendConfirmation`, `handleGenerateMagicLink`.
  - `invokeAuthSupportAction` chama `supabase.functions.invoke('admin-user-auth-support', ...)`.

### 3.2 Função que gera links (ponto central do `redirect_to`)
- `supabase/functions/admin-user-auth-support/index.ts`
  - `ACTION_EMAIL_MAP` diferencia recovery/signup/magiclink.
  - Chamada crítica: `supabaseAdmin.auth.admin.generateLink({ type, email })` sem `options.redirectTo`.
  - `action_link` retornado é enviado por e-mail e, no caso de magic link, também retornado para cópia no modal.

### 3.3 Envio de e-mail e botão
- `supabase/functions/_shared/auth-email-resend.ts`
  - `sendAuthEmailViaResend` envia `confirmationUrl: actionLink` para o template.
- `supabase/functions/_shared/email-templates/recovery.tsx`
- `supabase/functions/_shared/email-templates/magic-link.tsx`
- `supabase/functions/_shared/email-templates/signup.tsx`
  - Botões usam `href={confirmationUrl}` sem alterar query params.

### 3.4 Roteamento/consumo no front
- `src/App.tsx`
  - Não existe rota específica de reset de senha.
  - `/` vai para `PublicRootRedirect`.
- `src/pages/public/PublicRootRedirect.tsx`
  - Em host comum, retorna landing page.
- `src/contexts/AuthContext.tsx`
  - Há listener global `onAuthStateChange`, mas sem tratamento explícito de evento de recuperação para direcionar usuário a uma tela de troca de senha.

### 3.5 Evidências de configuração de domínio no código
- `supabase/functions/_shared/auth-email-resend.ts` e `supabase/functions/auth-email-hook/index.ts` trazem `siteUrl`/`SITE_URL` fixos para branding textual do e-mail, **mas isso não define o `redirect_to` do link do Supabase**.
- `supabase/config.toml` não contém configuração de `SITE_URL`/allowlist de Auth (isso é externo, no projeto Supabase).

---

## 4. Diagnóstico da causa raiz

### 4.1 Causa raiz confirmada
- **O `redirect_to` está fora do controle do fluxo admin atual**, porque `generateLink` é chamado sem `redirectTo` explícito. Nesse cenário, o link segue o default configurado no Supabase Auth (ou configuração legada), o que é compatível com o caso real apontando para domínio Lovable.

### 4.2 Causas secundárias confirmadas
- Ausência de rota/tela de reset no front para experiência dedicada de “criar nova senha”.
- Ausência de tratamento explícito de retorno de recovery/magiclink para separar fluxos de autenticação comum vs troca de senha.
- A própria tela `/admin/minha-conta` usa `resetPasswordForEmail(..., redirectTo: ${window.location.origin}/login)`, reforçando que o sistema está orientado a retornar para `/login`, não para uma página de nova senha.

### 4.3 Riscos correlatos
- Mesmo corrigindo domínio no Supabase, o usuário pode continuar sem UX clara de redefinição (cai em rota genérica).
- Os três fluxos administrativos (`recovery`, `signup`, `magiclink`) compartilham a mesma geração de link; portanto, erro de `redirect_to` afeta múltiplos cenários.

### 4.4 Dúvidas ainda em aberto (dependem de ambiente externo)
- Valor atual de `SITE_URL` e lista de Redirect URLs no painel Supabase de produção.
- Se existe sobreposição de ambientes (projeto Supabase de preview ligado ao front de produção em algum deploy específico).
- Se o allowlist de redirects já inclui `https://www.smartbusbr.com.br/*` e `https://www.smartbusbr.com.br/login`.

---

## 5. Impacto prático

### 5.1 Redefinição de senha
- E-mail chega, mas o link pode voltar para host errado (Lovable) por `redirect_to` incorreto.
- Mesmo no host correto, não há tela dedicada de redefinição; experiência final tende à navegação genérica (landing/login/dashboard conforme sessão/role).

### 5.2 Ativação de usuário (signup/resend)
- Usa a mesma estratégia de geração de link sem `redirectTo`; portanto está sujeito ao mesmo desvio de domínio.

### 5.3 Magic link
- Também usa `generateLink` sem `redirectTo`; portanto, pode carregar `redirect_to` inválido da configuração default.
- Como o link é exibido para cópia no modal admin, o problema fica visível de forma imediata no parâmetro da URL.

### 5.4 Experiência em produção
- Usuário final percebe fluxo “quebrado”: recebe e-mail válido, clica, autentica parcialmente, mas não chega na etapa esperada de criação de senha.
- Operação de suporte perde confiança porque o sintoma parece intermitente entre ambientes.

---

## 6. Proposta de correção mínima e segura

> Não implementada neste relatório; apenas proposta técnica mínima.

1. **Fixar `redirectTo` explicitamente na geração dos links administrativos** (`admin-user-auth-support`) com URL canônica de produção e rotas permitidas por fluxo (ex.: login ou rota dedicada já existente, se houver).
2. **Alinhar configuração Supabase Auth de produção**:
   - `SITE_URL` em `https://www.smartbusbr.com.br`;
   - allowlist de redirects contendo URLs efetivamente usadas pelo app (produção e preview).
3. **Escolher um destino único e consistente por tipo de link** (recovery, magiclink, signup) e manter isso documentado no backend.
4. **Correção mínima de UX (sem refatoração ampla):** adicionar/validar uma rota de destino que realmente permita concluir reset de senha (se já existir internamente, apontar para ela; se não existir, avaliar ajuste mínimo controlado no fluxo atual de login para tratar recuperação sem criar arquitetura nova).

---

## 7. Checklist de validação

### 7.1 Produção
- [ ] Gerar link de recovery em `/admin/usuarios` e validar `redirect_to` = `https://www.smartbusbr.com.br/...`.
- [ ] Clicar no e-mail de recovery em aba anônima (usuário deslogado) e confirmar abertura do fluxo de nova senha.
- [ ] Repetir com usuário já autenticado no navegador.

### 7.2 Preview
- [ ] Gerar link em ambiente preview e confirmar que o `redirect_to` desse ambiente não contamina produção.
- [ ] Validar que preview usa apenas domínio/rota permitidos no allowlist de preview.

### 7.3 Redefinição de senha
- [ ] Confirmar envio e conclusão da troca de senha.
- [ ] Confirmar login com senha nova e bloqueio da senha antiga.

### 7.4 Magic link
- [ ] Gerar magic link no admin, copiar URL e validar `redirect_to` coerente com ambiente.
- [ ] Validar login por magic link com usuário deslogado e já logado.

### 7.5 Ativação
- [ ] Reenviar ativação e confirmar link com domínio correto.
- [ ] Confirmar estado final de `email_confirmed_at` após clique.

### 7.6 Regressão de roteamento
- [ ] Garantir que `PublicRootRedirect` continua funcionando para domínio público sem quebrar landing.
- [ ] Garantir que o fluxo admin/login não entra em loop de redirecionamento.

---

## 8. Perguntas obrigatórias, se restar qualquer ambiguidade

1. Qual é hoje (no painel Supabase de produção) o valor exato de `SITE_URL` e da lista de Redirect URLs permitidas?
2. O comportamento esperado pós-clique para **recovery** deve abrir qual rota exata do app (URL final funcional já homologada)?
3. Existe no produto uma tela oficial já aprovada para “definir nova senha” que não está roteada, ou a decisão é manter tudo no `/login`?
4. Há mais de um projeto Supabase ativo (prod/preview) sendo usado por deploys diferentes do mesmo frontend?
5. Devemos padronizar `redirectTo` explícito por ação (`recovery`, `signup`, `magiclink`) diretamente no backend para eliminar dependência de defaults globais?
