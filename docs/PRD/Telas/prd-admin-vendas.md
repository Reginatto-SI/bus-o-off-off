# PRD — Tela `/admin/vendas` (Operação de vendas)

## 1. Objetivo
Fornecer operação administrativa de vendas com visão consolidada, filtros, auditoria de detalhes, ações de status/cancelamento/edição de passageiro e suporte ao fluxo de taxa da plataforma.

## 2. Contexto no sistema
- **Venda:** leitura e manutenção operacional de `sales` e dados associados.
- **Pagamento:** consulta/convergência por `verify-payment-status` em pontos de taxa e status operacional.
- **Empresa:** toda leitura/ação condicionada à empresa ativa do usuário (`activeCompanyId`).
- **Usuário:** usa permissões do contexto de autenticação (ex.: gerente para ações críticas).

## 3. Fluxo REAL da tela
1. Carrega vendas por empresa ativa com paginação, filtros e ordenação padrão (`created_at desc`).
2. Busca complementar para filtro textual via `tickets` (passageiro/CPF) e `events` (nome), convertendo para `sale_id/event_id`.
3. Aplica filtros: status, risco de reserva, evento, vendedor e intervalo de datas.
4. Para linhas carregadas, busca dados auxiliares (`tickets` para assentos/números; `event_boarding_locations`; `seat_locks` para expiração operacional).
5. Exibe KPIs e alertas de risco (reservas próximas/vencidas) com resumo global.
6. Permite abrir detalhes da venda com histórico (`sale_logs`) e dados técnicos (`payment_environment`, `platform_fee_*`).
7. Ações principais: nova venda manual, alteração de status, cancelamento, edição de passageiro por RPC, operações de taxa da plataforma e exportações.

## 4. Regras de negócio (CRÍTICO)
- Escopo multiempresa obrigatório: consultas usam `company_id=activeCompanyId`.
- Risco de reserva usa `reservation_expires_at` (reserva manual) e não inferência por `created_at`.
- Para `pendente_pagamento`, sinal operacional de expiração depende de `seat_locks.expires_at`.
- Edição de passageiro bloqueia quando venda cancelada, status não permitido ou ticket já embarcado.
- Cancelamento bloqueia quando já há passageiro embarcado.
- Alterar para `pago` depende de regra de taxa da plataforma (`platform_fee_status='paid'`), com bloqueio explícito quando pendente.
- Cancelamento não implementa estorno automático de gateway (apenas cancela no sistema e registra log).

## 5. Integrações envolvidas
- **Supabase tabelas:** `sales`, `tickets`, `sale_logs`, `event_boarding_locations`, `seat_locks`, `events`, `sellers`, `event_fees`, `commercial_partners`, `event_sponsors`.
- **RPC:** `correct_sale_passenger`.
- **Edge function:** `verify-payment-status` (convergência/fallback em operações de taxa).
- **Libs:** `startPlatformFeeCheckout`, `calculateFees`, `resolveTicketPurchaseConfirmedAt`.

## 6. Estados possíveis
- **Carregando listagem:** `loading=true`.
- **Lista com dados:** tabela + KPIs + filtros.
- **Lista vazia:** estado vazio operacional.
- **Modal de detalhe:** venda completa com histórico e ações contextuais.
- **Modal de nova venda:** fluxo administrativo dedicado.
- **Ações pendentes:** cancelando, alterando status, editando passageiro, consultando taxa.

## 7. Cenários de falha
| Cenário | Impacto | Ação esperada |
|---|---|---|
| Falha em `sales` query | Tabela sem dados | Toast “Erro ao carregar vendas” |
| Falha em `correct_sale_passenger` | Edição não persistida | Toast de erro com mensagem da RPC |
| Tentativa de cancelar com embarque realizado | Integridade operacional em risco | Bloqueio com toast e sem update |
| Tentativa de marcar pago com taxa pendente | Divergência financeira | Bloqueio com toast explícito |
| Falha em `verify-payment-status` | Status/taxa não convergem na hora | Toast orientando nova tentativa |
| Falha ao cancelar venda | Status permanece inalterado | Toast de erro e sem limpeza local |

## 8. Riscos operacionais
- Alta densidade de ações críticas na mesma tela aumenta risco de operação equivocada.
- Dependência de processos assíncronos de cleanup/convergência pode manter status “atrasado” temporariamente.
- Cancelamento sem estorno automático exige disciplina operacional externa ao sistema.

## 9. Logs e diagnóstico
- **Tabela de auditoria:** `sale_logs` é trilha principal de mudanças de status/cancelamento.
- **Campos técnicos no detalhe:** `platform_fee_payment_id`, `platform_fee_status`, `payment_environment`.
- **Console/toasts:** mensagens explícitas para falhas de edição, status, taxa e carga de dados.
- **Investigação de pendências:** cruzar `sales.status` com `seat_locks.expires_at` e `reservation_expires_at`.

## 10. Dúvidas pendentes
- SLA automático para cleanup de vendas pendentes com lock expirado: **não identificado no código atual**.
- Fluxo padronizado de reconciliação financeira pós-cancelamento no gateway: **não identificado no código atual**.
