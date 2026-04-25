# Resumo da etapa

- **Objetivo da Etapa 3:** habilitar detecção objetiva de inconsistências (`venda paga sem ticket`) e um caminho simples de recuperação, sem criar arquitetura paralela.
- **Implementado:**
  1. inspeção reutilizável de consistência da venda;
  2. reconciliação administrativa pontual por `sale_id` (com lote pequeno opcional);
  3. reaproveitamento obrigatório da rotina central de finalização da Etapa 2.
- **Abordagem escolhida:** edge function administrativa enxuta (`reconcile-sale-payment`) + helper compartilhado em `_shared/payment-finalization.ts`.

---

# Arquivos alterados

1. `supabase/functions/_shared/payment-finalization.ts`
   - adiciona `inspectSaleConsistency` para detecção objetiva;
   - mantém e expande `finalizeConfirmedPayment` para também suportar origem de reconciliação administrativa.

2. `supabase/functions/reconcile-sale-payment/index.ts` (novo)
   - função administrativa para reconciliação por `sale_id`;
   - aceita lote pequeno opcional (`sale_ids`, limitado a 20);
   - retorna resultado estruturado por venda + resumo consolidado.

3. `docs/analise-etapa3-reconciliacao-pragmatica-inconsistencias.md` (novo)
   - relatório técnico da etapa + checklist de validação.

---

# Estratégia de reconciliação

## Como a inconsistência é detectada
Critério principal, auditável e objetivo:
- `sales.status = pago` **e** `count(tickets por sale_id) = 0`.

Estados retornados pela inspeção:
- `healthy`
- `inconsistent_paid_without_ticket`
- `not_paid`
- `not_found`

## Elegibilidade
- elegível para reconciliação nesta etapa: `inconsistent_paid_without_ticket`.
- não elegível: venda não paga, venda inexistente, venda já saudável.

## Reuso da Etapa 2
- A reconciliação **não** implementa finalização paralela.
- Sempre chama `finalizeConfirmedPayment` (núcleo unificado da Etapa 2).

---

# Segurança e idempotência

- antes de inserir ticket, a rotina valida existência prévia (`skipped_existing`).
- venda saudável não é alterada (`healthy` retorna sem mutação).
- chamada repetida não duplica tickets (idempotência por `sale_id`).
- reconciliação mantém limpeza de `seat_locks` pelo fluxo central.

---

# Limitações e bordas

- ainda não há scheduler automático/cron de reconciliação (intencional; fica para evolução posterior).
- não há painel operacional visual nesta etapa.
- reconciliação em lote existe apenas em modo pequeno e manual (até 20 IDs por chamada).

---

# Recomendação objetiva

- A Etapa 3 ficou **simples e sustentável**, sem abrir novo fluxo paralelo.
- É seguro avançar para a Etapa 4.
- Alerta técnico antes de produção: garantir procedimento operacional para execução controlada da função administrativa e monitoramento dos retornos `inconsistent_unresolved`.

---

# Checklist de validação (sandbox)

- [ ] venda paga sem ticket é localizada (`inspectSaleConsistency`)
- [ ] reconciliação por `sale_id` retorna `reconciled` quando houver dados suficientes
- [ ] ticket é gerado sem duplicidade em chamadas repetidas
- [ ] venda saudável retorna `healthy` sem alteração
- [ ] venda não elegível retorna `not_eligible` com motivo
- [ ] erros de venda inexistente retornam `not_found`
- [ ] resposta inclui resumo consolidado + resultado por item
- [ ] logs mínimos da reconciliação são emitidos (`reconciliation_completed` / `unexpected_error`)
