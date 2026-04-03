# 1. O que foi implementado

Foi implementada uma blindagem mínima e segura para reversão financeira/disputa/chargeback com foco operacional, reaproveitando o fluxo existente (webhook Asaas + fallback manual + diagnóstico), sem criar arquitetura nova e sem automatizar reembolso/split.

Principais entregas:

1. **Webhook (`asaas-webhook`)**
   - Passou a tratar explicitamente `PAYMENT_UPDATED` e `PAYMENT_RESTORED` (já previstos no contrato de webhook configurado no projeto).
   - Passou a decidir a reação também por **status do pagamento** (não apenas por `eventType`), incluindo detecção conservadora de sinais de `CHARGEBACK`/`DISPUTE`/`CONTEST` no `payment.status`.
   - Reversão pós-pago deixou de ser invisível:
     - se não houve uso operacional (sem embarque consumido), a venda é cancelada e artefatos operacionais são limpos;
     - se já houve embarque, o histórico é preservado e o risco financeiro é marcado em log operacional.

2. **Fallback manual (`verify-payment-status`)**
   - Adicionado suporte de revalidação manual para venda já `pago` com `force_revalidate=true`.
   - Em revalidação, se houver status de reversão/disputa:
     - antes do embarque: cancela operacionalmente a venda e limpa artefatos;
     - após embarque: preserva histórico e registra risco financeiro explícito.

3. **Diagnóstico administrativo (`/admin/diagnostico-vendas`)**
   - Ajustado para destacar melhor risco financeiro pós-pago quando `asaas_payment_status` indicar estorno/disputa/chargeback.
   - Para venda `pago` com status de reversão, a linha agora entra em categoria de **divergência crítica** (não fica mascarada como “pago saudável”).
   - A divergência técnica `sales.status x asaas_payment_status` passa a ser crítica nos cenários de estorno/disputa/chargeback.

---

# 2. Como ficou a regra operacional

## Quando cancela

### Webhook (fonte de verdade principal)
Se chegar evento/status terminal de reversão financeira e a venda estiver `pago`, o sistema avalia uso operacional:

- **Sem uso operacional (pré-embarque)**: cancela `sales.status -> cancelado`, registra motivo técnico no `cancel_reason`, atualiza `asaas_payment_status`, remove `tickets`, `seat_locks` e `sale_passengers`.
- **Com uso operacional (pós-embarque)**: não apaga histórico consumido; mantém venda e grava alerta de risco financeiro em log operacional.

### Fallback manual (`force_revalidate=true`)
Segue a mesma regra acima apenas quando acionado explicitamente para auditoria/reconciliação.

## Quando libera assento

- Nos cenários de cancelamento operacional (pré-embarque), o sistema remove `seat_locks` e `tickets`, liberando a ocupação operacional da venda cancelada.
- Em pós-embarque, não remove histórico consumido por segurança/auditoria.

## Quando apenas registra risco

- Se a reversão financeira for detectada **após uso operacional** (ticket já com `boarding_status != 'pendente'`), o sistema registra incidente de risco financeiro (`post_paid_reversal_after_boarding`) sem exclusão destrutiva.

## Quando impede embarque

- Ao cancelar operacionalmente venda pré-embarque (status `cancelado`), o embarque é bloqueado pelas regras existentes de validação (`sale.status` não pago).

## Por que não reembolsa split/taxa automaticamente

- O código foi comentado explicitamente mantendo a regra de negócio: **não há rollback automático de split/taxa/plataforma** e **não há reembolso automático** neste fluxo.
- A devolução financeira ao passageiro segue responsabilidade manual da empresa de ônibus.

---

# 3. Arquivos alterados

1. `supabase/functions/asaas-webhook/index.ts`
   - suporte explícito a `PAYMENT_UPDATED`/`PAYMENT_RESTORED`;
   - detecção de reversão/disputa por status;
   - reação operacional pós-pago (cancelar antes do embarque, marcar risco após embarque);
   - hardening multiempresa com filtros por `company_id` nos updates/deletes tocados.

2. `supabase/functions/verify-payment-status/index.ts`
   - novo modo de revalidação manual `force_revalidate=true` para venda já `pago`;
   - aplicação da mesma blindagem operacional de reversão em contexto de auditoria/reconciliação.

3. `src/pages/admin/SalesDiagnostic.tsx`
   - sinalização explícita de risco financeiro em casos de estorno/disputa/chargeback;
   - priorização crítica para divergências pós-pago com reversão financeira.

---

# 4. Riscos preservados / pontos que continuam manuais

1. **Reembolso ao cliente continua manual** (empresa de ônibus):
   - sem estorno automático de split/taxa/comissão;
   - sem recálculo retroativo de split.

2. **Dependência do contrato externo de status/evento do gateway**:
   - o webhook foi endurecido para sinais de reversão/disputa por `payment.status`, mas continua dependente do que o Asaas efetivamente enviar.

3. **Pós-embarque não apaga histórico**:
   - por segurança operacional e auditabilidade, mantém histórico consumido e registra risco/prejuízo.

---

# 5. Como validar

## Cenário A — reversão pós-pago antes do embarque (deve cancelar)
1. Criar venda e confirmar pagamento (`pago`) com tickets em `boarding_status='pendente'`.
2. Simular webhook com `event=PAYMENT_UPDATED` (ou evento suportado) e `payment.status` de reversão (`REFUNDED` ou status contendo `CHARGEBACK`/`DISPUTE`/`CONTEST`).
3. Validar:
   - `sales.status = cancelado`;
   - `asaas_payment_status` atualizado;
   - `tickets`, `seat_locks` e `sale_passengers` removidos para a venda;
   - log técnico em `sale_integration_logs` e log operacional correspondente.

## Cenário B — reversão pós-pago após embarque (deve preservar histórico + marcar risco)
1. Criar venda paga com ao menos um ticket já utilizado (`boarding_status != 'pendente'`).
2. Simular webhook de reversão/disputa.
3. Validar:
   - venda não é apagada/limpa destrutivamente;
   - `asaas_payment_status` atualizado;
   - incidente operacional registrado (`post_paid_reversal_after_boarding`);
   - diagnóstico destaca risco financeiro pós-pago.

## Cenário C — fallback manual de auditoria
1. Chamar `verify-payment-status` para venda já paga com `force_revalidate=true`.
2. Com status reverso no Asaas, validar comportamento equivalente aos cenários A/B.
3. Sem `force_revalidate`, validar que o comportamento legado permanece (sem polling paralelo).

## Cenário D — regra financeira
1. Em qualquer cenário acima, validar que não há rotina automática de reembolso/split rollback.
2. Confirmar que a tratativa financeira permanece manual pela empresa.
