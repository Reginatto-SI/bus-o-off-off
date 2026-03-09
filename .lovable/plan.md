

## Correção: Edge Function `create-asaas-account` falhando

### Problema

A função usa `supabaseClient.auth.getClaims(token)` que **não existe** no SDK Supabase. Isso faz a função crashar imediatamente, gerando o erro "Failed to send a request to the Edge Function".

Conforme padrão arquitetural do projeto (documentado em memória), Edge Functions devem decodificar o JWT manualmente via `atob` para extrair o `sub` (user_id).

### Correção

**Arquivo:** `supabase/functions/create-asaas-account/index.ts`

Substituir o bloco de autenticação (linhas 25-48) que usa `getClaims` por decodificação manual do JWT:

```typescript
// ANTES (quebrado):
const supabaseClient = createClient(...);
const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
const userId = claimsData.claims.sub;

// DEPOIS (funcional):
const token = authHeader.replace("Bearer ", "");
const payloadBase64 = token.split(".")[1];
const payload = JSON.parse(atob(payloadBase64));
const userId = payload.sub;
```

- Remove a criação do `supabaseClient` com anon key (desnecessário, só era usado para `getClaims`)
- Mantém o `supabaseAdmin` com service_role para as operações de banco
- Mantém toda a lógica de negócio intacta (criar subconta + vincular conta existente)

### Escopo

Apenas 1 arquivo alterado. Nenhuma mudança no frontend — o `Company.tsx` já chama corretamente via `supabase.functions.invoke('create-asaas-account', { body })`.

