# Como diagnosticar uma venda por `sale_id`

## 1) Onde olhar primeiro
1. `sale_logs` filtrando por `sale_id` (trilha operacional `[payment_ops]`)
2. `sale_integration_logs` da mesma venda (requisições/respostas técnicas)
3. logs estruturados das edge functions (`logPaymentTrace`) quando precisar aprofundar

## 2) Estados principais e significado
- `payment_create_started`: início da tentativa de criar cobrança
- `payment_create_completed`: cobrança criada com sucesso
- `payment_finalize_started`: finalização iniciada
- `payment_finalize_completed`: finalização saudável
- `payment_finalize_inconsistent`: venda paga sem ticket após tentativa
- `payment_finalize_failed`: erro técnico de finalização
- `reconciled`: reconciliação administrativa resolveu a inconsistência
- `not_eligible`: venda não elegível para reconciliação (ex.: não paga)

---

# Como saber se rodou em sandbox ou produção

- Verifique `payment_environment` em `sales`.
- Confirme `env=` nos registros `[payment_ops]` em `sale_logs`.
- Valide também `payment_environment` nos eventos estruturados (`logPaymentTrace`) de verify/reconcile.

Validação rápida:
1. abrir venda (`sales.id = sale_id`)
2. confirmar `payment_environment`
3. conferir se eventos operacionais da mesma venda trazem o mesmo ambiente

---

# Como identificar onde o fluxo falhou

## Criação
- falha em `payment_create_failed`
- revisar `sale_integration_logs` de `create_payment`

## Webhook
- revisar `sale_integration_logs` com `direction=incoming_webhook`
- conferir status (`success`, `partial_failure`, `failed`, `unauthorized`)

## Verify
- revisar eventos `payment_status_fetch_failed`, `payment_status_fetch_exception`, `payment_not_confirmed`

## Finalização
- revisar `payment_finalize_*` em `sale_logs`
- se `payment_finalize_inconsistent`, foco em dados de ticket/passageiros

## Ticket
- validar existência de `tickets` por `sale_id`
- se ausente e venda `pago`, tratar como inconsistente

## Reconciliação
- executar `reconcile-sale-payment` por `sale_id`
- interpretar estado retornado (`reconciled`, `healthy`, `inconsistent_unresolved`, `not_eligible`, etc.)

---

# Quando usar a reconciliação administrativa

## Faz sentido usar quando
- venda está `pago` e sem ticket
- houve falha pontual de finalização já registrada
- caso histórico pendente precisa de correção controlada

## Não faz sentido usar quando
- venda ainda não está paga
- venda já está saudável com ticket existente
- problema é de configuração de ambiente/token ainda não corrigida

Regra prática:
- sempre validar `payment_environment` antes da reconciliação.
- sempre registrar o `sale_id` analisado e o resultado retornado.
