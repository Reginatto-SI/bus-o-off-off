# Análise 15 — Reconciliação manual de venda paga via migration (emergencial)

## Contexto

- Venda alvo: `351151a0-dfb3-4aa8-ae88-40eccaea2f57`
- `platform_fee_payment_id`: `pay_eztv82mobz5o01hb`
- Ambiente: produção
- Cenário: pagamento confirmado fora do sistema e sem convergência automática por webhook/verify.

## Mudança aplicada

Foi criada uma migration SQL pontual, com filtro estrito por `id`, sem lógica dinâmica e sem tocar em outras entidades.

Arquivo de migration criado:

- `supabase/migrations/20261106110000_manual_reconcile_sale_351151a0.sql`

SQL aplicado:

```sql
-- Reconciliação manual de venda paga (emergencial)
-- Motivo: falha de webhook / convergência
-- Data: 2026-04-25

UPDATE sales
SET
  status = 'pago',
  platform_fee_status = 'paid',
  asaas_payment_status = 'CONFIRMED',
  updated_at = now()
WHERE id = '351151a0-dfb3-4aa8-ae88-40eccaea2f57';
```

## Garantias de escopo

- Não altera outras vendas (filtro por UUID único).
- Não altera estrutura de tabela.
- Não altera split, comissão, tickets ou funções.
- Ajuste emergencial e não reutilizável como padrão operacional.
