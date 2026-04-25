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
