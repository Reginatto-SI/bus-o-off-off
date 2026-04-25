# Implementação Step 01 — Comissão de representante = 1/3 da taxa da plataforma

Data: 2026-04-11 (UTC)
Escopo: implementação mínima e segura, sem fluxo paralelo

## Resumo do que foi alterado

1. A regra operacional de comissão do representante deixou de depender de `representatives.commission_percent` nos pontos críticos.
2. O split de representante agora calcula percentual por `ROUND(platform_fee_percent / 3, 2)`.
3. A função SQL de ledger (`upsert_representative_commission_for_sale`) agora calcula o percentual pela taxa da plataforma da empresa da venda e aplica arredondamento oficial de 2 casas.
4. O painel `/representante/painel` ganhou bloco explicativo da regra e a exibição de percentual passou a 2 casas.

## Arquivos alterados

- `supabase/functions/_shared/split-recipients-resolver.ts`
- `supabase/migrations/20260411170000_update_representative_commission_one_third_platform_fee.sql`
- `src/pages/representative/RepresentativeDashboard.tsx`

## Regra aplicada

- Percentual do representante: `ROUND(platform_fee_percent / 3, 2)`
- Valor monetário da comissão: `ROUND(base_amount * (commission_percent / 100), 2)`
- Painel exibe percentual com 2 casas decimais.

## Decisões adotadas

- Mantido o fluxo atual create/verify/webhook/finalização (sem criar pipeline novo).
- Mantido status do ledger (`pendente`, `bloqueada`, `paga`, etc.) e validação de wallet.
- Mantido campo `representatives.commission_percent` no schema por compatibilidade, mas com comentário explícito de que não é mais a regra operacional principal.

## Checklist de validação

- [x] Split deixou de ler `representatives.commission_percent` como regra principal.
- [x] Split usa `1/3` da taxa da plataforma com 2 casas.
- [x] Ledger usa `1/3` da taxa da plataforma com 2 casas no percentual.
- [x] Ledger arredonda valor monetário em 2 casas.
- [x] Painel mostra explicação da nova regra.
- [x] Painel exibe percentual com 2 casas.
- [x] Não houve criação de fluxo paralelo.

## Observação operacional

- Como o sistema ainda não tem representantes operando em produção, a regra nova foi aplicada integralmente nos pontos funcionais críticos sem necessidade de transição histórica complexa.
