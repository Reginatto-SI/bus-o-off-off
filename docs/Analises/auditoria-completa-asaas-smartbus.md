# Auditoria Completa da Integração Asaas — Smartbus BR

**Data:** 20 de março de 2026  
**Versão:** 1.0  
**Escopo:** Análise sistêmica, conservadora e orientada à operação real

---

## Objetivo

Realizar uma auditoria técnica completa de toda a integração com a API do Asaas no projeto Smartbus BR, cobrindo frontend, backend (edge functions), banco de dados e experiência administrativa.

O objetivo é identificar — antes do lançamento comercial — qualquer fragilidade estrutural, ambiguidade, duplicidade, legado residual ou inconsistência que possa comprometer a operação financeira real do sistema.

---

## Escopo da auditoria

| Camada | Itens analisados |
|---|---|
| **Banco de dados** | `companies`, `partners`, `sales`, `sale_logs`, `sale_integration_logs`, `asaas_webhook_event_dedup`, `seat_locks`, `sale_passengers`, `tickets` |
| **Edge Functions** | `create-asaas-payment`, `create-asaas-account`, `asaas-webhook`, `verify-payment-status`, `create-platform-fee-checkout`, `reconcile-sale-payment`, `cleanup-expired-locks`, `get-runtime-payment-environment` |
| **Shared helpers** | `payment-context-resolver.ts`, `payment-finalization.ts`, `payment-observability.ts`, `runtime-env.ts` |
| **Frontend** | `Checkout.tsx`, `Confirmation.tsx`, `Partners.tsx`, `Company.tsx` (aba pagamentos), `AsaasOnboardingWizard.tsx`, `use-runtime-payment-environment.ts`, `asaasIntegrationStatus.ts` |
| **Secrets** | `ASAAS_API_KEY`, `ASAAS_API_KEY_SANDBOX`, `ASAAS_WALLET_ID`, `ASAAS_WALLET_ID_SANDBOX`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_WEBHOOK_TOKEN_SANDBOX` |

---

## Visão geral atual da integração

### Arquitetura macro

O sistema opera como **marketplace intermediário**: a empresa (tenant) é dona da cobrança no Asaas, e a plataforma Smartbus BR recebe sua taxa via split automático no momento do pagamento.

Existe um **resolvedor central** (`payment-context-resolver.ts`) que unifica a decisão de ambiente, credencial, owner da cobrança, política de split e token de webhook. Todas as edge functions críticas consomem esse resolvedor.

### Modelo de dados por ambiente

A tabela `companies` armazena credenciais **separadas por ambiente**:
- `asaas_api_key_production` / `asaas_api_key_sandbox`
- `asaas_wallet_id_production` / `asaas_wallet_id_sandbox`
- `asaas_account_id_production` / `asaas_account_id_sandbox`
- `asaas_account_email_production` / `asaas_account_email_sandbox`
- `asaas_onboarding_complete_production` / `asaas_onboarding_complete_sandbox`

**Campos legados genéricos** (sem sufixo de ambiente) já foram removidos da tabela `companies`. O frontend e o backend leem exclusivamente os campos por ambiente.

### Fluxo de onboarding

Dois caminhos:
1. **Criar subconta** — edge function `create-asaas-account` cria conta na API do Asaas e persiste `api_key`, `wallet_id`, `account_id`, `account_email` e `onboarding_complete` no ambiente selecionado.
2. **Vincular conta existente** — admin informa API Key; o sistema valida contra a API e extrai `walletId` e `accountId`.

### Fluxo de venda (checkout → passagem)

```
1. Cliente seleciona assentos no checkout
2. Frontend cria seat_locks (15min expiry)
3. Frontend cria sale (status: pendente_pagamento, payment_environment definido)
4. Frontend cria sale_passengers (staging)
5. Frontend invoca create-asaas-payment
6. Edge function valida ambiente, credenciais, monta split, cria cobrança na API Asaas
7. Retorna URL do checkout Asaas → frontend abre em nova aba
8. Cliente paga
9a. Webhook do Asaas notifica asaas-webhook → finalizeConfirmedPayment()
9b. OU polling via verify-payment-status → finalizeConfirmedPayment()
10. Função compartilhada: atualiza status para pago, cria tickets a partir de sale_passengers, limpa seat_locks
11. Snapshot financeiro gravado (gross_amount, platform_fee_total, partner_fee_amount, platform_net_amount)
12. Frontend detecta status "pago" e exibe passagens
```

---

## Fluxo completo do uso da API

### 1. Criação de conta (`create-asaas-account`)
- Recebe `company_id`, `mode` (create/link_existing), `target_environment` opcional
- Se `target_environment` é null, resolve por host (problemático — ver Fragilidades)
- Cria subconta ou valida API Key existente
- Persiste todos os campos no ambiente correto

### 2. Criação de cobrança (`create-asaas-payment`)
- Recebe `sale_id`, `payment_method`, `payment_environment`
- Valida que a venda está em `reservado` ou `pendente_pagamento`
- Resolve contexto via `resolvePaymentContext(mode: "create")`
- Valida wallet + onboarding completos da empresa no ambiente
- Persiste `payment_environment` na venda se ainda não travado
- Monta split: plataforma (via secret `ASAAS_WALLET_ID[_SANDBOX]`) + parceiro (se ativo)
- Cria cobrança na API Asaas com `externalReference = sale.id`
- Atualiza `asaas_payment_id` na venda

### 3. Webhook (`asaas-webhook`)
- Resolve ambiente pela venda persistida (fail-closed: rejeita sem ambiente)
- Valida token por ambiente (fail-closed: rejeita sem token configurado)
- Deduplicação formal via `asaas_webhook_event_dedup`
- Delega para `finalizeConfirmedPayment()` (compartilhada com verify)
- Calcula e grava snapshot financeiro via `upsertFinancialSnapshot()`
- Suporta eventos: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED, PAYMENT_REFUNDED

### 4. Verificação manual (`verify-payment-status`)
- Recebe `sale_id`, consulta status no Asaas via API Key da empresa
- Se confirmado, delega para `finalizeConfirmedPayment()`
- Calcula snapshot financeiro inline (duplicado do webhook — ver Fragilidades)
- Se venda já paga, tenta reconciliar tickets faltantes

### 5. Reconciliação (`reconcile-sale-payment`)
- Rota manual para vendas inconsistentes (pagas sem tickets)
- Usa `inspectSaleConsistency()` + `finalizeConfirmedPayment()` da shared

### 6. Taxa da plataforma (`create-platform-fee-checkout`)
- Cria cobrança separada com `externalReference = platform_fee_{sale_id}`
- Webhook processa via fluxo dedicado `processPlatformFeeWebhook()`
- Atualiza `platform_fee_status`, `platform_fee_paid_at`, `platform_fee_payment_id`

---

## Estrutura atual das tabelas e campos relacionados

### Tabela `companies` — campos Asaas

| Campo | Tipo | Nullable | Ambiente | Status |
|---|---|---|---|---|
| `asaas_api_key_production` | text | Sim | Produção | ✅ Ativo |
| `asaas_api_key_sandbox` | text | Sim | Sandbox | ✅ Ativo |
| `asaas_wallet_id_production` | text | Sim | Produção | ✅ Ativo |
| `asaas_wallet_id_sandbox` | text | Sim | Sandbox | ✅ Ativo |
| `asaas_account_id_production` | text | Sim | Produção | ✅ Ativo |
| `asaas_account_id_sandbox` | text | Sim | Sandbox | ✅ Ativo |
| `asaas_account_email_production` | text | Sim | Produção | ✅ Ativo |
| `asaas_account_email_sandbox` | text | Sim | Sandbox | ✅ Ativo |
| `asaas_onboarding_complete_production` | boolean | Não | Produção | ✅ Ativo |
| `asaas_onboarding_complete_sandbox` | boolean | Não | Sandbox | ✅ Ativo |
| `platform_fee_percent` | numeric | Não | Global | ✅ Ativo |
| `partner_split_percent` | numeric | Não | Global | ✅ Ativo |

**Veredicto:** Modelagem limpa. Campos legados genéricos já removidos. ✅

### Tabela `partners` — campos Asaas

| Campo | Tipo | Nullable | Status | Problema |
|---|---|---|---|---|
| `asaas_wallet_id` | text | Sim | ⚠️ Legado | Frontend grava aqui, backend ignora |
| `asaas_wallet_id_production` | text | Sim | ✅ Ativo (no backend) | — |
| `asaas_wallet_id_sandbox` | text | Sim | ✅ Ativo (no backend) | — |

**Problemas críticos:**
1. **Não existe coluna `company_id` na tabela `partners`** — confirmado via query direta ao banco. Todas as queries de split no backend (create-asaas-payment, verify-payment-status, asaas-webhook) fazem `.eq("company_id", sale.company_id)` mas essa coluna **não existe**. Resultado: as queries **sempre retornam null**, o que significa que **o split para parceiro nunca funciona** em nenhum ambiente.
2. O frontend (`Partners.tsx`) grava apenas o campo `asaas_wallet_id` (legado), que nunca é lido pelo backend.
3. A tabela não tem FK para `companies`, violando o modelo multi-tenant.

### Tabela `sales` — campos Asaas

| Campo | Tipo | Nullable | Default | Status |
|---|---|---|---|---|
| `asaas_payment_id` | text | Sim | — | ✅ Ativo |
| `asaas_payment_status` | text | Sim | — | ✅ Ativo |
| `asaas_transfer_id` | text | Sim | — | ✅ Ativo |
| `payment_environment` | text | Não | Sem default | ⚠️ Sem default |
| `payment_method` | text | Sim | — | ✅ Ativo |
| `gross_amount` | numeric | Sim | — | ✅ Ativo |
| `platform_fee_total` | numeric | Sim | — | ✅ Ativo |
| `platform_fee_amount` | numeric | Sim | — | ⚠️ Redundante com `platform_fee_total` |
| `partner_fee_amount` | numeric | Sim | — | ✅ Ativo |
| `platform_net_amount` | numeric | Sim | — | ✅ Ativo |
| `platform_fee_status` | text | Não | `not_applicable` | ✅ Ativo |
| `platform_fee_payment_id` | text | Sim | — | ✅ Ativo |
| `platform_fee_paid_at` | timestamptz | Sim | — | ✅ Ativo |
| `payment_confirmed_at` | timestamptz | Sim | — | ✅ Ativo |
| `block_reason` | text | Sim | — | ✅ Ativo |

### Tabela `sale_logs`

Confirmada no banco. Contém: `id`, `sale_id`, `action`, `description`, `old_value`, `new_value`, `performed_by`, `company_id`, `created_at`. Usada por `payment-finalization.ts` para registrar confirmações de pagamento. ✅

### Tabela `asaas_webhook_event_dedup`

Tabela de deduplicação formal. Registra `asaas_event_id` único, com controle de duplicatas via constraint + RPC `mark_asaas_webhook_event_duplicate`. ✅

---

## Pontos corretos já consolidados

1. **Resolvedor central (`payment-context-resolver.ts`)** — Todas as decisões de ambiente, credencial, owner e split passam por um único ponto. Elimina drift entre funções. ✅

2. **Separação sandbox/produção completa em `companies`** — Campos legados removidos, sem fallback genérico. ✅

3. **Finalização compartilhada (`payment-finalization.ts`)** — Webhook e verify usam a mesma rotina, eliminando assimetria na geração de tickets. ✅

4. **Webhook fail-closed** — Sem ambiente persistido na venda, o webhook rejeita com HTTP 400. Sem token configurado, rejeita com HTTP 500. Sem token válido, rejeita com HTTP 401. ✅

5. **Deduplicação formal de webhook** — Via tabela dedicada + constraint de unicidade. ✅

6. **Observabilidade rica** — `sale_integration_logs` com campos de decisão, duration, resultado, incidente e warning. `logSaleOperationalEvent()` para trilha interna por venda. ✅

7. **Reconciliação disponível** — `reconcile-sale-payment` permite corrigir vendas inconsistentes (pagas sem tickets). ✅

8. **Ambiente nasce explícito na venda** — O checkout persiste `payment_environment` antes de criar a cobrança, e o create-asaas-payment valida/persiste antes de falar com o Asaas. ✅

9. **Status de integração no frontend** — `asaasIntegrationStatus.ts` avalia corretamente se a empresa está conectada por ambiente, exigindo api_key + wallet + onboarding_complete. ✅

10. **Limpeza automática de locks** — `cleanup-expired-locks` roda via cron a cada 5 minutos, cancelando vendas pendentes expiradas. ✅

---

## Duplicidades, legados e ambiguidades encontrados

### 🔴 CRÍTICO — C1: Tabela `partners` sem coluna `company_id`

**Impacto:** Todas as queries de split no backend (`create-asaas-payment` linha 468, `verify-payment-status` linha 423, `asaas-webhook` linha 881) fazem `.eq("company_id", sale.company_id)`. Como a coluna **não existe**, o Supabase client **silenciosamente retorna null** (PostgREST ignora filtros em colunas inexistentes com o client JS).

**Consequência:** O split para parceiro/sócio **nunca é executado**. A plataforma recebe 100% da taxa configurada, o sócio nunca recebe nada via split Asaas.

**Gravidade:** Bug financeiro silencioso. Em produção, o sócio ficaria sem receber.

---

### 🔴 CRÍTICO — C2: Frontend `Partners.tsx` grava campo legado

O formulário de cadastro de sócio (`Partners.tsx`) lê e grava apenas `asaas_wallet_id` (campo legado genérico). O backend lê exclusivamente `asaas_wallet_id_production` e `asaas_wallet_id_sandbox`.

**Consequência:** Qualquer wallet configurada pelo admin na UI nunca chega ao split real. Mesmo que C1 fosse corrigido (adicionando `company_id`), o split continuaria sem funcionar porque os campos por ambiente ficam vazios.

---

### 🟡 IMPORTANTE — C3: Opção "Automático pelo host atual" no wizard de onboarding

Quando o admin seleciona "Automático" no `AsaasOnboardingWizard`, o `target_environment` é enviado como `null`. A edge function `create-asaas-account` resolve o ambiente pelo host da requisição — que no contexto de edge functions é sempre o domínio do Supabase/Lovable, resultando em **sandbox**.

**Consequência:** A opção "Automático" é enganosa. Se o admin espera criar em produção e seleciona "Automático", a conta será criada em sandbox.

**Recomendação:** Remover a opção "Automático" e obrigar seleção explícita (Sandbox ou Produção).

---

### 🟡 IMPORTANTE — C4: Snapshot financeiro duplicado

O cálculo de `gross_amount`, `platform_fee_total`, `partner_fee_amount` e `platform_net_amount` é feito **duas vezes**:
1. No webhook via `upsertFinancialSnapshot()` (linhas 845-930 do asaas-webhook)
2. No verify-payment-status inline (linhas 415-461)

Ambos usam lógica idêntica mas são implementações separadas (não compartilhadas). Se uma for alterada e a outra não, os valores financeiros divergem dependendo de qual caminho confirmou o pagamento.

**Recomendação:** Extrair para função compartilhada em `payment-finalization.ts`.

---

### 🟡 IMPORTANTE — C5: `payment_environment` sem default na tabela `sales`

O campo é `NOT NULL` sem valor default. Vendas criadas pelo checkout online preenchem via hook `useRuntimePaymentEnvironment`. Porém:
- Se o hook não resolver antes do submit, `runtimePaymentEnvironment` pode ser `null`
- A inserção falha silenciosamente (violação NOT NULL)
- Vendas criadas manualmente pelo admin (`sale_origin = admin_manual`) também precisam preencher este campo

**Recomendação:** Adicionar default `'sandbox'` ou validar no frontend antes do submit.

---

### 🟢 MENOR — C6: Coluna `platform_fee_amount` vs `platform_fee_total`

Ambas existem na tabela `sales`. O código usa exclusivamente `platform_fee_total` para gravar e ler a taxa. `platform_fee_amount` parece ser um campo residual nunca populado.

**Recomendação:** Verificar se `platform_fee_amount` é usado em algum relatório. Se não, marcar para remoção futura.

---

### 🟢 MENOR — C7: Coluna `partners.asaas_wallet_id` legado

Existe no banco e é lida/gravada pelo frontend, mas não pelo backend. Gera confusão.

**Recomendação:** Após corrigir C2, remover a coluna via migration.

---

## Riscos estruturais e operacionais

### R1 — Split para sócio nunca funciona (C1 + C2)
**Risco:** Financeiro. Em produção, o sócio não recebe sua parte da taxa.  
**Probabilidade:** 100% (bug confirmado).  
**Impacto:** Alto.

### R2 — Snapshot financeiro pode divergir (C4)
**Risco:** Valores de `platform_fee_total` e `partner_fee_amount` diferentes dependendo de quem confirmou (webhook vs polling).  
**Probabilidade:** Baixa no MVP (lógica atual é idêntica), mas cresce com manutenção.  
**Impacto:** Médio.

### R3 — Checkout pode falhar se hook não resolver ambiente (C5)
**Risco:** Inserção de venda falha silenciosamente por violação NOT NULL.  
**Probabilidade:** Baixa (hook resolve rápido), mas possível em rede lenta.  
**Impacto:** Médio — venda perdida.

### R4 — Admin cria conta em sandbox pensando que é produção (C3)
**Risco:** Operacional. Empresa acredita estar em produção, mas opera em sandbox.  
**Probabilidade:** Média (depende da escolha do admin).  
**Impacto:** Alto — vendas reais não processsadas.

### R5 — Vendas admin_manual sem `payment_environment`
**Risco:** Se o admin cria venda manual e o campo não é preenchido, operações posteriores (verify, webhook) podem falhar.  
**Probabilidade:** Depende do fluxo de venda manual.  
**Impacto:** Médio.

---

## Ajustes recomendados

### A1 — Adicionar `company_id` à tabela `partners` (resolve C1)
- Adicionar coluna `company_id UUID NOT NULL REFERENCES companies(id)`
- Atualizar RLS para filtro multi-tenant
- Atualizar frontend `Partners.tsx` para filtrar por `activeCompanyId`

### A2 — Corrigir frontend `Partners.tsx` para campos por ambiente (resolve C2)
- Substituir campo `asaas_wallet_id` por `asaas_wallet_id_production` e `asaas_wallet_id_sandbox`
- Exibir campos separados no formulário
- Manter consistência com o modelo do backend

### A3 — Remover opção "Automático" do wizard de onboarding (resolve C3)
- Remover `SelectItem value="automatic"` do `AsaasOnboardingWizard`
- Default para `sandbox` no desenvolvimento
- Obrigar seleção explícita antes de prosseguir

### A4 — Extrair snapshot financeiro para shared (resolve C4)
- Criar `calculateAndPersistFinancialSnapshot()` em `payment-finalization.ts`
- Ambos webhook e verify passam a usar a mesma função
- Elimina risco de divergência

### A5 — Adicionar default ou guard para `payment_environment` (resolve C5)
- No frontend: bloquear submit se `runtimePaymentEnvironment` for null
- Alternativa no banco: adicionar default `'sandbox'` como rede de segurança

### A6 — Remover coluna legada `partners.asaas_wallet_id` (resolve C7)
- Migration: `ALTER TABLE partners DROP COLUMN asaas_wallet_id`
- Apenas após A2 estar implementado

### A7 — Remover coluna `sales.platform_fee_amount` (resolve C6)
- Verificar se não há dependência em relatórios
- Migration: `ALTER TABLE sales DROP COLUMN platform_fee_amount`

---

## Prioridade dos ajustes

| Prioridade | Ajuste | Justificativa |
|---|---|---|
| 🔴 P0 — Imediato | A1 + A2 | Split financeiro não funciona. Bug silencioso que causaria prejuízo real em produção. |
| 🟡 P1 — Antes do lançamento | A3 | Admin pode criar conta no ambiente errado sem perceber. |
| 🟡 P1 — Antes do lançamento | A5 | Checkout pode falhar silenciosamente em rede lenta. |
| 🟢 P2 — Primeira sprint pós-lançamento | A4 | Risco de divergência financeira baixo no MVP, mas cresce com manutenção. |
| 🟢 P3 — Limpeza técnica | A6, A7 | Redução de confusão. Sem impacto funcional imediato. |

---

## O que corrigir agora

1. **Tabela `partners`: adicionar `company_id`** — Sem essa coluna, o split para sócio é completamente inoperante. É a correção mais urgente de toda a integração.

2. **Frontend `Partners.tsx`: usar campos por ambiente** — Mesmo com `company_id`, se o frontend continuar gravando no campo legado, o split não funciona.

3. **Remover opção "Automático" do wizard** — Risco de o admin configurar no ambiente errado é inaceitável para lançamento.

4. **Bloquear submit do checkout sem `payment_environment`** — Proteção defensiva contra race condition na resolução do ambiente.

---

## O que manter temporariamente

1. **Snapshot financeiro duplicado (webhook + verify)** — A lógica é idêntica hoje. Pode ser unificada na primeira sprint, sem urgência.

2. **Coluna `partners.asaas_wallet_id`** — Manter enquanto a migração para campos por ambiente não estiver completa. Remover apenas após validar que o frontend usa os campos corretos.

3. **Coluna `sales.platform_fee_amount`** — Verificar uso em relatórios antes de remover. Se não for usada, agendar remoção para sprint de limpeza.

4. **Fallback de hostname no hook `useRuntimePaymentEnvironment`** — O fallback local é uma rede de segurança válida enquanto a edge function pode falhar. Manter com log de warning.

---

## O que remover futuramente

| Item | Condição de remoção |
|---|---|
| `partners.asaas_wallet_id` (coluna) | Após frontend usar campos por ambiente |
| `sales.platform_fee_amount` (coluna) | Após verificar que nenhum relatório a usa |
| Opção "Automático" no wizard | Remoção imediata recomendada |
| Snapshot duplicado no verify | Após extrair para shared em `payment-finalization.ts` |

---

## Veredito final

### Situação atual: ⚠️ Funcional na superfície, mas com fragilidade financeira crítica silenciosa

A integração Asaas do Smartbus BR apresenta uma **arquitetura bem desenhada** em sua camada de decisão (resolvedor central, finalização compartilhada, deduplicação, observabilidade). Os fundamentos estão corretos e a separação sandbox/produção na tabela `companies` é sólida.

Porém, existe um **bug financeiro silencioso** que compromete completamente o split para sócios: a tabela `partners` **não possui coluna `company_id`**, fazendo com que todas as queries de split no backend retornem nulo silenciosamente. Combinado com o frontend que grava no campo legado errado, o resultado é que **o split para sócio nunca funciona — nem em sandbox, nem em produção**.

Este problema não produz erro visível. Não há exceção, não há log de falha. A cobrança é criada normalmente, mas sem split para o parceiro. Em operação real, isso significaria que o sócio nunca receberia sua parte, sem que ninguém percebesse até uma reconciliação manual.

### Próximo passo mais inteligente

**Corrigir A1 + A2 imediatamente** (adicionar `company_id` à tabela `partners` e ajustar o frontend para campos por ambiente). Essa é a única correção que deve bloquear o lançamento.

Os demais ajustes (A3, A4, A5, A6, A7) são melhorias de robustez que devem ser implementadas antes ou logo após o lançamento, mas não são bloqueadores se o split estiver corrigido.

### Nota de reconhecimento

Apesar do bug de `partners`, a qualidade geral da integração é **acima da média** para um projeto neste estágio. A centralização de decisões, a observabilidade estruturada, a deduplicação formal e a finalização compartilhada são sinais de maturidade arquitetural real. O que falta é mais uma questão de completude da modelagem de dados (tabela `partners` não acompanhou a evolução multi-tenant) do que de falha de design.

---

*Fim da auditoria. Documento gerado para revisão e tomada de decisão.*
