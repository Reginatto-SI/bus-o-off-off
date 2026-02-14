

# Correcao: Capabilities da Conta Stripe + Feedback de Erro no Checkout

## Problema Raiz

A conta Express de teste foi criada e o onboarding foi concluido, mas o Stripe nao ativou as capabilities `transfers` e `card_payments`. Quando o `create-checkout-session` tenta criar a sessao com `transfer_data.destination`, o Stripe rejeita com erro 400. O frontend captura esse erro silenciosamente e faz fallback para "Reserva Registrada" sem informar o usuario.

## Solucao em 3 Partes

### 1. Edge Function `create-connect-account` — Verificar e reportar capabilities

Ao verificar o status da conta (quando o admin clica "Acessar Painel" ou ao retornar do onboarding), a funcao deve consultar `account.capabilities` e reportar ao frontend se `transfers` e `card_payments` estao ativos.

Alteracoes:
- Apos `stripe.accounts.retrieve()`, extrair `account.capabilities.transfers` e `account.capabilities.card_payments`
- Incluir no response um campo `capabilities_ready: boolean` indicando se ambos estao `active`
- Atualizar `stripe_onboarding_complete` no banco somente se capabilities estiverem ativas

### 2. Edge Function `create-checkout-session` — Validacao previa e erro claro

Antes de tentar criar a sessao Stripe, verificar se a conta conectada tem as capabilities necessarias. Se nao tiver, retornar um erro claro em vez de deixar o Stripe rejeitar.

Alteracoes:
- Apos buscar `company.stripe_account_id`, chamar `stripe.accounts.retrieve()` para checar capabilities
- Se `transfers` nao estiver `active`, retornar erro 400 com mensagem explicativa: "A conta Stripe da empresa ainda nao esta totalmente ativa. Aguarde a aprovacao do Stripe ou entre em contato com o administrador."
- Isso evita o fallback silencioso

### 3. Frontend — Feedback visual no Checkout e na tela de Empresa

#### Checkout (`Checkout.tsx`)
- Quando `create-checkout-session` retornar erro, exibir toast com a mensagem de erro em vez de fazer fallback silencioso
- Manter o fallback para reserva apenas se o erro for "Company has no Stripe account configured" (empresa sem Stripe)
- Para outros erros (capabilities nao prontas), exibir mensagem ao usuario e NAO criar reserva falsa

#### Tela de Empresa (`Company.tsx`)
- Exibir status mais detalhado na aba Pagamentos:
  - "Conectado e ativo" (verde) — quando capabilities estao prontas
  - "Conectado — aguardando ativacao" (amarelo) — quando onboarding feito mas capabilities pendentes
  - "Nao conectado" (cinza) — sem conta
- Adicionar botao "Verificar status" que reconsulta a edge function para atualizar

## Detalhes Tecnicos

### Verificacao de capabilities no Stripe

```text
const account = await stripe.accounts.retrieve(stripeAccountId);
const transfersActive = account.capabilities?.transfers === 'active';
const paymentsActive = account.capabilities?.card_payments === 'active';
const capabilitiesReady = transfersActive && paymentsActive;
```

Em contas de teste, pode ser necessario que o usuario acesse o Stripe Dashboard da plataforma e ative manualmente as capabilities para a conta conectada, ou que complete todos os requisitos de verificacao.

### Logica de fallback no Checkout

```text
Erro "no Stripe account" -> fallback para reserva (comportamento atual)
Erro "capabilities not ready" -> toast de erro, NAO redireciona
Erro generico -> toast de erro, NAO redireciona
Sucesso -> redireciona para Stripe Checkout
```

## Resumo dos Arquivos

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `supabase/functions/create-connect-account/index.ts` | Editar | Reportar status de capabilities |
| `supabase/functions/create-checkout-session/index.ts` | Editar | Validar capabilities antes de criar sessao |
| `src/pages/public/Checkout.tsx` | Editar | Feedback de erro em vez de fallback silencioso |
| `src/pages/admin/Company.tsx` | Editar | Status detalhado de capabilities |

