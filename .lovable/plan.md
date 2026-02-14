

# Integracao Stripe Connect — Vendas de Passagens Multiempresa

## Visao Geral

Implementar pagamentos reais via **Stripe Connect** com o modelo de **destination charges**, onde cada empresa (conta conectada) recebe os pagamentos de seus eventos, e a plataforma (Busao Off Off) retém automaticamente 7,5% de comissao via `application_fee_amount`.

---

## Modelo Tecnico: Stripe Connect + Destination Charges

```text
Cliente paga R$100
  |
  v
Stripe Checkout (pagina externa)
  |
  v
Plataforma recebe R$100
  |-- R$7,50 (application_fee) -> fica na conta da plataforma
  |-- R$92,50 (transfer) -> vai para conta conectada da empresa
  |
  v
Webhook confirma pagamento -> atualiza sale.status para 'pago'
```

**Refunds**: Por padrao no Stripe, quando se usa `application_fee_amount`, a plataforma mantem a taxa ao emitir reembolso (basta NAO passar `refund_application_fee: true`). Isso atende perfeitamente ao requisito.

---

## Parte 1: Alteracoes no Banco de Dados

### 1.1 Tabela `companies` — adicionar campo Stripe

```sql
ALTER TABLE public.companies ADD COLUMN stripe_account_id text;
ALTER TABLE public.companies ADD COLUMN stripe_onboarding_complete boolean NOT NULL DEFAULT false;
```

### 1.2 Tabela `sales` — adicionar rastreio Stripe

```sql
ALTER TABLE public.sales ADD COLUMN stripe_checkout_session_id text;
ALTER TABLE public.sales ADD COLUMN stripe_payment_intent_id text;
```

Esses campos permitem auditoria e conciliacao confiavel entre sistema e Stripe.

---

## Parte 2: Edge Functions (Backend)

### 2.1 `create-connect-account`

Funcao administrativa chamada pela tela de Empresa para criar/conectar conta Stripe.

Fluxo:
1. Recebe `company_id` do admin autenticado
2. Verifica se ja existe `stripe_account_id` na empresa
3. Se nao existe: cria conta conectada via `stripe.accounts.create({ type: 'express' })`
4. Gera link de onboarding via `stripe.accountLinks.create()`
5. Salva `stripe_account_id` na tabela `companies`
6. Retorna URL de onboarding para o frontend abrir em nova aba

### 2.2 `create-checkout-session`

Funcao publica chamada pelo checkout do cliente.

Fluxo:
1. Recebe: `sale_id` (venda ja criada com status 'reservado')
2. Busca a venda e o evento associado
3. Busca `stripe_account_id` da empresa do evento
4. Valida que a conta conectada esta ativa
5. Calcula `application_fee_amount` = valor total * 0.075 (7,5%)
6. Cria sessao Stripe Checkout com:
   - `mode: 'payment'`
   - `payment_method_types: ['card', 'boleto', 'pix']` (conforme disponivel)
   - `line_items` com nome do evento + quantidade + preco
   - `payment_intent_data.application_fee_amount`
   - `payment_intent_data.transfer_data.destination` = conta conectada
   - `success_url` = `/confirmacao/{sale_id}?payment=success`
   - `cancel_url` = `/eventos/{event_id}/checkout?...` (volta ao checkout)
   - `metadata.sale_id` = id da venda
7. Salva `stripe_checkout_session_id` na venda
8. Retorna `session.url`

### 2.3 `stripe-webhook`

Webhook para confirmar pagamentos.

Eventos tratados:
- `checkout.session.completed`: marca venda como 'pago', salva `payment_intent_id`
- `checkout.session.expired`: (opcional) pode marcar como expirado ou manter reservado

Configuracao:
- `verify_jwt = false` no config.toml (Stripe envia requests sem JWT)
- Validacao via `stripe.webhooks.constructEvent()` com webhook secret

---

## Parte 3: Alteracoes no Frontend

### 3.1 Tela de Empresa (`/admin/empresa`) — Aba Stripe

Adicionar nova aba "Pagamentos" ou secao na tela de empresa com:

- Status da integracao (Conectado / Nao conectado / Pendente)
- Botao "Conectar Stripe" -> chama edge function `create-connect-account` -> abre link de onboarding
- Botao "Acessar Painel Stripe" -> link para dashboard Express do Stripe
- Indicador visual se onboarding esta completo

### 3.2 Checkout Publico (`/eventos/:id/checkout`)

Alterar o botao "Finalizar compra":

**Fluxo atual:**
1. Cria sale + tickets -> redireciona para `/confirmacao/{id}`

**Novo fluxo:**
1. Cria sale + tickets (status 'reservado') — igual ao atual
2. Chama edge function `create-checkout-session` com `sale_id`
3. Recebe URL da sessao Stripe
4. Redireciona o usuario para a pagina do Stripe (nova aba ou mesma janela)
5. Apos pagamento, Stripe redireciona para `/confirmacao/{sale_id}?payment=success`

O botao muda o texto para "Ir para pagamento" ao inves de "Finalizar compra".

Se a empresa nao tiver Stripe configurado, o sistema mantem o comportamento atual (reserva sem pagamento).

### 3.3 Tela de Confirmacao (`/confirmacao/:id`)

Ajustes:
- Verificar query param `payment=success` para exibir mensagem adequada
- Buscar status atualizado da venda (pode ainda ser 'reservado' se webhook nao chegou)
- Exibir estados: "Pagamento confirmado" ou "Aguardando confirmacao do pagamento"

---

## Parte 4: Seguranca

### Secrets necessarios

- `STRIPE_SECRET_KEY` — ja configurado (chave da plataforma)
- `STRIPE_WEBHOOK_SECRET` — sera necessario adicionar apos criar o webhook endpoint no Stripe

### RLS

- Nenhuma alteracao de RLS necessaria. As novas colunas herdam as policies existentes.
- Edge functions usam `SUPABASE_SERVICE_ROLE_KEY` para atualizar vendas via webhook.

### Validacoes

- Webhook valida assinatura Stripe antes de processar
- Checkout session so e criado para vendas com status 'reservado'
- `application_fee_amount` calculado no backend (nunca no frontend)
- Conta conectada validada antes de criar sessao

---

## Parte 5: Resumo dos Arquivos

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| Migracao SQL | Criar | Colunas stripe em companies e sales |
| `supabase/functions/create-connect-account/index.ts` | Criar | Cria conta Express e gera link onboarding |
| `supabase/functions/create-checkout-session/index.ts` | Criar | Cria sessao Checkout com destination charge |
| `supabase/functions/stripe-webhook/index.ts` | Criar | Processa eventos de pagamento |
| `supabase/config.toml` | Editar | verify_jwt = false para webhook |
| `src/types/database.ts` | Editar | Novos campos em Company e Sale |
| `src/pages/admin/Company.tsx` | Editar | Aba/secao Stripe Connect |
| `src/pages/public/Checkout.tsx` | Editar | Redirecionar para Stripe Checkout |
| `src/pages/public/Confirmation.tsx` | Editar | Status de pagamento |

---

## Parte 6: Regras de Negocio Garantidas

1. Cada empresa recebe na sua propria conta Stripe (nao centralizado)
2. 7,5% retido automaticamente como `application_fee_amount`
3. Reembolsos NAO devolvem a comissao da plataforma (comportamento padrao do Stripe)
4. Pagamento externo via Stripe Checkout (nao dentro do app)
5. Venda so marcada como "paga" apos confirmacao real do Stripe via webhook
6. Toda venda vinculada ao `stripe_checkout_session_id` e `stripe_payment_intent_id` para auditoria
7. Se empresa nao tiver Stripe configurado, checkout continua funcionando como reserva

---

## Ordem de Implementacao Sugerida

1. Migracao de banco (colunas novas)
2. Edge function `create-connect-account`
3. Aba Stripe na tela de Empresa
4. Edge function `create-checkout-session`
5. Alteracao no Checkout publico
6. Edge function `stripe-webhook` + secret
7. Ajustes na Confirmacao

