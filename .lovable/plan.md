

# Corrigir Erro de Pagamento -- Pix Nao Ativado no Stripe

## Diagnostico

O erro e claro nos logs da edge function:

```
The payment method type provided: pix is invalid. Please ensure the provided type is activated in your dashboard
```

O Pix **nao esta ativado** na sua conta Stripe (dashboard). Quando o codigo envia `payment_method_types: ['card', 'pix']`, o Stripe rejeita a requisicao inteira, impedindo qualquer pagamento (inclusive cartao).

## Solucao

Tornar a edge function `create-checkout-session` resiliente: tentar criar a sessao com `['card', 'pix']` e, se falhar com erro de `payment_method_types`, repetir automaticamente apenas com `['card']`.

### Alteracao em `create-checkout-session/index.ts`

Implementar um fallback com try/catch:

1. Primeira tentativa: `payment_method_types: ['card', 'pix']` com `payment_method_options` para Pix
2. Se o Stripe retornar erro do tipo `StripeInvalidRequestError` com `param === 'payment_method_types'`:
   - Repetir a criacao da sessao apenas com `payment_method_types: ['card']` e sem `payment_method_options`
   - Logar um aviso informando que Pix nao esta disponivel
3. Qualquer outro erro: propagar normalmente

Isso garante que:
- O pagamento via cartao **nunca sera bloqueado** por causa do Pix
- Quando voce ativar Pix no Stripe dashboard, ele passara a funcionar automaticamente sem precisar alterar codigo
- Logs claros indicarao se Pix esta ou nao disponivel

## Acao manual necessaria (para habilitar Pix)

Para que Pix funcione, voce precisa ativa-lo no painel do Stripe:
1. Acesse https://dashboard.stripe.com/account/payments/settings
2. Encontre "Pix" na lista de metodos de pagamento
3. Ative-o

Ate la, o sistema funcionara normalmente apenas com cartao de credito.

## Arquivo a modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/create-checkout-session/index.ts` | Adicionar fallback card-only quando Pix nao estiver disponivel |

## O que NAO sera alterado

- Webhook (ja esta correto para ambos os cenarios)
- Telas publicas ou administrativas
- Logica de comissao e transfer

