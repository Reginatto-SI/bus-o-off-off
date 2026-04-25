# Análise 9 — Regularização da venda SB-000114

Data da execução: **2026-04-25 (UTC)**

## 1) Venda localizada

- Referência operacional existente no histórico do projeto: **SB-000114** (venda manual com taxa Asaas).  
- Evidência anterior já registrada no repositório: caso da SB-000114 vinculado ao incidente de taxa manual paga sem convergência local.
- **Busca técnica executada em produção (REST):**
  - `tickets.ticket_number = 'SB-000114'` retornou `[]` com chave anônima.
  - RPC `get_sales_report_summary_paginated` com `p_search = 'SB-000114'` retornou `[]`.

### Resultado do passo 1 (UUID)

- **UUID da venda não foi localizado neste ambiente** com as credenciais disponíveis (`anon`), portanto o `sale_id` real ainda não foi identificado aqui.

## 2) Execução do `verify-payment-status`

### 2.1 Tentativa direta com identificador humano `SB-000114`

Comando executado:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/verify-payment-status" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sale_id":"SB-000114"}'
```

Resposta:

```json
{"error":"Sale not found"}
```

Conclusão: o endpoint exige `sale_id` UUID real da tabela `sales` (não o número de passagem `SB-000114`).

## 2.2 Tentativas de localizar UUID antes do verify

Comandos executados:

```bash
curl -sS "$SUPABASE_URL/rest/v1/tickets?select=id,sale_id,ticket_number,passenger_name&ticket_number=eq.SB-000114" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY"
```

Resposta:

```json
[]
```

```bash
curl -sS -X POST "$SUPABASE_URL/rest/v1/rpc/get_sales_report_summary_paginated" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_search":"SB-000114","p_limit":10,"p_offset":0}'
```

Resposta:

```json
[]
```

Conclusão operacional: sem acesso administrativo (service role/sessão gerente), não foi possível resolver `sale_id` a partir de `ticket_number`.

## 3) Confirmação do fallback de taxa manual no verify

Foi validado no código da edge function `verify-payment-status` que existe branch de fallback manual quando:

- `asaas_payment_id` está ausente;
- `platform_fee_payment_id` existe;
- `platform_fee_status` está `pending` ou `failed`;
- origem da venda é manual/admin.

No fallback, a função consulta `/payments/{platform_fee_payment_id}` no Asaas e, quando status confirmado, converge a venda para pago e preenche timestamps.

## 4) Situação operacional desta execução

### 4.1 O que foi possível confirmar com evidência

- O fluxo de fallback manual está implementado no backend (`verify-payment-status`) para convergir casos como o da taxa manual.
- A chamada ao `verify-payment-status` foi executada e retornou erro de identificação da venda (`Sale not found`) ao usar `SB-000114`.
- A busca do UUID por `tickets.ticket_number = 'SB-000114'` também foi executada e retornou vazio com credencial anônima.

### 4.2 O que não foi possível concluir neste ambiente

Sem `sale_id` UUID da venda (ou credencial de leitura administrativa para localizar via `tickets.ticket_number`), **não foi possível**:

1. consultar a venda correta no `verify-payment-status`;
2. confirmar convergência final em banco para:
   - `status = pago`;
   - `platform_fee_status = paid`;
   - `platform_fee_paid_at` preenchido;
   - `payment_confirmed_at` preenchido;
3. confirmar status final da passagem/ticket na base.

### Status explícito dos passos obrigatórios desta tarefa

1. **Localizar UUID real da venda**: ❌ pendente (não localizado neste ambiente).
2. **Executar verify com UUID real**: ❌ pendente (bloqueado pelo passo 1).
3. **Validar convergência final dos campos**: ❌ pendente (bloqueado pelo passo 2).
4. **Confirmar passagem como paga**: ❌ pendente (bloqueado pelo passo 2).
5. **Atualizar análise 9 com evidências**: ✅ concluído (este documento).

## 5) Observação sobre cobrança duplicada

- O incidente de duplicidade da taxa já estava documentado nas análises anteriores.
- Nesta regularização, **não foi feito nenhum update manual direto** e **não foi removido histórico**.
- A duplicidade deve permanecer registrada para tratativa financeira separada (auditoria + devolução/abatimento).

## 6) Recomendação financeira (devolução/abatimento)

Após localizar o `sale_id` UUID da SB-000114 e executar `verify-payment-status` com sucesso, recomenda-se:

1. preservar trilha de auditoria (`sale_logs` e `sale_integration_logs`);
2. identificar as duas cobranças da taxa no Asaas;
3. tratar a cobrança excedente por:
   - **devolução** (refund), quando aplicável; ou
   - **abatimento** financeiro em repasse subsequente;
4. registrar decisão financeira com referência explícita da venda/taxa duplicada.

## 7) Próximo passo obrigatório para fechar a regularização

Executar em ambiente com acesso administrativo (Supabase Dashboard/Service Role):

1. localizar `sales.id` via `tickets.ticket_number = 'SB-000114'`;
2. chamar `verify-payment-status` com esse UUID;
3. registrar os campos finais da venda e dos tickets no fechamento da análise.
