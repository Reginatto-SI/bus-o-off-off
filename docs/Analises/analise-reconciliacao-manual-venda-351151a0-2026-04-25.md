# Análise — Reconciliação manual da venda `351151a0-dfb3-4aa8-ae88-40eccaea2f57`

Data/hora (UTC): **2026-04-25**

## Diagnóstico

### Sintoma
- Venda informada como paga no Asaas fora do sistema, porém sem convergência local via webhook.

### Onde ocorre
- Fluxo de finalização de pagamento em Edge Functions (`verify-payment-status` / `reconcile-sale-payment`), que reutilizam `finalizeConfirmedPayment(...)`.

### Evidência coletada
1. Foi executada reconciliação administrativa via função existente `reconcile-sale-payment` para o `sale_id` informado.
2. A função retornou `state=not_found` para a venda informada.
3. Foi executada tentativa de convergência ativa via `verify-payment-status` para o mesmo `sale_id` e também retornou `{"error":"Sale not found"}`.

### Causa provável (com base na evidência)
- No ambiente Supabase atualmente configurado no projeto (`cdrcyjrvurrphnceromd`), a venda `351151a0-dfb3-4aa8-ae88-40eccaea2f57` **não existe**; portanto, o fluxo seguro de finalização não pode ser acionado para esse registro neste ambiente.

## Execução técnica realizada

### 1) Reconciliação administrativa (fluxo oficial, sem update direto em banco)
Comando:

```bash
curl -i -sS -X POST "$SUPABASE_URL/functions/v1/reconcile-sale-payment" \
 -H "Content-Type: application/json" \
 -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
 -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
 --data '{"sale_id":"351151a0-dfb3-4aa8-ae88-40eccaea2f57"}'
```

Resultado:

```json
{
  "summary": {
    "total": 1,
    "healthy": 0,
    "reconciled": 0,
    "inconsistent_unresolved": 0,
    "not_eligible": 0,
    "not_found": 1,
    "error": 0
  },
  "results": [
    {
      "sale_id": "351151a0-dfb3-4aa8-ae88-40eccaea2f57",
      "state": "not_found",
      "message": "Venda 351151a0-dfb3-4aa8-ae88-40eccaea2f57 não encontrada",
      "tickets_before": 0,
      "tickets_after": 0,
      "payment_environment": null
    }
  ]
}
```

### 2) Verificação de pagamento (fluxo oficial que chama finalização)
Comando:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/verify-payment-status" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  --data '{"sale_id":"351151a0-dfb3-4aa8-ae88-40eccaea2f57","force_revalidate":true}'
```

Resultado:

```json
{"error":"Sale not found"}
```

## Resultado desta execução

- **Função usada:** `reconcile-sale-payment` (reutiliza `finalizeConfirmedPayment(...)` quando elegível).
- **Registros alterados:** nenhum (venda não encontrada no ambiente).
- **Ticket gerado:** não aplicável nesta execução (não houve venda alvo para finalizar).
- **Logs de reconciliação:** houve execução da edge function com retorno estruturado `not_found` (request id de borda presente na resposta HTTP).

## Conclusão operacional

Não foi possível concluir a reconciliação manual solicitada para esta venda no ambiente atual porque o `sale_id` informado não existe neste projeto Supabase.

## Próximo passo para concluir sem risco

1. Confirmar o **project ref correto de produção** onde a venda foi criada.
2. Reexecutar exatamente o mesmo endpoint administrativo (`reconcile-sale-payment`) nesse projeto com o mesmo `sale_id`.
3. Se retornar `reconciled`/`healthy`, validar:
   - `sales.status = pago`
   - `platform_fee_status` convergido
   - tickets existentes para `sale_id`
   - trilha `sale_logs`/`sale_integration_logs`.
