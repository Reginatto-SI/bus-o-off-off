

# Plano: Corrigir fluxos de cadastro público + build errors nas edge functions

## Diagnóstico

### Problema de produto (cadastro representante e empresa)
Ambos os fluxos (`register-representative` e `register-company`) usam `listUsers()` para checar e-mail duplicado e **bloqueiam completamente** se o e-mail já existe — mesmo que o usuário pudesse legitimamente ter um segundo papel (ex: já é gerente de empresa e quer ser representante, ou vice-versa).

### Decisão recomendada: **Reutilizar conta existente e anexar papel**
Justificativa:
- A arquitetura já suporta múltiplos papéis por usuário (`user_roles` com constraint `user_id + company_id`)
- Representante é vinculado por `representatives.user_id`, não por empresa
- Bloquear completamente desperdiça conversão e gera confusão
- O `create-user` interno (admin) já faz isso — reutiliza conta e vincula papel

### Comportamento proposto
1. Se e-mail já existe **e já é representante** → bloquear com mensagem clara: "Este e-mail já possui cadastro como representante."
2. Se e-mail já existe **mas não é representante** → reutilizar conta, criar registro em `representatives`, não criar auth user novo
3. Mesmo padrão para empresa: se e-mail existe mas não tem empresa → reutilizar conta, criar empresa e vincular papel `gerente`
4. Se e-mail já existe e já tem empresa → bloquear com mensagem específica

### Build errors (pré-existentes, não relacionados ao cadastro)
Três grupos de erros precisam de correção:
1. **`split-recipients-resolver.ts`** — tipo `SupabaseAdminClient` customizado é incompatível com `SupabaseClient` real. Afeta `asaas-webhook`, `create-asaas-payment`, `verify-payment-status`.
2. **`create-asaas-payment/index.ts`** — `searchRes` pode ser `null` após o guard de `searchData`, mas o TypeScript não consegue inferir narrowing.
3. **`process-email-queue/index.ts`** — campos `to`, `from`, `subject`, `html`, `text` do payload são `string | undefined` mas o SDK espera `string`.

---

## Parte 1 — Fluxo de cadastro de representante

**Arquivo:** `supabase/functions/register-representative/index.ts`

Mudança: quando e-mail já existe, em vez de bloquear, verificar se já tem registro em `representatives`:
- Se já é representante → retornar erro específico: "Este e-mail já possui cadastro como representante. Faça login para acessar seu painel."
- Se não é representante → reutilizar `existingUser.id`, criar registro em `representatives` e atualizar `profiles`. Não criar auth user novo. Retornar sucesso normalmente.

**Arquivo:** `src/pages/public/RepresentativeRegistration.tsx`

Mudança: quando o backend retorna sucesso para conta existente, o frontend tenta `signInWithPassword` — isso falha porque a senha informada não é a senha da conta existente. Neste caso, exibir mensagem orientando login: "Cadastro vinculado à sua conta existente. Faça login com sua senha atual para acessar o painel."

---

## Parte 2 — Fluxo de cadastro de empresa

**Arquivo:** `supabase/functions/register-company/index.ts`

Mudança análoga:
- Se e-mail já existe e já tem papel `gerente` em alguma empresa → bloquear com mensagem: "Este e-mail já possui uma empresa cadastrada. Faça login para gerenciar sua conta."
- Se e-mail existe mas não tem empresa → reutilizar conta, criar empresa, vincular `gerente` via `user_roles`. Não criar auth user novo.

---

## Parte 3 — Build errors

### 3a. `split-recipients-resolver.ts` (linhas 9-26)
Substituir o tipo `SupabaseAdminClient` customizado por `any` para eliminar incompatibilidade de tipagem profunda com o SDK real. Alternativa mais limpa que reescrever toda a cadeia de tipos.

### 3b. `create-asaas-payment/index.ts` (linhas 891-912)
Adicionar guard explícito `if (!searchRes)` antes de `if (!searchRes.ok)` — o TypeScript não consegue inferir que `searchData !== null` implica `searchRes !== null`.

### 3c. `process-email-queue/index.ts` (linhas 279-284)
Adicionar assertions `as string` ou fallback nos campos `to`, `from`, `subject`, `html`, `text` ao chamar `sendLovableEmail`.

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/register-representative/index.ts` | Reutilizar conta existente quando e-mail já existe mas não é representante |
| `supabase/functions/register-company/index.ts` | Reutilizar conta existente quando e-mail já existe mas não tem empresa |
| `src/pages/public/RepresentativeRegistration.tsx` | Tratar cenário de conta existente reutilizada (orientar login) |
| `src/pages/public/CompanyRegistration.tsx` | Tratar cenário de conta existente reutilizada (orientar login) |
| `supabase/functions/_shared/split-recipients-resolver.ts` | Corrigir tipo `SupabaseAdminClient` |
| `supabase/functions/create-asaas-payment/index.ts` | Guard de null em `searchRes` |
| `supabase/functions/process-email-queue/index.ts` | Assertions de tipo nos campos de e-mail |

## Riscos residuais
- Login automático não funciona para contas reutilizadas (senha diferente) — mitigado com redirect para `/login`
- `listUsers()` sem paginação pode ser lento em volume alto (risco pré-existente, não introduzido aqui)

