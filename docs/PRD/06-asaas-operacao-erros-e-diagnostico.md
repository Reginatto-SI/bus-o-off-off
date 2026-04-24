# 06 — PRD Asaas: Operação, Erros e Diagnóstico

## 1. Objetivo
Consolidar o modo operacional de investigação de falhas Asaas por venda, empresa e ambiente, com linguagem orientada a suporte.

## 2. Contexto
A plataforma registra trilha operacional/técnica em banco e oferece telas de diagnóstico para reduzir tempo de resolução de incidentes.

## 3. Classificação
- **Criticidade:** Suporte / Operação
- **Público principal:** Suporte, Operação, Desenvolvimento
- **Telas impactadas:** `/admin/vendas/diagnostico`, `/admin/empresa`, `/confirmacao/:id`
- **Risco se quebrar:** aumento de MTTR, incidentes sem causa raiz, decisão operacional incorreta
- **Origem da regra:** `sale_logs`, `sale_integration_logs`, `asaas_webhook_event_dedup`, páginas de diagnóstico

## 4. Regra de ouro
**Toda falha de pagamento deve ser investigável por venda, empresa, ambiente, cobrança Asaas e logs de integração.**

## 5. Telas e fontes de investigação
- Primeira triagem: `/admin/vendas/diagnostico`
- Configuração da empresa: `/admin/empresa` (pagamentos + diagnóstico)
- Evidência técnica: `sale_integration_logs`
- Evidência operacional: `sale_logs`
- Deduplicação webhook: `asaas_webhook_event_dedup`

## 6. Regras confirmadas pelo código
- Logs estruturados existem para create/webhook/verify.
- Deduplicação formal existe para webhook por `asaas_event_id`.
- Verify registra warnings e incidentes quando confirmação não segue trilha esperada.
- Reconciliação (`reconcile-sale-payment`) existe para cenário pago sem ticket.

## 7. O que este PRD NÃO cobre
- Não define SLA corporativo oficial de atendimento.
- Não substitui política financeira de reembolso.
- Não autoriza manipulação manual de dados sem procedimento aprovado.
- Não define nova arquitetura de observabilidade.

## 8. Cenários de falha e ação esperada
| Cenário | Sintoma | Comportamento atual | Risco | Ação esperada | Onde investigar |
|---|---|---|---|---|---|
| Falha de comunicação com Asaas | Verify/create com erro | Retorno degradado em alguns casos | Médio/alto | Repetir consulta e validar integração | logs edge + check integração |
| Venda sem `payment_environment` | Diagnóstico aponta inconsistência | Fluxos críticos podem rejeitar processamento | Alto | Corrigir origem da venda e rastrear incidente | `sales`, `sale_integration_logs` |
| Venda sem `asaas_payment_id` | Pendência sem cobrança vinculada | Verify pode ignorar sem consulta externa | Alto | Auditar criação da cobrança e decidir reprocesso | logs create + diagnóstico |
| Gateway pago x venda não paga | Divergência operacional | Necessita convergência (verify/reconcile) | Alto | Executar triagem e escalar se persistir | SalesDiagnostic + verify |
| Venda paga sem ticket | Cliente sem emissão | Estado inconsistente registrado | Alto | Rodar reconciliação e abrir incidente dev | `reconcile-sale-payment` + logs |
| Split aparentemente incorreto | Queixa financeira | Requer conciliação entre split/snapshot/ledger | Alto financeiro | Revisar percentuais/wallets/ledger | PRD 04 + logs + DB |
| Ambiente aparentemente errado | Erros em ambiente oposto | Falhas de autenticação/integração | Médio | Confirmar ambiente ativo e campos corretos | hook env + `companies.asaas_*` |

## 9. Roteiro rápido de suporte
### 9.1 Venda não confirmou pagamento
- **Primeira tela:** `/admin/vendas/diagnostico`
- **Campos principais:** `status`, `asaas_payment_status`, `payment_environment`, `asaas_payment_id`
- **Logs principais:** `sale_integration_logs` (webhook/verify)
- **Provável causa:** webhook ausente/erro de contexto/integração
- **Escalar para dev quando:** houver divergência persistente após verify

### 9.2 Pagamento confirmado, mas ticket não apareceu
- **Primeira tela:** `/admin/vendas/diagnostico`
- **Campos principais:** status pago + contagem de tickets
- **Logs principais:** incidentes de finalização/ticket
- **Provável causa:** falha parcial de finalização
- **Escalar para dev quando:** reconciliação não resolver

### 9.3 Cliente pagou, mas admin não vê como pago
- **Primeira tela:** `/admin/vendas/diagnostico`
- **Campos principais:** `asaas_payment_status` vs `sales.status`
- **Logs principais:** incoming webhook + manual sync
- **Provável causa:** atraso/erro de convergência
- **Escalar para dev quando:** status continuar divergente após verify

### 9.4 Split parece incorreto
- **Primeira tela:** `/admin/empresa` + diagnóstico da venda
- **Campos principais:** taxas empresa, wallets, snapshot financeiro, ledger
- **Logs principais:** create/verify/webhook com eventos de split
- **Provável causa:** configuração inválida ou elegibilidade de recebedor
- **Escalar para dev quando:** cálculo persistido divergir sem explicação operacional

### 9.5 Ambiente sandbox/produção parece errado
- **Primeira tela:** `/admin/empresa`
- **Campos principais:** ambiente ativo, credenciais do ambiente, `payment_environment` da venda
- **Logs principais:** decision trace em logs de integração
- **Provável causa:** configuração no ambiente oposto ou fallback indevido
- **Escalar para dev quando:** ambiente ativo divergir do persistido sem causa clara

### 9.6 Representante não recebeu comissão
- **Primeira tela:** `/representante/painel`
- **Campos principais:** `representative_commissions.status`, `blocked_reason`, wallet
- **Logs principais:** eventos `split_representative_*`
- **Provável causa:** representante inelegível ou wallet ausente
- **Escalar para dev quando:** comissão não for gerada mesmo com venda paga e representante elegível

### 9.7 Empresa não consegue vender por erro de Asaas
- **Primeira tela:** `/admin/empresa` (pagamentos)
- **Campos principais:** API key, wallet, onboarding, Pix readiness
- **Logs principais:** erros de `create-asaas-payment`
- **Provável causa:** integração incompleta por ambiente
- **Escalar para dev quando:** diagnóstico indicar válido, mas checkout seguir falhando

## 10. Riscos identificados
- Risco de interpretação incorreta sem consulta de logs técnicos.
- Risco de tratar sintoma sem causa raiz quando suporte não cruza ambiente + cobrança + logs.

## 11. Dúvidas pendentes
### Produto
- Política de comunicação padrão para cliente em divergência: **não identificado no código atual**.

### Financeira
- Fluxo oficial para tratamento de reversões com repasse já efetuado: **não identificado no código atual**.

### Técnica
- Métricas de observabilidade obrigatórias por incidente: **não identificado no código atual**.

### Operacional
- SLA formal de escalonamento N1 -> N2 -> Dev: **não identificado no código atual**.

## 12. Melhorias futuras (sem implementação nesta tarefa)
### Documentação
- Versão resumida de bolso para suporte (1 página).

### Produto
- Mensagens de estado com linguagem operacional no admin.

### Suporte
- Treinamento por cenários mais recorrentes.

### Segurança
- Revisão de exposição de dados sensíveis em logs de suporte.

### Operação
- Painel de alertas proativos por incidente crítico.

### Código
- Melhoria incremental da correlação automática entre incidentes e venda/empresa.
