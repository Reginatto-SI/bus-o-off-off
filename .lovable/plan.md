

# Migração de Destination Charges para Direct Charges

## Resumo

Migrar as duas edge functions (`create-checkout-session` e `stripe-webhook`) do modelo Destination Charges para Direct Charges, onde o pagamento é criado diretamente na conta conectada da empresa.

---

## Alterações em `create-checkout-session/index.ts`

### O que muda

1. **Remover `transfer_data`** do `payment_intent_data` — Direct Charge não usa `transfer_data.destination`
2. **Manter `application_fee_amount`** — a plataforma retém sua comissão automaticamente
3. **Passar `stripeAccount` como segundo argumento** do `stripe.checkout.sessions.create()` — isso cria a sessão NA conta conectada
4. **Adicionar `company_id` nos metadata** — para rastreabilidade no webhook

### Código atual (Destination Charge):
```typescript
payment_intent_data: {
  application_fee_amount: applicationFeeCents,
  transfer_data: {
    destination: company.stripe_account_id,
  },
},
```

### Código novo (Direct Charge):
```typescript
payment_intent_data: {
  application_fee_amount: applicationFeeCents,
  // SEM transfer_data
},
```

E a criação da sessão passa a incluir o header:
```typescript
// Antes (Destination — sessão na plataforma):
session = await stripe.checkout.sessions.create({ ...params });

// Depois (Direct — sessão na conta conectada):
session = await stripe.checkout.sessions.create({ ...params }, {
  stripeAccount: company.stripe_account_id
});
```

O fallback Pix/cartão continua idêntico, apenas com o segundo argumento `stripeAccount` em ambas as chamadas.

---

## Alterações em `stripe-webhook/index.ts`

### O que muda

1. **Extrair `event.account`** — em Connect Webhooks, esse campo identifica de qual conta conectada veio o evento
2. **Passar `connectedAccountId` para `processPaymentConfirmed`** — para logs mais detalhados
3. **Logs atualizados** — indicam que o modelo é Direct Charge e de qual conta veio o evento

### Lógica de split do parceiro

Sem alteração funcional. O `stripe.transfers.create()` continua usando o saldo da plataforma (que agora vem exclusivamente da `application_fee`). A diferença é que antes a plataforma recebia o valor bruto e transferia ao destino; agora recebe apenas a comissão. O transfer para o parceiro sai dessa comissão.

---

## Configuração manual necessária no Stripe Dashboard

Após o deploy, você precisa:

1. **Criar um webhook do tipo "Connect"** (não "Your account") no Stripe Dashboard, apontando para a mesma URL: `https://cdrcyjrvurrphnceromd.supabase.co/functions/v1/stripe-webhook`
2. **Selecionar eventos**: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
3. **Atualizar o `STRIPE_WEBHOOK_SECRET`** com o novo signing secret do webhook Connect (é diferente do webhook anterior)
4. **Remover o webhook antigo** (tipo "Your account") que era usado no modelo Destination Charges

Importante: O webhook Connect recebe eventos de **todas** as contas conectadas com um único endpoint.

---

## Arquivos modificados

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/create-checkout-session/index.ts` | Remover `transfer_data`, adicionar `stripeAccount` header, adicionar `company_id` nos metadata |
| `supabase/functions/stripe-webhook/index.ts` | Extrair `event.account`, passar para processamento, atualizar logs |

## O que NÃO muda

- Cálculo de comissão (mesma fórmula)
- Split do parceiro (mesmo `stripe.transfers.create`)
- Fallback Pix/cartão (mesma lógica)
- Validação de capabilities
- Fluxo de Pix assíncrono (async_payment_succeeded/failed)
- Banco de dados (nenhuma alteração de schema)

