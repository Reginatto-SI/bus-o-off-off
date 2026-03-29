# Blindagem backend — impedir novos `waived` em venda manual abaixo do mínimo

## Objetivo
Aplicar defesa em profundidade no backend para impedir que chamadas indiretas/legadas continuem gerando `platform_fee_status = 'waived'` quando a taxa da plataforma for menor que R$ 5,00.

## O que foi alterado
- Arquivo: `supabase/functions/create-platform-fee-checkout/index.ts`.
- Mudança no ramo `feeAmount < ASAAS_MIN_CHARGE`:
  - remove a atualização automática para `platform_fee_status = 'waived'`;
  - registra log auditável `platform_fee_minimum_blocked` em `sale_logs`;
  - retorna erro explícito `422` com `error_code = platform_fee_below_minimum`.

## Motivação técnica
- O frontend em `/admin/vendas` já bloqueia a origem desse cenário.
- Esta mudança adiciona blindagem no backend para evitar que fluxos fora do caminho esperado voltem a gerar `waived` como comportamento normal.

## Compatibilidade preservada
- Dados históricos com `platform_fee_status = 'waived'` não são alterados.
- Nenhuma migração estrutural foi aplicada.
- Checkout público e outros fluxos não foram alterados.

## Validação executada
1. Fluxo válido (taxa >= R$ 5,00): ramo de criação de cobrança permanece inalterado.
2. Fluxo inválido indireto (taxa < R$ 5,00): backend não marca `waived` e responde com erro explícito + log de bloqueio.
3. Histórico `waived`: sem alteração de leitura/esquema.

## Risco residual
- Chamadas antigas que esperavam `waived` automático agora recebem erro `422` (comportamento intencional para alinhar com a nova regra oficial).
