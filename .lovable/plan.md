# Correcao do Webhook Stripe

## Problema

Dois problemas impedem o webhook de funcionar:

### 1. Configuracao errada no painel do Stripe (acao manual)

Na tela de criacao do webhook, voce selecionou:

- **"Contas conectadas e v2"** (errado) — deve ser **"Sua conta"** (card da esquerda)
- **"Subscriptions"** (errado) — deve ser **"checkout.session.completed"** (evento individual)

**O que fazer:**

1. Selecione **"Sua conta"** (card da esquerda)
2. Na secao de eventos, clique em **"Todos os eventos"**
3. Pesquise por **checkout.session.completed**
4. Marque **somente** esse evento
5. Clique em "Continuar"
6. Na proxima tela, cole a URL: `https://cdrcyjrvurrphnceromd.supabase.co/functions/v1/stripe-webhook`
7. Finalize a criacao
8. **Copie o novo Signing Secret** (`whsec_...`) e me envie, pois ele sera diferente do anterior  
  
Ja tenho aqui (whsec_yMNYVBzyyKiSxtUfj8PxjArDeW2tnong)

### 2. Bug no codigo da funcao (correcao automatica)

O log mostra o erro:

```text
SubtleCryptoProvider cannot be used in a synchronous context.
Use `await constructEventAsync(...)` instead of `constructEvent(...)`
```

No ambiente Deno, o metodo sincrono `constructEvent()` nao funciona. A correcao e simples: trocar para `await constructEventAsync()`.

**Alteracao no arquivo `supabase/functions/stripe-webhook/index.ts`:**

Linha 29 — trocar:

```text
event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
```

Por:

```text
event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
```

## Resumo


| Item                                             | Tipo   | Descricao                                                       |
| ------------------------------------------------ | ------ | --------------------------------------------------------------- |
| Selecionar "Sua conta" no Stripe                 | Manual | O checkout.session.completed e um evento da sua conta principal |
| Marcar apenas checkout.session.completed         | Manual | Nao usar Subscriptions nem Accounts v2                          |
| Informar novo Signing Secret                     | Manual | O novo endpoint tera um novo whsec_                             |
| Corrigir constructEvent para constructEventAsync | Codigo | Linha 29 do stripe-webhook/index.ts                             |
