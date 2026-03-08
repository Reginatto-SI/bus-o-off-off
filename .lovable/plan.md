

## Plano: Alerta ao Admin quando Pix não está disponível no Stripe

### Contexto

Hoje a edge function `create-platform-fee-checkout` faz fallback silencioso de `["card", "pix"]` para `["card"]` quando o Pix não está habilitado. O admin nunca fica sabendo. O mesmo padrão existe em `create-checkout-session`.

### Solução

Adicionar um campo `pix_available` na resposta JSON da edge function. Quando o fallback acontecer, retornar `pix_available: false`. No frontend, após abrir o checkout, exibir um toast de aviso informando que o Pix não está habilitado e orientando o admin a ativá-lo no Dashboard do Stripe.

### Alterações

**1. Edge Function `create-platform-fee-checkout/index.ts`**
- Adicionar variável `pixAvailable = true` antes do try/catch
- No bloco de fallback (quando Pix falha), setar `pixAvailable = false`
- Incluir `pix_available: pixAvailable` no JSON de resposta junto com `url`

**2. Edge Function `create-checkout-session/index.ts`**
- Mesma lógica: retornar `pix_available` na resposta quando houver fallback

**3. Frontend `src/pages/admin/Sales.tsx` — `handlePayPlatformFee`**
- Após receber `data.url`, verificar `data.pix_available === false`
- Se false, exibir toast de aviso (sonner): "Pix não está habilitado na sua conta Stripe. O checkout foi aberto apenas com cartão. Para habilitar Pix, acesse Settings → Payment Methods no Dashboard do Stripe."
- Manter o fluxo normal (abrir checkout em nova aba)

**4. Frontend `src/pages/public/Checkout.tsx`** (se aplicável)
- Verificar se o checkout público também consome a resposta da edge function e, se sim, exibir aviso similar na tela admin (não no fluxo público do cliente)

### Comportamento esperado

- Checkout funciona normalmente com ou sem Pix
- Quando Pix não está disponível, o admin vê um toast amarelo de aviso com orientação clara
- Nenhuma mudança no fluxo do cliente final
- Nenhuma alteração em banco de dados

