

## Plano de Migração: Stripe → Asaas

### Contexto

O sistema usa Stripe Connect (Express + Direct Charge) em 6 edge functions e ~8 arquivos frontend. A migração para Asaas substitui toda a infraestrutura de pagamentos mantendo a mesma arquitetura de split (plataforma retém comissão, empresa recebe o resto).

### Modelo Asaas equivalente

O Asaas oferece dois caminhos para o split:
- **Subconta (similar ao Connect Express)**: a plataforma cria uma subconta Asaas para cada empresa. Ideal para onboarding automático.
- **Conta existente**: a empresa informa sua API key Asaas e a plataforma faz cobranças com split via `walletId`.

Ambos os cenários serão suportados.

---

### 1. Mudanças no banco de dados

**Tabela `companies`** — migração de colunas:

| Coluna atual (Stripe) | Nova coluna (Asaas) | Ação |
|---|---|---|
| `stripe_account_id` | `asaas_account_id` | Renomear |
| `stripe_onboarding_complete` | `asaas_onboarding_complete` | Renomear |
| — | `asaas_api_key` | Criar (encrypted, para contas existentes) |
| — | `asaas_wallet_id` | Criar (ID da subconta no Asaas) |

**Tabela `sales`** — migração de colunas:

| Coluna atual | Nova coluna | Ação |
|---|---|---|
| `stripe_checkout_session_id` | `asaas_payment_id` | Renomear |
| `stripe_payment_intent_id` | `asaas_payment_status` | Renomear |
| `stripe_transfer_id` | `asaas_transfer_id` | Renomear |

**Tabela `partners`** — `stripe_account_id` → `asaas_wallet_id`

Colunas antigas podem ser mantidas temporariamente (nullable) para não perder dados históricos.

---

### 2. Edge Functions — substituição completa

#### 2.1 `create-connect-account` → `create-asaas-account`

Dois fluxos:
- **Criar subconta**: chama `POST /accounts` na API Asaas com dados da empresa (nome, CPF/CNPJ, email). Retorna `walletId`.
- **Vincular conta existente**: empresa informa sua API key Asaas. A function valida com `GET /myAccount` e salva o `walletId`.

Salva `asaas_wallet_id` + `asaas_onboarding_complete = true` na `companies`.

#### 2.2 `create-checkout-session` → `create-asaas-payment`

- Cria cobrança via `POST /payments` com:
  - `billingType`: `PIX` ou `CREDIT_CARD` (ou `UNDEFINED` para ambos)
  - `value`: valor total
  - `split`: array com `walletId` da plataforma e percentual
  - `dueDate`: data de vencimento
  - `externalReference`: `sale_id`
- Retorna `invoiceUrl` (link de pagamento Asaas) ou `pixQrCode` para Pix direto
- Salva `asaas_payment_id` na venda

#### 2.3 `stripe-webhook` → `asaas-webhook`

- Recebe notificações do Asaas (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`)
- Valida token de autenticação do webhook
- `PAYMENT_CONFIRMED/RECEIVED` → marca venda como `pago`, calcula comissões
- `PAYMENT_OVERDUE/PAYMENT_DELETED` → cancela venda, libera assentos

#### 2.4 `verify-payment-status` — adaptar

- Consulta `GET /payments/{asaas_payment_id}` na API Asaas
- Mapeia status Asaas → status interno (`CONFIRMED` → `pago`, `PENDING` → `processando`, etc.)

#### 2.5 `create-platform-fee-checkout` — adaptar

- Mesma lógica mas usando API Asaas para cobrar taxa de vendas manuais

#### 2.6 `create-checkout-session` (config.toml)

- Remover entries Stripe, adicionar entries Asaas com `verify_jwt = false` para webhook

---

### 3. Secrets necessários

| Secret | Descrição |
|---|---|
| `ASAAS_API_KEY` | API key da plataforma (master account) |
| `ASAAS_WEBHOOK_TOKEN` | Token para validar webhooks |

Remover (após migração): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

---

### 4. Frontend — arquivos afetados

#### 4.1 `Company.tsx` — Aba Pagamentos

Substituir toda a seção Stripe Connect por:
- **Opção 1**: "Criar conta Asaas" — onboarding simplificado (nome, CPF/CNPJ, email)
- **Opção 2**: "Já tenho conta Asaas" — campo para informar API key
- Status de conexão: ativo/pendente
- Remover: polling de capabilities, links para dashboard Stripe

#### 4.2 `Checkout.tsx` — Fluxo de compra

- Substituir `create-checkout-session` → `create-asaas-payment`
- Redirect para `invoiceUrl` do Asaas (ou exibir QR Pix inline)
- Tratar error codes do Asaas

#### 4.3 `Confirmation.tsx` — Polling pós-pagamento

- Substituir `verify-payment-status` (já adaptado no backend)
- Atualizar referências visuais de "Stripe" para "pagamento"

#### 4.4 `TicketLookup.tsx` — Verificação de status

- Mesma adaptação do Confirmation

#### 4.5 `Events.tsx` — Gate de publicação

- Substituir `checkStripeConnection` por verificação de `asaas_onboarding_complete`
- Remover modal de Stripe gate, criar equivalente Asaas

#### 4.6 `Sales.tsx` — Taxa da plataforma

- Substituir `create-platform-fee-checkout` adaptado

#### 4.7 Componentes auxiliares

- `StatusBadge.tsx` — remover status `processando` referente a Stripe (ou manter genérico)
- `types/database.ts` — atualizar tipos com novas colunas

---

### 5. Vantagens do Asaas para o projeto

- Pix com taxa fixa (R$ 0,49) vs Stripe (0,99% + R$ 0,39)
- Repasse em D+1/D+2 vs Stripe (D+30 no Brasil)
- Onboarding simplificado (sem Express dashboard)
- API em português com suporte BR nativo
- Split de pagamento nativo

### 6. Ordem de execução sugerida

1. Criar secrets `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`
2. Migração de banco (novas colunas)
3. Criar edge functions Asaas (em paralelo às Stripe, sem remover)
4. Adaptar frontend Company.tsx (onboarding)
5. Adaptar frontend Checkout.tsx (pagamento)
6. Adaptar Confirmation + TicketLookup (verificação)
7. Adaptar Events.tsx (gate de publicação)
8. Adaptar Sales.tsx (taxa plataforma)
9. Testes end-to-end
10. Remover edge functions e secrets Stripe

### 7. Estimativa de escopo

- ~6 edge functions (criar/reescrever)
- ~8 arquivos frontend
- 1 migração de banco
- 2 secrets novos

