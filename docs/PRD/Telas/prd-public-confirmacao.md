# PRD — Tela `/confirmacao/:id` (Confirmação pública)

## 1. Objetivo
Exibir o estado real da venda após checkout (pago, aguardando, cancelado, reservado), permitir revalidação manual/automática do pagamento e disponibilizar passagem/comprovante conforme status final.

## 2. Contexto no sistema
- **Venda:** lê `sales` por `id`, atualiza visualmente conforme convergência de status.
- **Pagamento:** usa fallback oficial `verify-payment-status` e reabertura da cobrança existente por `get-asaas-payment-link`.
- **Empresa:** carrega identidade/contato (`companies`) para composição de comprovante/passagem.
- **Usuário:** fluxo público sem login; depende do link da venda.

## 3. Fluxo REAL da tela
1. Ao abrir, consulta `sales` (com `event`, `trip`, `boarding_location`) e `tickets` da venda.
2. Carrega dados complementares: empresa, parceiros/sponsors, horários de embarque e taxas do evento.
3. Se houver desconto de benefício na venda (`benefit_total_discount > 0`), não recompõe fee lines por `unit_price` para evitar inconsistência de exibição.
4. Renderiza cabeçalho por status (`pago`, aguardando confirmação, processamento com timeout, cancelado, reservado).
5. Se pendente (`pendente_pagamento` ou `reservado` com `?payment=success`), inicia polling a cada 3s por até 6 minutos.
6. Durante polling, chama periodicamente `verify-payment-status` (~30s) e consulta `sales.status`; ao virar `pago`, recarrega tickets.
7. Botão manual “Atualizar status do pagamento” chama `verify-payment-status` on-demand.
8. Quando aplicável, botão “Reabrir cobrança” chama `get-asaas-payment-link` sem recriar pagamento.
9. Em status final pago/cancelado, monta `TicketCardData` e exibe lista de passagens por passageiro.

## 4. Regras de negócio (CRÍTICO)
- Fonte de verdade do status é `sales.status`.
- Reabertura de cobrança só aparece quando venda está aguardando pagamento **e** já existe `asaas_payment_id`.
- Tela não recria cobrança; apenas consulta/reabre cobrança existente.
- Em `verify-payment-status` com retorno `pago`, tela atualiza status/tickets localmente.
- Em timeout de polling, não cancela venda automaticamente; apenas informa processamento e mantém ações manuais.

## 5. Integrações envolvidas
- **Supabase tabelas:** `sales`, `tickets`, `companies`, `event_boarding_locations`, `event_fees`, `commercial_partners`, `event_sponsors`, `seats`.
- **Edge functions:** `verify-payment-status`, `get-asaas-payment-link`.
- **Bibliotecas de regra/exibição:** `calculateFees`, `resolveTicketPurchaseConfirmedAt`, `resolveTicketPurchaseOriginLabel`, `getConfirmationResponsibilityText`.

## 6. Estados possíveis
- **Carregando:** `loading=true`.
- **Reserva não encontrada:** sem `sale`.
- **Pagamento confirmado:** `sale.status='pago'`.
- **Aguardando confirmação:** pendente com polling ativo.
- **Processamento com timeout:** pendente após 6 minutos.
- **Cancelado:** `sale.status='cancelado'`.
- **Reservado:** fallback de reserva sem confirmação de pagamento.

## 7. Cenários de falha
| Cenário | Impacto | Ação esperada |
|---|---|---|
| Falha em `verify-payment-status` | Status não converge na tela | Toast destrutivo no fluxo manual; polling segue tentando sem interromper tela |
| `get-asaas-payment-link` sem URL | Usuário sem atalho de cobrança | Toast com motivo específico (reason) e orientação de tentativa/contato |
| Pop-up bloqueado ao reabrir cobrança | Cobrança não abre | Toast pedindo revisão do bloqueador de pop-up |
| Venda sem tickets mesmo após pago | Experiência incompleta | Recarregar tickets na confirmação e manter dados da reserva visíveis |
| Polling expira sem pagamento | Incerteza operacional | Exibir estado “Pagamento em Processamento” + ações manuais |

## 8. Riscos operacionais
- Dependência de webhook/verify para convergência rápida para `pago`.
- Em pendências prolongadas, usuário pode interpretar como falha definitiva sem suporte.
- Divergência de fee display em vendas com benefício exige cautela (já mitigada zerando `feeLines` nesse caso).

## 9. Logs e diagnóstico
- Console: `[confirmation] verify-payment-status:start|finish`, logs de erro do polling, logs de reabertura de invoice.
- Banco: validar `sales.status`, `payment_confirmed_at`, `asaas_payment_id`, `tickets`.
- Edge: auditar respostas de `verify-payment-status` e `get-asaas-payment-link` por `sale_id`.

## 10. Dúvidas pendentes
- Política de retentativa automática após timeout de 6 minutos: **não identificado no código atual**.
- Estratégia de notificação assíncrona para usuário após sair da página: **não identificado no código atual**.
