# Análise 1 — Diagnóstico Webhook Asaas e consistência de cobranças (Produção)

> **Data:** 25/04/2026
> **Escopo:** Diagnóstico **somente leitura**. Nenhuma alteração de código, schema ou configuração foi feita.
> **Objetivo:** Identificar a causa raiz das múltiplas cobranças por venda e validar a saúde real do webhook Asaas em produção.

---

## Resultado executivo

Foram identificadas **três causas raiz independentes**, todas convergindo no sintoma reportado de "múltiplas cobranças para a mesma venda":

| # | Causa raiz | Severidade | Ambiente | Status atual |
|---|---|---|---|---|
| 1 | Chave Asaas de produção retornando **HTTP 401** ao buscar cliente | 🔴 CRÍTICO | Produção | Ativo |
| 2 | Falta de idempotência no checkout público — cada nova tentativa cria nova `sales` | 🟡 ALTO | Produção | Ativo |
| 3 | Venda `351151a0` presa em `reservado` há > 9h sem `asaas_payment_id` | 🟠 MÉDIO | Produção | Ativo agora |

A hipótese inicial de "webhook recriando cobranças" e "duplicação por falha de idempotência do webhook" foi **descartada com evidência**: a deduplicação por `asaas_event_id` está funcionando corretamente.

---

## Causa raiz #1 — API key Asaas inválida em produção (CRÍTICO)

### Evidência

A empresa **BUSÃO OFF OFF** (`3838e687-1a01-4bae-a979-e3ac5356e87e`) acumulou **6 falhas HTTP 401** ao tentar buscar cliente no Asaas entre 22 e 24 de abril, em ambiente `production`:

```
sale_id                              | created_at          | http_status | message
dcc51d4c (Camila Lorena, R$ 77)      | 2026-04-22 20:37:21 | 401 | Resposta vazia ao buscar cliente no Asaas (HTTP 401, 2 tentativa(s))
c3f72d17 (Camila Lorena, R$ 77)      | 2026-04-22 20:38:41 | 401 | idem
d1a941b9 (Camila Lorena, R$ 77)      | 2026-04-23 11:23:03 | 401 | idem
65d15166 (Camila Lorena, R$ 77)      | 2026-04-23 11:24:04 | 401 | idem
d0a55af1 (Camila Lorena, R$ 77)      | 2026-04-24 15:35:09 | 401 | idem
```

### Impacto técnico

No fluxo `create-asaas-payment` (linha 859–919), a busca de cliente acontece **antes** da criação da cobrança. Se a chave de API estiver inválida:

1. `GET /customers?cpfCnpj=...` retorna `401` (com body vazio).
2. Após 2 retries (também 401), o backend devolve `502` ao frontend.
3. A venda já foi criada localmente como `pendente_pagamento`, **mas sem `asaas_payment_id`**.
4. Não existe cobrança real no Asaas — apenas uma venda órfã no banco.
5. Webhook nunca chegará para essa venda (não há `payment.id` lá fora).

### Estado da configuração

```
companies.id                              = 3838e687-1a01-4bae-a979-e3ac5356e87e
asaas_api_key_production                  = (presente, length > 10)
asaas_account_email_production            = leonardo@busaooffoff.com.br
asaas_pix_ready_production                = true   ← STALE
asaas_pix_last_checked_at_production      = 2026-04-02   ← 22 dias atrás
asaas_pix_last_error_production           = null
asaas_wallet_id_production                = c92c0cf1-6120-444e-9849-78cc601fb6cb
```

A flag `asaas_pix_ready_production = true` está **desatualizada há 22 dias** e não reflete o estado real (chave 401). O healthcheck atual não roda periodicamente.

### Hipóteses para o 401

Em ordem de probabilidade:

1. Chave foi rotacionada/revogada no painel Asaas e não foi atualizada na tabela `companies`.
2. Chave expirou.
3. Conta foi suspensa pelo Asaas.

> Validação manual obrigatória no painel Asaas + na tela `/admin/empresa` da BUSÃO OFF OFF.

---

## Causa raiz #2 — Falta de idempotência no checkout público

### Evidência

A mesma cliente **Camila Lorena de Assis Souza** (CPF único) gerou **6 vendas distintas** em 3 dias, todas em `production`, todas com `gross_amount` na faixa de R$ 77–84,70:

```
created_at           | sale_id     | status        | asaas_payment_id | platform_fee_payment_id
2026-04-22 20:37:15  | dcc51d4c    | cancelado     | NULL             | NULL
2026-04-22 20:38:35  | c3f72d17    | cancelado     | NULL             | NULL   ← 1 min depois
2026-04-23 11:22:57  | d1a941b9    | cancelado     | NULL             | NULL
2026-04-23 11:23:58  | 65d15166    | cancelado     | NULL             | NULL   ← 1 min depois
2026-04-24 15:35:04  | d0a55af1    | cancelado     | NULL             | NULL
2026-04-24 16:15:27  | 351151a0    | reservado     | NULL             | pay_eztv82mobz5o01hb   ← presa agora
```

### Impacto

- **Operacional:** cada nova tentativa do cliente cria uma nova `sales`, novos `seat_locks`, e bloqueia capacidade real do veículo.
- **Métricas:** vendas órfãs poluem KPIs e dashboards.
- **Banco:** existem hoje **8 vendas órfãs no sistema** com `platform_fee_payment_id` definido mas sem `asaas_payment_id` (cobrança principal nunca persistida):

```
status      | total
reservado   | 1   ← venda 351151a0 da Camila, ativa agora
pago        | 2
cancelado   | 5
```

Não existe nenhuma trava de "tentativa recente" para o mesmo `event_id + customer_cpf`, então cada clique no botão de checkout vira nova venda.

---

## Causa raiz #3 — Venda 351151a0 presa em produção (incidente ativo)

### Estado snapshot (25/04 01:30 UTC)

```
sale_id                  = 351151a0-dfb3-4aa8-ae88-40cccaea2f57
status                   = reservado
asaas_payment_id         = NULL
platform_fee_payment_id  = pay_eztv82mobz5o01hb
platform_fee_status      = pending
gross_amount             = 84,70
customer                 = Camila Lorena de Assis Souza
payment_environment      = production
created_at               = 2026-04-24 16:15:27
updated_at               = 2026-04-25 01:21:48   ← ainda sendo polled
```

### Trilha de logs

```
00:47:57  manual_sync   verify_payment_status   200   "Verify sem cobrança Asaas vinculada; sem consulta externa"
00:48:37  manual_sync   verify_payment_status   200   idem
00:48:53  manual_sync   verify_payment_status   200   idem
00:49:10  manual_sync   verify_payment_status   200   idem
01:04:26  manual_sync   verify_payment_status   200   idem
01:04:40  manual_sync   verify_payment_status   200   idem
01:21:31  manual_sync   verify_payment_status   200   idem
01:21:46  manual_sync   verify_payment_status   200   idem
```

### Diagnóstico

- **Não há nenhum log `outgoing_request/create_payment` para esta venda.** Ou seja, ou (a) a edge function `create-asaas-payment` nem foi chamada, ou (b) foi chamada antes do logging atual entrar em vigor e falhou silenciosamente.
- O `platform_fee_payment_id` já existe (cobrança da taxa criada por outro fluxo, provavelmente "Gerar taxa manual" no admin), mas a cobrança **principal** da passagem nunca foi criada.
- A cliente está fazendo polling há mais de **40 minutos** em vão — `verify-payment-status` não consulta o Asaas porque `asaas_payment_id` é NULL.

### Risco imediato

Se o sistema enviou ao cliente o link de pagamento da `pay_eztv82mobz5o01hb` (taxa) por engano, ela pode pagar uma cobrança "fantasma" que o sistema não saberá relacionar à venda.

---

## O que NÃO é problema (validado com dados)

| Hipótese | Veredito | Evidência |
|---|---|---|
| Webhook duplicando eventos | ✅ OK | Tabela `asaas_webhook_event_dedup`: 19 eventos únicos / 2 duplicates marcados corretamente. Casos como `evt_15e444ff9b9ab9ec...` e `evt_d26e303b238e509...` foram processados 1x e ignorados 1x com `processing_status='duplicate'` e `warning_code='duplicate_event_id'`. |
| `externalReference` ≠ `sale.id` | ✅ OK | Caso de sucesso `4200f9f2`: outgoing_request → response com `pay_m5nzga95h9lmvyn4` → webhook `PAYMENT_CONFIRMED` com mesmo `externalReference` → vinculação correta → finalização de tickets. |
| Webhook recriando cobranças | ✅ OK | O webhook **não cria** cobranças, apenas processa eventos. A duplicação de cobranças vem do **frontend criando vendas novas a cada tentativa**, não do webhook. |
| Múltiplos `payment_id` reais para mesma venda | ⚠️ 1 caso | Apenas a venda `91806342` (sandbox, 22/03) acumulou 3 `payment_id` distintos (`pay_5hja6vedo190e4yx`, `pay_rl3gghbxu5wk3dc9`, `pay_xm4xqe9k0u474wad`) — provavelmente teste manual de "Gerar nova cobrança" no admin. **Em produção, NÃO há esse padrão.** |
| Duplicação de `outgoing_request/create_payment` por venda | ⚠️ Cosmético | 29 de 50 vendas (58%) têm 2 entradas em `outgoing_request/create_payment`, mas com **mesmo `payment_id`**. É apenas logging dual: 1 entry para `requested` (`message="Solicitação de criação de cobrança enviada ao Asaas"`) + 1 entry para `success` (`message="Cobrança criada com sucesso no Asaas"`). Não há cobrança duplicada de fato no Asaas. |

---

## Tabela de evidências numéricas

| Métrica | Valor |
|---|---|
| Vendas com chamada `create_payment` (60d) | 50 |
| Vendas com 1 chamada de log | 21 |
| Vendas com >1 chamada de log (logging dual normal) | 29 |
| Vendas órfãs (`asaas_payment_id NULL` + `platform_fee_payment_id` ≠ NULL) | 8 |
| Vendas órfãs em status ativo (`reservado`) | 1 (351151a0, ativa agora) |
| Erros HTTP 401 no `create-asaas-payment` (produção, BUSÃO OFF OFF, 22-24/04) | 6 |
| Vendas com múltiplos `asaas_payment_id` reais (produção) | 0 |
| Vendas com múltiplos `asaas_payment_id` reais (sandbox/teste) | 1 (91806342) |
| Eventos únicos na `asaas_webhook_event_dedup` | 19 |
| Eventos duplicados ignorados pelo dedup | 2 |
| **Último webhook `incoming_webhook` recebido** | **2026-04-03** (mais de 20 dias sem nenhum) |

---

## Distribuição de webhook por status (últimos 30 dias)

```
dia          | http_status | processing_status | result_category | total
2026-04-07   | 400         | rejected          | rejected        | 15   ← pay_kh3w57mi740xcaat (PAYMENT_OVERDUE) sem ambiente resolvido
2026-04-03   | 200         | ignored           | ignored         | 11
2026-04-03   | 200         | success           | success         | 1
2026-04-02   | 400         | rejected          | rejected        | 8    ← pay_1fj90mhppqjfzpyw (PAYMENT_CREATED) sem ambiente resolvido
2026-04-01   | 400         | rejected          | rejected        | 16
2026-04-01   | 200         | success           | success         | 2
2026-03-30   | 200         | ignored           | ignored         | 4
2026-03-30   | 400         | rejected          | rejected        | 1
2026-03-29   | 200         | ignored           | ignored         | 2
2026-03-27   | 400         | rejected          | rejected        | 15
```

**Observação:** os 400 são todos `Ambiente da venda não determinado; webhook rejeitado` — eventos do Asaas chegando com `externalReference` que não casa com nenhuma venda válida em `sales` (provavelmente cobranças antigas/teste já apagadas, ou cobranças que nasceram fora do sistema).

---

## Riscos residuais

1. **Risco financeiro imediato:** se o link de `pay_eztv82mobz5o01hb` foi enviado à Camila Lorena por canal externo, ela pode pagar uma taxa órfã sem que o sistema relacione à venda 351151a0.
2. **Risco operacional crítico:** **silêncio total de webhook desde 03/04** (mais de 20 dias). Compatível com a fila pausada já documentada na `analise-12-diagnostico-webhook-asaas-pausado.md`. Mesmo se a chave 401 fosse corrigida agora, a fila no painel Asaas continuaria pausada e nada chegaria. **Webhook precisa ser reativado manualmente no painel Asaas.**
3. **Risco de UX:** vendas presas em `reservado` consomem `seat_locks` e bloqueiam capacidade real de venda nos próximos eventos da empresa BUSÃO OFF OFF.
4. **Risco de auditoria:** sem o webhook chegando, qualquer pagamento PIX confirmado no Asaas hoje **NÃO está sendo refletido no sistema** — vendas pagas continuam aparecendo como `pendente_pagamento`.

---

## Recomendações de correção mínima (não aplicadas)

### Operacional imediato (sem código)

1. **Validar e rotacionar chave Asaas** da empresa BUSÃO OFF OFF no painel Asaas e atualizar via `/admin/empresa` (Cloud).
2. **Reativar fila do webhook** no painel Asaas após validar uma transação real de teste.
3. **Verificar se a cliente Camila Lorena pagou** alguma cobrança nos últimos dias (`pay_eztv82mobz5o01hb` ou anteriores) e regularizar manualmente.
4. **Cancelar a venda 351151a0** (e as outras 7 órfãs) para liberar `seat_locks` e parar o polling.

### Código (mudanças mínimas, fora desta etapa)

1. Em `create-asaas-payment`, ao receber `401` do Asaas:
   - Marcar a venda como `cancelado` (ou novo status `falha_integracao`) com `incident_code = ASAAS_AUTH_FAILED`.
   - Disparar `admin_notifications` de severidade `critical` para o gerente da empresa revisar credenciais.
   - Atualizar `companies.asaas_pix_ready_production = false` e `asaas_pix_last_error_production = 'HTTP 401 ao buscar cliente'`.

2. Idempotência de checkout: ao receber novo POST de criação de venda para mesmo `event_id + customer_cpf` com venda existente em `pendente_pagamento` < 15 min, **reaproveitar** em vez de criar nova `sales`.

3. Healthcheck periódico (cron diário): chamar `GET /myAccount` no Asaas com a chave de cada empresa ativa e atualizar `asaas_pix_last_error_*` + `asaas_pix_last_checked_at_*`. Disparar notificação admin se 401/403.

4. Em `verify-payment-status`, se passar X minutos (ex.: 30 min) sem `asaas_payment_id` na venda, parar o polling do frontend e mostrar mensagem clara: "Não foi possível gerar a cobrança. Tente novamente."

---

## Apêndice — Queries SQL utilizadas no diagnóstico

### A. Vendas com múltiplos `payment_id` (via logs)
```sql
select sale_id, count(distinct payment_id) distinct_payment_ids,
  array_agg(distinct payment_id) payment_ids,
  min(created_at) first_seen, max(created_at) last_seen
from public.sale_integration_logs
where provider = 'asaas' and payment_id is not null and sale_id is not null
group by sale_id having count(distinct payment_id) > 1
order by distinct_payment_ids desc;
```

### B. Volume de webhook por dia/direção/erros (60 dias)
```sql
select date_trunc('day', created_at) dia, direction,
  count(*) total,
  count(*) filter (where http_status>=400) errors
from public.sale_integration_logs
where provider='asaas' and created_at >= now() - interval '60 days'
group by 1,2 order by 1 desc, 2;
```

### C. Erros 401 de criação de cobrança por empresa
```sql
select s.company_id, c.name, count(*) total_401, max(l.created_at) last_401
from public.sale_integration_logs l
join public.sales s on s.id = l.sale_id
left join public.companies c on c.id = s.company_id
where l.provider='asaas' and l.direction='outgoing_request'
  and l.event_type='create_payment' and l.http_status=401
group by s.company_id, c.name order by total_401 desc;
```

### D. Vendas órfãs (sem `asaas_payment_id` mas com `platform_fee_payment_id`)
```sql
select id, status, gross_amount, customer_name, payment_environment,
  created_at, updated_at, asaas_payment_id, platform_fee_payment_id, platform_fee_status
from public.sales
where asaas_payment_id is null and platform_fee_payment_id is not null
order by created_at desc;
```

### E. Trilha completa de uma venda
```sql
select created_at, direction, event_type, payment_id, http_status,
  processing_status, result_category, message
from public.sale_integration_logs
where sale_id = '<UUID>'
order by created_at;
```

### F. Estado de configuração Asaas das empresas
```sql
select c.id, c.name,
  (asaas_api_key_production is not null and length(asaas_api_key_production) > 10) has_prod_key,
  asaas_account_email_production, asaas_onboarding_complete_production,
  asaas_pix_ready_production, asaas_pix_last_error_production,
  asaas_pix_last_checked_at_production, asaas_wallet_id_production
from public.companies c where c.is_active = true order by c.name;
```

### G. Top eventos duplicados no dedup
```sql
select asaas_event_id, duplicate_count, last_sale_id,
  last_payment_environment, first_received_at, last_seen_at
from public.asaas_webhook_event_dedup
order by duplicate_count desc, last_seen_at desc limit 20;
```
