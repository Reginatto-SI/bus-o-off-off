# 01 — PRD Asaas: Visão Geral da Integração

## 1. Objetivo
Consolidar a visão macro da integração Asaas no SmartBus BR, descrevendo como o gateway participa do ciclo de venda, confirmação e auditoria no estado **atual do código**.

## 2. Contexto
O SmartBus BR opera com gateway Asaas para cobranças online, com isolamento por empresa e ambiente (sandbox/produção), logs de integração e deduplicação de webhook.

## 3. Classificação
- **Criticidade:** Crítica
- **Público principal:** Produto, Suporte, Desenvolvimento, Financeiro, Auditoria
- **Telas impactadas:** `/checkout/:id`, `/confirmacao/:id`, `/admin/empresa`, `/admin/vendas/diagnostico`, `/representante/painel`
- **Risco se quebrar:** venda não confirma, ticket não gera, divergência financeira e operacional
- **Origem da regra:** código atual (edge functions, frontend, migrations) + diretrizes operacionais já documentadas no projeto

## 4. Regra de ouro
**O Asaas é o gateway oficial do SmartBus BR. Toda venda online deve seguir fluxo único, previsível, auditável e isolado por empresa e ambiente.**

## 5. Telas envolvidas
- Checkout público (`Checkout.tsx`)
- Confirmação pública (`Confirmation.tsx`)
- Ticket lookup público (`TicketLookup.tsx`)
- Admin empresa/pagamentos (`Company.tsx` + wizard/painel diagnóstico)
- Admin vendas diagnóstico (`SalesDiagnostic.tsx`)
- Painel representante (`RepresentativeDashboard.tsx`)

## 6. Fluxo atual (macro)
1. Venda nasce com `payment_environment` e status inicial no banco.
2. `create-asaas-payment` cria cobrança Asaas e salva `asaas_payment_id` + status.
3. Webhook (`asaas-webhook`) é fonte prioritária de confirmação.
4. `verify-payment-status` é fallback de convergência operacional.
5. Finalização compartilhada (`finalizeConfirmedPayment`) consolida status e tickets.
6. Operação usa `sale_logs`, `sale_integration_logs` e `asaas_webhook_event_dedup` para auditoria.

## 7. Regras de negócio identificadas (confirmadas no código)
- Ambiente de pagamento precisa ser explícito e coerente.
- `externalReference` da cobrança é usado como vínculo com a venda.
- Webhook possui validação de token e deduplicação por evento.
- Fluxo de confirmação usa finalização idempotente para evitar duplicidade de tickets.
- Split financeiro é resolvido em helper central para plataforma/sócio/representante.

## 8. O que este PRD NÃO cobre
- Não define nova política de reembolso.
- Não altera regra de split/comissão.
- Não substitui documentação oficial do Asaas.
- Não autoriza mudança de código sem nova tarefa.

## 9. Cenários de falha e ação esperada
| Cenário | Sintoma | Comportamento atual identificado | Risco | Ação esperada | Onde investigar |
|---|---|---|---|---|---|
| Ambiente não resolvido | Erro de criação/verify/webhook | Fluxo falha com `payment_environment_unresolved` | Venda travada ou sem rastreio | Validar ambiente persistido na venda e configuração da empresa | `sales.payment_environment`, logs da edge |
| Webhook não converge | Venda fica pendente | Verify pode confirmar como fallback | Atraso operacional | Rodar verify e revisar incidentes/logs | `/confirmacao`, `/admin/vendas/diagnostico`, `sale_integration_logs` |
| Split inconsistente | Divergência financeira | Erros de split bloqueiam parte dos fluxos | Repasse incorreto | Verificar parâmetros de split e wallets | `companies`, `socios_split`, resolvedor de split |
| Configuração incompleta da empresa | Falha em cobrança | Bloqueio por API key/wallet/Pix readiness | Empresa sem venda online | Revalidar integração no admin | `/admin/empresa`, `check-asaas-integration` |

## 10. Riscos identificados
- Dependência de configuração por ambiente por empresa.
- Dependência de webhook para convergência rápida.
- Reversões financeiras críticas ainda exigem tratativa operacional.

## 11. Dúvidas pendentes
### Produto
- SLA formal para tratar venda pendente sem webhook: **não identificado no código atual**.

### Financeira
- Fluxo automatizado de rollback de split em estorno/chargeback: **não identificado no código atual**.

### Técnica
- Uso residual de helpers legados encontrados, mas sem uso confirmado em runtime: **não identificado no código atual**.

### Operacional
- Nível de alertamento automático para incidentes críticos: **não identificado no código atual**.

## 12. Melhorias futuras (sem implementação nesta tarefa)
### Documentação
- Manter changelog de decisões por versão dos PRDs.

### Produto
- Definir política explícita de exceções de confirmação tardia.

### Suporte
- Criar playbook com SLA por tipo de incidente.

### Segurança
- Revisar governança de acesso a credenciais por tenant.

### Operação
- Alertas automáticos por incident code crítico.

### Código
- Consolidar pontos com duplicidade semântica/legado ainda existentes.
