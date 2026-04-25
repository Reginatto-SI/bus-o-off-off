# 03 — PRD Asaas: Webhook e Confirmação de Pagamento

## 1. Objetivo
Documentar a confirmação de pagamento no SmartBus BR, com prioridade ao webhook Asaas e papel do verify como fallback de convergência.

## 2. Contexto
A confirmação é o ponto mais sensível do fluxo de vendas. Erros aqui podem gerar venda paga sem ticket, ticket sem pagamento confirmado, ou divergência financeira.

## 3. Classificação
- **Criticidade:** Crítica Máxima
- **Público principal:** Suporte, Desenvolvimento, Produto, Auditoria
- **Telas impactadas:** `/confirmacao/:id`, `/admin/vendas/diagnostico`
- **Risco se quebrar:** perda de rastreabilidade, divergência de status, impacto financeiro
- **Origem da regra:** `asaas-webhook`, `verify-payment-status`, `payment-finalization`

## 4. Regra de ouro
**O webhook é a fonte prioritária de confirmação de pagamento. O verify é fallback de convergência, não substituto do webhook.**

## 5. Telas envolvidas
- Confirmação pública (`Confirmation.tsx`)
- Ticket lookup (`TicketLookup.tsx`)
- Diagnóstico administrativo (`SalesDiagnostic.tsx`)

## 6. Fluxo atual
1. Webhook recebe evento Asaas.
2. Valida referência SmartBus, ambiente da venda e token por ambiente.
3. Deduplica por `asaas_event_id`.
4. Para evento/status confirmatório, finaliza venda/tickets via `finalizeConfirmedPayment`.
5. Para eventos não confirmatórios, atualiza status gateway/logs conforme regra.
6. Verify consulta status on-demand e converge quando necessário.

## 7. Regras confirmadas pelo código
- Webhook rejeita contexto sem `payment_environment` válido da venda.
- Evento duplicado é ignorado com registro de duplicidade.
- Token inválido no webhook gera rejeição explícita.
- Verify registra warning quando confirma sem webhook correlacionado.
- Finalização de pagamento é idempotente para evitar ticket duplicado.

## 8. O que este PRD NÃO cobre
- Não define contrato de retentativa do Asaas (além do comportamento já observado).
- Não define novo modelo antifraude.
- Não cria regra nova de reversão financeira.
- Não substitui playbooks internos de incidentes fora do escopo de pagamento.

## 9. Cenários de falha e ação esperada
| Cenário | Sintoma | Comportamento atual | Risco financeiro/operacional | Ação esperada | Onde investigar |
|---|---|---|---|---|---|
| Webhook não recebido | Venda não muda para paga | Verify pode confirmar como fallback | Atraso de emissão/atendimento | Rodar verify e registrar incidente de ausência webhook | `sale_integration_logs` (incoming_webhook/manual_sync) |
| Webhook duplicado | Mesmo evento chega várias vezes | Deduplicação ignora reprocesso | Baixo (se dedup íntegro) | Confirmar `duplicate_count` e manter monitoramento | `asaas_webhook_event_dedup` |
| Token inválido | Webhook retorna não autorizado | Evento rejeitado | Falha de convergência | Corrigir segredo/token de ambiente | secrets + logs webhook |
| Venda não encontrada | Evento sem vínculo válido | Webhook ignora com log | Médio (pagamento sem correlação) | Validar `externalReference` e origem da cobrança | payload webhook + `sales` |
| Evento fora do escopo SmartBus | externalReference inválida | Ignorado com 200 e rastreio | Baixo para fluxo interno | Sem ação de cobrança interna; manter rastreio | logs webhook |
| Ambiente da venda ausente | Rejeição por contexto | Fail-closed (não processa) | Alto (pagamento não converge) | Corrigir venda sem ambiente e revisar origem | `sales.payment_environment` |
| Gateway confirma, mas venda não muda para paga | Divergência status | Diagnóstico sinaliza inconsistência | Alto | Forçar verify/reconcile e investigar finalização | `/admin/vendas/diagnostico`, logs |
| Venda paga, mas ticket não gerado | Cliente sem ticket após pagamento | Estado inconsistente registrado | Alto operacional | Executar reconciliação e escalar dev se persistir | `reconcile-sale-payment`, logs ticket |
| Reversão financeira/chargeback/estorno | Venda já paga sofre reversão | Fluxo registra risco; parte das ações é manual | Alto financeiro | Seguir trilha operacional e escalar financeiro/dev | verify + logs operacionais |

## 10. Riscos identificados
- Dependência de dados corretos de `externalReference` e ambiente.
- Convergência pode atrasar sem webhook saudável.
- Reversão financeira ainda exige ação manual em cenários críticos.

## 11. Dúvidas pendentes
### Produto
- Política oficial de UX quando pagamento confirmado não gera ticket imediatamente: **não identificado no código atual**.

### Financeira
- Processo end-to-end para chargeback com rollback de repasse: **não identificado no código atual**.

### Técnica
- Estratégia formal de dead-letter/reprocessamento interno: **não identificado no código atual**.

### Operacional
- SLA de escalonamento por tipo de incidente de webhook: **não identificado no código atual**.

## 12. Melhorias futuras (sem implementação nesta tarefa)
### Documentação
- Matriz de eventos Asaas tratados x ignorados com exemplos reais.

### Produto
- Mensagens operacionais de divergência mais guiadas no admin.

### Suporte
- Playbook curto para convergência webhook x verify.

### Segurança
- Rotina de rotação segura de token webhook por ambiente.

### Operação
- Alertas de incidentes críticos (`ticket_generation_incomplete`, `payment_environment_unresolved`).

### Código
- Consolidar ainda mais telemetria de confirmação entre webhook e verify.
