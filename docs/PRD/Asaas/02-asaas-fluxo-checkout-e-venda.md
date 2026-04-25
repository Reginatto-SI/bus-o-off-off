# 02 — PRD Asaas: Fluxo de Checkout e Venda

## 1. Objetivo
Documentar o nascimento da venda e da cobrança Asaas no fluxo atual (checkout público e variações administrativas), com foco operacional para prevenção de inconsistências.

## 2. Contexto
Checkout cria venda, registra snapshot financeiro de passageiros e solicita criação de cobrança ao Asaas. A confirmação ocorre depois por webhook/verify.

## 3. Classificação
- **Criticidade:** Crítica
- **Público principal:** Produto, Suporte, Desenvolvimento
- **Telas impactadas:** `/checkout/:id`, `/confirmacao/:id`, modal venda manual
- **Risco se quebrar:** venda sem cobrança, cobrança sem vínculo, status incoerente
- **Origem da regra:** `Checkout.tsx`, `create-asaas-payment`, `Confirmation.tsx`, `NewSaleModal.tsx`

## 4. Regra de ouro
**Nenhuma venda online deve ser tratada como paga no sistema sem confirmação válida de pagamento e vínculo claro com a cobrança Asaas.**

## 5. Telas envolvidas
- Checkout público (`src/pages/public/Checkout.tsx`)
- Confirmação pública (`src/pages/public/Confirmation.tsx`)
- Ticket lookup (`src/pages/public/TicketLookup.tsx`)
- Venda manual (`src/components/admin/NewSaleModal.tsx`)

## 6. Fluxo atual
1. Checkout valida comprador/assentos e cria `seat_locks`.
2. Cria `sales` com `status` inicial, `payment_method` e `payment_environment`.
3. Cria `sale_passengers` (snapshot por passageiro).
4. Invoca `create-asaas-payment`.
5. Edge valida venda/empresa/ambiente/split e cria cobrança no Asaas (`externalReference = sale.id`).
6. Edge persiste `asaas_payment_id` e `asaas_payment_status`.
7. Frontend redireciona para confirmação e mantém fallback de reabertura/verify.

## 7. Regras confirmadas pelo código
- `create-asaas-payment` exige status elegível (`reservado`/`pendente_pagamento`).
- Ambiente explícito é validado e persistido antes da cobrança, com bloqueio em mismatch.
- Criação de cobrança inclui split e descrição padrão da venda.
- Em erro genérico de criação de cobrança no checkout público, existe rollback de dados transitórios.

## 8. O que este PRD NÃO cobre
- Não define novas regras de UX de checkout.
- Não define estratégia de antifraude além do que já existe.
- Não define política de reembolso/chargeback.
- Não altera contratos de API atuais.

## 9. Cenários de falha e ação esperada
| Cenário | Sintoma | Comportamento atual identificado | Risco | Ação esperada (suporte/sistema) | Onde investigar |
|---|---|---|---|---|---|
| Falha ao criar cobrança Asaas | Checkout não gera link | Retorna erro; em casos genéricos, rollback da venda transitória | Perda de conversão | Validar erro retornado e tentar novamente após correção de causa | `create-asaas-payment`, `sale_integration_logs` |
| Empresa sem integração configurada | Sem link Asaas | Pode retornar `no_asaas_account` e seguir para confirmação sem cobrança | Venda pendente sem pagamento | Orientar empresa a configurar integração e revalidar no admin | `/admin/empresa`, `companies.asaas_*` |
| Ambiente não resolvido | Erro de criação | Fluxo falha com `payment_environment_unresolved` | Venda órfã de contexto | Corrigir ambiente persistido e origem do ambiente no frontend | `sales.payment_environment`, hook runtime env |
| Pix indisponível | Erro ao pagar via Pix | Bloqueio por `pix_not_ready` | Conversão reduzida | Tentar cartão e revisar readiness Pix da empresa | `companies.asaas_pix_ready_*`, check integração |
| Split inválido | Erro na criação | Edge retorna erro de split (`split_resolution_failed` etc.) | Início de pagamento bloqueado | Corrigir wallet/plano de split da empresa/sócio | `socios_split`, wallets, logs da edge |
| Usuário chegou à confirmação sem link | Tela de confirmação sem fatura | Fluxo usa fallback e botão de reabrir quando possível | Suporte acionado por “não consigo pagar” | Tentar reabrir via função específica e validar `asaas_payment_id` | `get-asaas-payment-link`, confirmação |
| Venda criada sem `asaas_payment_id` | Venda pendente sem cobrança vinculada | Verify pode ignorar por ausência de cobrança | Divergência operacional | Revisar logs de criação, identificar rollback/falha e decidir ação manual | `sales`, `sale_integration_logs`, diagnóstico admin |

## 10. Riscos identificados
- Cenários de fallback podem manter venda pendente sem clareza imediata ao usuário.
- Falha entre criação de venda e criação de cobrança exige boa trilha de auditoria.

## 11. Dúvidas pendentes
### Produto
- Política oficial para expiração/comunicação ao cliente quando checkout fica sem cobrança: **não identificado no código atual**.

### Financeira
- Regra formal para tratamento de vendas criadas sem cobrança e sem pagamento: **não identificado no código atual**.

### Técnica
- Estratégia padronizada de retry transversal por tenant: **não identificado no código atual**.

### Operacional
- Critério de atendimento para reprocessar venda pendente sem `asaas_payment_id`: **não identificado no código atual**.

## 12. Melhorias futuras (sem implementação nesta tarefa)
### Documentação
- Padronizar matriz de erro x ação para suporte N1/N2.

### Produto
- Melhorar comunicação de estados pendentes sem link.

### Suporte
- Checklist operacional para venda sem cobrança vinculada.

### Segurança
- Revisar mensagens para não expor detalhe sensível de integração.

### Operação
- Alertar automaticamente para vendas pendentes sem `asaas_payment_id`.

### Código
- Revisar pontos de rollback para manter trilha ainda mais explícita em incidentes.
