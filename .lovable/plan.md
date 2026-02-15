

# Habilitacao de Pix no Stripe Checkout + Checklist de Producao

## Diagnostico

O Pix nao aparece como opcao de pagamento porque a edge function `create-checkout-session` **nao especifica `payment_method_types`**. Sem esse parametro, o Stripe usa apenas os metodos configurados no painel -- que por padrao e somente cartao.

A documentacao do Stripe confirma que Pix e compativel com:
- Destination Charges (nosso modelo atual)
- Moeda BRL (ja usamos)
- Stripe Checkout hosted

---

## 1. Habilitar Pix na criacao do Checkout Session

### Alteracao em `create-checkout-session/index.ts`

Adicionar `payment_method_types: ['card', 'pix']` e configurar expiracao do Pix:

```typescript
const session = await stripe.checkout.sessions.create({
  mode: "payment",
  payment_method_types: ['card', 'pix'],
  payment_method_options: {
    pix: {
      expires_after_seconds: 900, // 15 minutos para pagar
    },
  },
  line_items: [ ... ],
  // ... resto igual
});
```

Tambem sera necessario **remover** o bloco `payment_intent_data` e substituir por `payment_intent_data` apenas quando o metodo for cartao, porque Pix nao gera PaymentIntent direto -- gera um pagamento assincrono.

**Problema critico:** Destination Charges com `payment_intent_data.transfer_data` **nao sao compativeis com Pix** diretamente no mesmo checkout session quando `payment_method_types` inclui multiplos tipos. A solucao e usar `transfer_data` apenas no `payment_intent_data` e aceitar que o Stripe tratara o Pix via a mesma logica de Destination Charges.

Na verdade, a documentacao confirma que Pix **funciona com Destination Charges**. Porem, a configuracao muda: devemos usar `payment_intent_data` para cartao e, para Pix, o Stripe trata automaticamente. A abordagem correta e manter `payment_intent_data` como esta -- o Stripe aplica a `application_fee_amount` e `transfer_data` tanto para cartao quanto para Pix.

### Resumo da alteracao:

Apenas adicionar dois campos ao `stripe.checkout.sessions.create()`:
- `payment_method_types: ['card', 'pix']`
- `payment_method_options: { pix: { expires_after_seconds: 900 } }`

---

## 2. Tratar pagamento assincrono do Pix no Webhook

### Problema atual

O webhook so escuta `checkout.session.completed`. Para Pix, o fluxo e diferente:

1. `checkout.session.completed` dispara com `payment_status: 'unpaid'` (o cliente ainda nao pagou)
2. Quando o cliente paga via Pix, dispara `checkout.session.async_payment_succeeded`
3. Se expira sem pagamento, dispara `checkout.session.async_payment_failed`

### Alteracao em `stripe-webhook/index.ts`

1. No evento `checkout.session.completed`:
   - Verificar `session.payment_status`
   - Se `payment_status === 'paid'` (cartao): processar normalmente como hoje
   - Se `payment_status === 'unpaid'` (Pix pendente): **nao marcar como pago ainda**, apenas logar

2. Adicionar tratamento para `checkout.session.async_payment_succeeded`:
   - Mesmo fluxo que hoje faz no `checkout.session.completed` quando `payment_status === 'paid'`
   - Marcar venda como `pago`
   - Calcular comissao e fazer transfer para parceiro

3. Adicionar tratamento para `checkout.session.async_payment_failed`:
   - Marcar venda como `cancelado` (ou manter `reservado` e logar)
   - Liberar os assentos (deletar tickets)
   - Logar no `sale_logs`

### Importante para o webhook do Stripe (painel)

Sera necessario adicionar os eventos `checkout.session.async_payment_succeeded` e `checkout.session.async_payment_failed` no webhook configurado no painel do Stripe. Isso e uma configuracao manual que voce fara no painel do Stripe.

---

## 3. Checklist de Producao

### 3.1 O que ja esta correto

- Chave secreta do Stripe configurada como secret
- Webhook secret configurado
- `verify_jwt = false` no webhook (necessario para Stripe chamar)
- Validacao de assinatura do webhook via `constructEventAsync`
- Calculo de comissao e transfer para parceiro
- Capabilities pre-validadas antes do checkout

### 3.2 Ajustes recomendados antes de producao

| Item | Status | Acao |
|------|--------|------|
| Pix habilitado | Pendente | Implementar neste plano |
| Webhook Pix async | Pendente | Implementar neste plano |
| Chave Stripe em modo LIVE | Manual | Trocar a `STRIPE_SECRET_KEY` pela chave live no painel de secrets |
| Webhook endpoint em LIVE | Manual | Criar novo webhook no Stripe apontando para a URL de producao |
| Webhook events | Manual | Adicionar `checkout.session.async_payment_succeeded` e `checkout.session.async_payment_failed` |
| `STRIPE_WEBHOOK_SECRET` | Manual | Atualizar com o signing secret do webhook de producao |
| Conta Connect da empresa | Manual | Completar onboarding real no Stripe |
| Limpeza de vendas de teste | Manual | Remover vendas de teste do banco antes de ir ao vivo |
| Expirar reservas antigas | Recomendado futuro | Criar job para cancelar vendas `reservado` com mais de X minutos (Pix expirado) |

### 3.3 Para trocar para producao

Passos manuais que voce fara:

1. No painel do Stripe: alternar para modo Live
2. Copiar a nova `STRIPE_SECRET_KEY` (live) e atualizar o secret no projeto
3. Criar um webhook endpoint apontando para `https://cdrcyjrvurrphnceromd.supabase.co/functions/v1/stripe-webhook`
4. Selecionar os eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
5. Copiar o signing secret do webhook e atualizar `STRIPE_WEBHOOK_SECRET`
6. A conta Connect da empresa precisa completar o onboarding real

---

## Arquivos a modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/create-checkout-session/index.ts` | Adicionar `payment_method_types` e `payment_method_options` para Pix |
| `supabase/functions/stripe-webhook/index.ts` | Tratar `payment_status` no completed, adicionar handlers para async_payment_succeeded e async_payment_failed |

## O que NAO sera alterado

- Logica de QR Code e passagens
- Telas publicas e administrativas
- Calculo de comissao (mesma logica, apenas movida para funcao reutilizavel)
- RLS e permissoes

