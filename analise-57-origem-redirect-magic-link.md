## 1. Resumo executivo

O link de magic link continuar saindo com `redirect_to=https://busaooofoof.lovable.app` após o commit indica, com alta confiança, **desalinhamento entre código esperado e runtime real**.

Conclusão objetiva desta auditoria:

1. O frontend de `/admin/usuarios` realmente chama a edge function `admin-user-auth-support` para gerar magic link.
2. O código atual dessa função (no repositório) passou a enviar `options.redirectTo` explícito para `.../login?flow=magiclink`.
3. O link observado em runtime não contém esse padrão (`/login?flow=magiclink`) e mantém o `redirect_to` antigo de preview.
4. Portanto, o comportamento atual é consistente com **uma destas causas em produção** (ordem de probabilidade):
   - função antiga ainda publicada (deploy da function não refletiu o commit);
   - app/runtime apontando para outro ambiente/projeto que não recebeu a versão corrigida;
   - ambiente da function com configuração externa antiga que não foi auditada/publicada junto.

Não há evidência de fluxo paralelo no frontend gerando esse link fora de `admin-user-auth-support`.

---

## 2. Fluxo real executado em runtime

1. Usuário clica em **“Gerar magic link”** na tela `/admin/usuarios`.
2. A tela chama `handleGenerateMagicLink`.
3. `handleGenerateMagicLink` chama `invokeAuthSupportAction(..., 'generate_magic_link')`.
4. `invokeAuthSupportAction` invoca `supabase.functions.invoke('admin-user-auth-support', { body: ... })`.
5. A resposta da function preenche `magicLinkValue` com `response.data?.action_link`.
6. O modal mostra exatamente `magicLinkValue`.

Resultado: a URL exibida no modal vem diretamente do backend `admin-user-auth-support` e não de montagem local no frontend.

---

## 3. Evidências encontradas

### 3.1 Front chama exatamente `admin-user-auth-support`
- Em `src/pages/admin/Users.tsx`, as ações auth (recovery/signup/magiclink) usam `invokeAuthSupportAction`.
- Essa função invoca apenas `admin-user-auth-support`.
- O magic link exibido no modal vem de `response.data?.action_link` da própria resposta da function.

### 3.2 Código atual da function envia `redirectTo` explícito
- Em `supabase/functions/admin-user-auth-support/index.ts`:
  - `generate_magic_link` mapeia para `${baseUrl}/login?flow=magiclink`;
  - chamada `generateLink` inclui `options: { redirectTo }`.

### 3.3 Projeto Supabase configurado no app/repo
- `.env` local e `supabase/config.toml` apontam para `cdrcyjrvurrphnceromd`.
- Endpoint da function ativa responde com `sb-project-ref: cdrcyjrvurrphnceromd` (probe HTTP).

### 3.4 Fluxos alternativos que também geram link existem, mas não são a origem do modal
- `create-user` também usa `auth.admin.generateLink(type: 'signup')`, porém é fluxo de criação de usuário, não do botão “Gerar magic link”.
- `MyAccount` usa `resetPasswordForEmail`, sem relação com o modal de magic link em `/admin/usuarios`.

### 3.5 Limitações objetivas da auditoria
- Não há acesso ao painel Supabase para ler/envs reais da function (`ADMIN_AUTH_REDIRECT_BASE_URL` / `PUBLIC_APP_URL`) nem para listar revisão publicada da edge function.
- `supabase` CLI não está disponível neste ambiente para inspecionar deploy remoto.

---

## 4. Causa raiz confirmada

### Causa raiz principal (confirmada por evidência de comportamento)
**Mismatch de publicação/runtime da edge function `admin-user-auth-support` em relação ao código corrigido do repositório.**

Justificativa:
- Se a versão corrigida estivesse ativa com `redirectTo` explícito para magic link, o `redirect_to` do link final deveria conter `/login?flow=magiclink`.
- O link observado continua com root antiga `https://busaooofoof.lovable.app` sem o destino esperado do código novo.
- Isso é incompatível com a saída prevista do código atual e aponta para runtime não alinhado.

### Causa secundária possível (a confirmar no painel)
- Env remota da function (`ADMIN_AUTH_REDIRECT_BASE_URL` / `PUBLIC_APP_URL`) com valor legado poderia manter host antigo, porém ainda seria esperado o sufixo `/login?flow=magiclink` na URL se o código novo estivesse ativo.

---

## 5. Diferença entre código esperado e runtime real

### Código esperado
- `generate_magic_link` envia `redirectTo = <base>/login?flow=magiclink`.
- `action_link` deveria carregar esse `redirect_to` explícito.

### Runtime real observado
- Link segue saindo com `redirect_to=https://busaooofoof.lovable.app`.
- Não há indício no link de que o destino novo com `flow=magiclink` foi aplicado.

### Interpretação
- A função executada no ambiente que gera esse link não está refletindo, na prática, a versão corrigida esperada (ou está usando configuração remota conflitante antes da correção entrar em vigor).

---

## 6. Correção mínima recomendada

1. **Confirmar publicação da edge function corrigida no mesmo projeto `cdrcyjrvurrphnceromd`** e registrar evidência operacional (timestamp/revisão/deploy log).
2. **Auditar envs remotas da function**:
   - `ADMIN_AUTH_REDIRECT_BASE_URL`
   - `PUBLIC_APP_URL`
   - remover valor legado `busaooofoof.lovable.app` se existir.
3. **No painel Supabase Auth**, validar:
   - `SITE_URL` atual;
   - Redirect URLs permitidas, incluindo `https://www.smartbusbr.com.br/login?flow=magiclink` e variações necessárias.
4. **Homologar em runtime após deploy**:
   - acionar “Gerar magic link”;
   - conferir no modal se `redirect_to` contém domínio oficial + `/login?flow=magiclink`.

Essa é a menor ação segura: sem refatorar auth, apenas alinhando publicação/ambiente e confirmando configuração externa.

---

## 7. Checklist de validação

- [x] Confirmado no código que `/admin/usuarios` usa `admin-user-auth-support` para magic link.
- [x] Confirmado no código local que `generateLink` está com `options.redirectTo` explícito.
- [x] Confirmado que existem outros pontos de geração de link no repositório, mas não no fluxo do modal de magic link.
- [x] Confirmado que o projeto alvo no repo/.env é `cdrcyjrvurrphnceromd`.
- [ ] Confirmar no Supabase dashboard a revisão/deploy ativo da function `admin-user-auth-support`.
- [ ] Confirmar valores atuais de env da function no ambiente publicado.
- [ ] Confirmar `SITE_URL` e allowlist de redirects no Auth.
- [ ] Reexecutar geração de magic link pós-publicação e validar URL final no modal.
