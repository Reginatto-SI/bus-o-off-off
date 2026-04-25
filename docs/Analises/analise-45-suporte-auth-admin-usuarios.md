# Análise — suporte administrativo de autenticação em `/admin/usuarios`

## 1. Resumo executivo

### Situação atual
- A tela `/admin/usuarios` está estruturada como CRUD administrativo de **perfil e vínculo de acesso** (role, status ativo/inativo, vínculo vendedor/motorista), mas **não expõe ações de suporte de autenticação** (reset por admin, reenvio de ativação, magic link, status auth detalhado). 
- O fluxo de login operacional do sistema é apenas por e-mail/senha na rota `/login`, sem UI pública para “esqueci minha senha”.
- Existe infraestrutura de envio de e-mail em backend (hook de e-mail de auth via Resend e pipeline de fila via `process-email-queue`), mas há sinais de coexistência de dois mecanismos e ausência de observabilidade acessível no painel admin.

### Principais lacunas
1. **Admin `/admin/usuarios` sem ações de suporte auth** no menu `...` (somente Editar e Ativar/Desativar).
2. **Sem visibilidade de estado auth** (email confirmado, último login, último envio de e-mail) na listagem/admin.
3. **Sem trilha operacional no frontend** para investigar “usuário não recebe e-mail”.
4. **Sem endpoint dedicado** para ações de suporte auth por admin com escopo multiempresa e auditoria.

### Impacto operacional
- Caso real reportado (usuário esqueceu senha e não recebe e-mail) hoje depende de tentativa manual do próprio usuário ou ações indiretas, sem ferramental claro para suporte.
- Time operacional não consegue distinguir com segurança se a falha é:
  - inexistência de fluxo acionável,
  - problema em provedor/secret/deploy,
  - bloqueio por supressão/bounce,
  - erro no hook de auth.

### Recomendação objetiva
- Implementar **MVP mínimo** de suporte auth em `/admin/usuarios` via **uma Edge Function nova de suporte** (com validação de papel + `company_id`) e **ações no menu existente**.
- Reaproveitar os padrões existentes de UI (ActionsDropdown, toast, modal leve) e de segurança (validação por `user_roles` + company scope).
- Incluir observabilidade mínima (status auth + últimos eventos de envio) antes de expandir escopo.

---

## 2. Diagnóstico do estado atual

### 2.1 O que existe hoje (confirmado)

#### Tela `/admin/usuarios`
- Rota existe em `App.tsx`: `"/admin/usuarios" -> <UsersPage />`.
- A página carrega usuários a partir de `user_roles` + `profiles`, com joins auxiliares de `sellers` e `drivers`.
- O menu de ações por linha (`ActionsDropdown`) possui apenas:
  - **Editar**
  - **Ativar/Desativar** (via update em `profiles.status`).
- Criação de usuário usa Edge Function `create-user` com `supabase.functions.invoke('create-user')`.

#### Fluxo de criação de usuário admin (parcial auth)
- `create-user`:
  - valida autorização (gerente/developer),
  - cria ou vincula usuário em `auth.users`,
  - grava vínculo em `user_roles` por `company_id`,
  - tenta gerar link `recovery` e `magiclink` (sem retorno ao frontend do link/resultado detalhado por canal).

#### Fluxo de redefinição de senha existente (não em `/admin/usuarios`)
- Em `/admin/minha-conta`, existe botão para enviar reset para o **próprio usuário logado** via `supabase.auth.resetPasswordForEmail(user.email)`.
- Não há equivalente para um admin acionar reset em outro usuário na tela `/admin/usuarios`.

#### Integração de e-mail (backend)
- Edge Function `auth-email-hook` renderiza templates auth e envia via **Resend** (`RESEND_API_KEY`).
- Existe infra de fila no banco (`email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`) + worker `process-email-queue` com `LOVABLE_API_KEY`.

### 2.2 O que não existe hoje
- Ações administrativas em `/admin/usuarios` para:
  - enviar redefinição de senha para usuário selecionado,
  - reenviar confirmação de e-mail,
  - gerar/copiar magic link,
  - visualizar status auth (confirmado/não confirmado, último login),
  - consultar motivo provável de falha de e-mail.
- Tela/admin report dedicada para logs de envio (`email_send_log`) e supressões.
- Mensageria operacional orientada por causa (ex.: “domínio sem DKIM/SPF”, “provedor rate-limited”, “e-mail suprimido”).

### 2.3 O que existe parcialmente
- Geração de `recovery`/`magiclink` já é tentada dentro de `create-user`, porém:
  - acoplada ao cadastro, não como ação de suporte sob demanda;
  - sem retorno de link copiable no frontend;
  - sem observabilidade consistente na UI.
- Infra de auditoria de e-mail existe no schema, mas sem consumo na área admin para troubleshooting.

---

## 3. Fluxo atual de autenticação

## 3.1 Cadastro

### Cadastro público de empresa (`/cadastro`)
- Frontend chama `register-company`.
- Backend cria usuário em `auth.users` com `email_confirm: true` (pré-confirmado), cria empresa e vínculo `user_roles` (gerente), depois faz auto-login no frontend.
- Implicação: nesse fluxo específico, não há dependência de confirmação por e-mail para entrar no sistema.

### Cadastro admin de usuário (`/admin/usuarios`)
- Frontend chama `create-user`.
- Backend pode:
  - vincular usuário existente à empresa, ou
  - criar novo usuário (`email_confirm: false`) e tentar `generateLink` de `recovery` e `magiclink`.
- O frontend não recebe/mostra status auth granular (confirmado/não confirmado, link gerado etc.).

## 3.2 Login
- Login único atual em `/login` via `signInWithPassword`.
- Não foi encontrada UI de “esqueci minha senha” na tela de login.

## 3.3 Recuperação de senha
- Existe chamada `supabase.auth.resetPasswordForEmail` apenas em `/admin/minha-conta` para o próprio usuário.
- Não foi encontrado fluxo público dedicado (rota específica) de recuperação.

## 3.4 Magic link
- Templates e suporte backend existem (`magic-link.tsx`, `auth-email-hook`, `create-user` usa `generateLink(type: "magiclink")`).
- Não há ação administrativa explícita para gerar/copiá-lo em `/admin/usuarios`.

## 3.5 Envio de e-mail e erro
- `auth-email-hook` tem logs de erro via `console.error` e retorna 500 em falha Resend.
- `process-email-queue` possui logging persistente em `email_send_log` com estados (`sent`, `failed`, `rate_limited`, `dlq`, etc.).
- Não há evidência de UI no admin consumindo esses registros para suporte operacional.

---

## 4. Fluxo atual da tela `/admin/usuarios`

## 4.1 Estrutura geral
- Página segue padrão admin consolidado (AdminLayout, PageHeader, StatsCard, FilterCard, Table, Dialog com Tabs), alinhada ao estilo documentado na tela piloto `/admin/frota`.

## 4.2 Fonte de dados
- Fonte primária: tabela `user_roles` filtrada por `activeCompanyId`.
- Enriquecimento: `profiles` por `user_id`; `sellers` e `drivers` por ids de vínculo.

## 4.3 CRUD atual
- Create:
  - via Edge Function `create-user`.
- Update:
  - `profiles` (nome, status, notes),
  - `user_roles` (role, seller_id, driver_id, operational_role).
- Ativar/Desativar:
  - update de `profiles.status`.

## 4.4 Menu de ações `...`
- Atualmente só tem:
  - Editar
  - Ativar/Desativar
- Não há submenu/ações auth de suporte.

## 4.5 Dados de autenticação disponíveis na tela
- Exibidos hoje: nome, e-mail, perfil, vínculo, status de perfil.
- Não exibidos: `email_confirmed_at`, `last_sign_in_at`, tentativas/falhas de envio, origem da última ação auth.

## 4.6 Limites atuais
- A tela resolve gestão de perfil/vínculo, mas não resolve operação de suporte auth.
- Para o cenário “esqueceu senha e não recebe e-mail”, faltam gatilhos e diagnóstico diretamente no fluxo admin.

---

## 5. Integração de e-mail

## 5.1 Serviço/arquitetura identificados
- **Auth e-mails customizados via Resend** em `auth-email-hook` (`RESEND_API_KEY`).
- **Pipeline de fila** com tabelas/RPC + worker `process-email-queue` (`LOVABLE_API_KEY`).

## 5.2 Onde está a implementação
- Hook auth: `supabase/functions/auth-email-hook/index.ts`.
- Worker de fila: `supabase/functions/process-email-queue/index.ts`.
- Infra SQL: `supabase/migrations/20260326233235_email_infra.sql`.
- Config de funções: `supabase/config.toml`.

## 5.3 Funcionalidade ativa vs incompleta
- Ativo em código:
  - templates de signup/invite/magic/recovery etc.,
  - envio Resend no hook,
  - estrutura de log/supressão/rate-limit na fila.
- Incompleto para operação:
  - não há confirmação, neste repositório, de secrets e bindings no ambiente de execução atual;
  - não há interface administrativa para inspecionar `email_send_log`/`suppressed_emails`;
  - não há rastreabilidade de “por que este usuário não recebeu” no fluxo `/admin/usuarios`.

## 5.4 Dependências críticas (secrets/config)
- `RESEND_API_KEY` (hook auth).
- `LOVABLE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` (worker queue).
- Comentários da migration indicam etapa pós-migração dinâmica (vault secret + cron job) necessária para o worker operar continuamente.

## 5.5 Falhas e riscos observados
- Risco de **erro silencioso operacional** do ponto de vista do admin: backend pode falhar e a equipe não ter painel para diagnóstico.
- Potencial coexistência de mecanismos (hook direto vs fila) aumenta necessidade de clareza de arquitetura operacional no ambiente.

---

## 6. Análise de segurança e permissão

## 6.1 Quem pode executar hoje
- A tela `/admin/usuarios` no frontend exige `isGerente` para acesso.
- A função `create-user` permite `gerente` ou `developer` e valida `company_id` contra vínculos do solicitante (developer com bypass).

## 6.2 Multiempresa / isolamento
- Fluxo de listagem usa `activeCompanyId` no frontend.
- RLS de `user_roles` foi endurecido para company scope (`user_belongs_to_company` + papéis gerente/developer).
- `create-user` também reforça company scope no backend antes de criar/vincular.

## 6.3 Riscos de exposição cruzada
- Sem backend dedicado para ações de suporte auth, se implementação futura for feita só no frontend com client padrão, não terá acesso seguro a dados de `auth.users` e pode induzir atalhos inseguros.
- Qualquer ação sensível (reset/ativação/magic) deve ficar em Edge Function com service role + validação explícita de company scope.

## 6.4 Recomendação de autorização futura
- Permitir ações de suporte auth para `gerente` e `developer`.
- Bloquear para operador/vendedor/motorista.
- Sempre validar: solicitante pertence à `company_id` alvo (ou é developer autorizado global).

---

## 7. Ações administrativas recomendadas

### Ação: Enviar redefinição de senha
- Já existe base pronta? **parcial**
- Exige backend novo? **sim** (para acionar em usuário terceiro de forma segura)
- Exige ajuste visual? **sim** (adicionar item no menu `...`)
- Risco operacional: envio falhar sem feedback técnico; abuso se sem rate-limit/auditoria.
- Recomendação: criar endpoint admin dedicado (`send-password-recovery`) com validação de company scope + log de ação.

### Ação: Reenviar e-mail de ativação/confirmação
- Já existe base pronta? **parcial** (`email_confirm` e templates existem)
- Exige backend novo? **sim**
- Exige ajuste visual? **sim**
- Risco operacional: reenvios indevidos para e-mails errados; suporte sem saber estado atual de confirmação.
- Recomendação: endpoint admin para `resend-confirmation` + retorno de estado (`already_confirmed`, `sent`, `blocked`).

### Ação: Gerar link mágico
- Já existe base pronta? **parcial** (`generateLink(type: magiclink)` em `create-user`)
- Exige backend novo? **sim** (ação sob demanda fora do cadastro)
- Exige ajuste visual? **sim**
- Risco operacional: compartilhamento indevido do link; expiração não clara.
- Recomendação: gerar sob demanda e exibir com aviso de validade/uso único + registrar auditoria.

### Ação: Copiar link mágico
- Já existe base pronta? **não** (não há retorno de link no fluxo atual da tela)
- Exige backend novo? **sim** (retornar URL de ação segura)
- Exige ajuste visual? **sim**
- Risco operacional: exposição do link em ambiente compartilhado.
- Recomendação: só habilitar para papéis autorizados, mostrar confirmação explícita antes de copiar.

### Ação: Ver status de autenticação
- Já existe base pronta? **parcial** (dados existem em `auth.users`, não na tela)
- Exige backend novo? **sim** (consulta segura a metadata auth)
- Exige ajuste visual? **sim** (coluna/modal de detalhes)
- Risco operacional: interpretação errada sem contexto (confirmado mas bloqueado por outro motivo).
- Recomendação: exibir no mínimo `email_confirmed`, `last_sign_in_at`, `created_at auth`, e último resultado de envio.

### Ação: Ver último acesso
- Já existe base pronta? **parcial** (campo existe em auth, não exposto)
- Exige backend novo? **sim**
- Exige ajuste visual? **sim**
- Risco operacional: timezone e consistência sem padronização.
- Recomendação: mostrar data/hora local padronizada + fallback “não disponível”.

### Ação: Forçar troca de senha no próximo login
- Já existe base pronta? **não confirmada**
- Exige backend novo? **sim** (e possivelmente schema/flag adicional)
- Exige ajuste visual? **sim**
- Risco operacional: introduzir regra nova sem base nativa clara pode criar fluxo paralelo/confuso.
- Recomendação: **não implementar agora** sem validação humana e desenho explícito de regra.

---

## 8. Proposta de implementação mínima

1. **Backend mínimo (novo endpoint único de suporte auth)**
   - Ex.: `admin-user-auth-support` com ações:
     - `send_recovery`
     - `resend_confirmation`
     - `generate_magic_link`
     - `get_auth_status`
   - Entrada obrigatória: `target_user_id`, `target_company_id`, `action`.
   - Validação:
     - solicitante com papel `gerente|developer`;
     - solicitante pertence à empresa alvo (ou developer global).
   - Saída padronizada para UI (`success`, `status_code`, `message`, `details`).

2. **Frontend mínimo em `/admin/usuarios`**
   - Reaproveitar `ActionsDropdown` para incluir novos itens.
   - Reaproveitar toasts e padrões de loading existentes.
   - Opcional mínimo: modal de “Status de autenticação” com dados retornados do endpoint.

3. **Observabilidade mínima**
   - Retornar no endpoint (quando possível) os últimos eventos relevantes de envio para o e-mail alvo (`email_send_log`), sem expor dados sensíveis além do necessário.
   - Registrar auditoria de ação administrativa (quem acionou, quando, para qual usuário/empresa, qual ação).

4. **Sem refatoração ampla**
   - Não alterar arquitetura de login.
   - Não criar nova tela admin dedicada nesta primeira etapa.
   - Não mexer em fluxos não relacionados.

---

## 9. Dúvidas e pontos que exigem validação humana

1. Qual mecanismo oficial deve prevalecer para auth e-mails no ambiente atual: **hook Resend**, **fila Lovable**, ou ambos com escopos distintos?
2. No ambiente alvo, os secrets estão configurados e válidos (`RESEND_API_KEY`, `LOVABLE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)?
3. O domínio remetente (`noreply@smartbusbr.com.br`) está totalmente validado (SPF/DKIM/DMARC) no provedor atual?
4. Existe exigência de compliance para armazenar/ocultar link mágico em logs e interface?
5. `developer` deve visualizar/operar `/admin/usuarios` no frontend (hoje a página faz gate por `isGerente`)?
6. O negócio realmente quer “forçar troca de senha no próximo login” nesta fase, mesmo sem base explícita confirmada no código?

---

## 10. Checklist técnico

### Arquivos analisados
- `src/pages/admin/Users.tsx`
- `docs/admin-frota-crud.md`
- `src/App.tsx`
- `src/pages/Login.tsx`
- `src/pages/admin/MyAccount.tsx`
- `src/pages/public/CompanyRegistration.tsx`
- `src/contexts/AuthContext.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `supabase/functions/create-user/index.ts`
- `supabase/functions/register-company/index.ts`
- `supabase/functions/auth-email-hook/index.ts`
- `supabase/functions/process-email-queue/index.ts`
- `supabase/config.toml`
- `supabase/migrations/20260131001444_f8dbc20e-05dd-47eb-ad12-40b328fb2e48.sql`
- `supabase/migrations/20260202171332_8acbfe56-85f4-44c7-b190-94da97960f46.sql`
- `supabase/migrations/20260206012325_3c3f6d6c-e326-4ef6-8575-dd037a88ad7c.sql`
- `supabase/migrations/20260214220504_640ac2c6-73ce-426e-8ce4-6eeb995e3979.sql`
- `supabase/migrations/20260323170000_fix_user_roles_rls_and_profile_company_trigger.sql`
- `supabase/migrations/20260326233235_email_infra.sql`
- `src/types/database.ts`
- `src/integrations/supabase/types.ts`

### Funções analisadas
- Frontend:
  - `fetchUsers`, `handleSubmit`, `handleToggleStatus`, `getUserActions` (`Users.tsx`)
  - `handleSendResetLink` (`MyAccount.tsx`)
- Edge Functions:
  - `create-user`
  - `register-company`
  - `auth-email-hook`
  - `process-email-queue`
- SQL helpers/policies:
  - `is_admin`, `is_developer`, `user_belongs_to_company`, `handle_new_user`

### Telas analisadas
- `/admin/usuarios`
- `/admin/minha-conta`
- `/login`
- `/cadastro`

### Tabelas/entidades analisadas
- `profiles`
- `user_roles`
- `companies`
- `auth.users` (indiretamente via Edge Functions)
- `email_send_log`
- `email_send_state`
- `suppressed_emails`
- `email_unsubscribe_tokens`

### Pendências
- Confirmar configuração real de secrets e deploys no ambiente.
- Confirmar política oficial de envio auth (hook vs fila) para evitar fluxo duplicado.
- Validar com negócio se `developer` deve ter acesso frontend à tela de usuários.

---

## Encerramento objetivo (respostas diretas solicitadas)

- O sistema já consegue suportar **reset de senha por admin**? **Não, diretamente na tela `/admin/usuarios` não. Existe base parcial via APIs/auth e via “Minha Conta” apenas para o próprio usuário.**
- O sistema já consegue suportar **reenvio de ativação por admin**? **Não, não há ação/admin flow pronto na tela atual.**
- O sistema já consegue **gerar magic link por admin**? **Parcial: backend usa `generateLink(magiclink)` no cadastro, mas não existe ação sob demanda no admin com retorno utilizável.**
- O principal problema parece ser:
  - **ausência de funcionalidade operacional na tela admin**,
  - combinada com **falta de observabilidade no frontend**,
  - e possível **incerteza/configuração de integração de e-mail** (a validar em ambiente).
- Ordem recomendada dos próximos ajustes:
  1. Definir e validar arquitetura oficial de envio auth no ambiente (hook/fila/secrets).
  2. Criar endpoint único de suporte auth admin com segurança multiempresa.
  3. Expor ações mínimas no menu `...` de `/admin/usuarios`.
  4. Exibir status auth e rastros essenciais para troubleshooting.
  5. Só depois avaliar ações avançadas (ex.: forçar troca de senha).
