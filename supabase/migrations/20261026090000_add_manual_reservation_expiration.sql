-- Step 2: reservas manuais do administrativo não usam o TTL técnico do checkout público.
-- Criamos uma validade explícita na própria venda para separar reserva humana de
-- `pendente_pagamento`, evitando reservas eternas sem cancelar cegamente o fluxo público.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS reservation_expires_at timestamptz;

COMMENT ON COLUMN public.sales.reservation_expires_at IS
  'Validade explícita de reservas manuais administrativas em status reservado. Não substitui seat_locks do checkout público.';

-- Backfill conservador:
-- 1) reservas administrativas já existentes ganham validade;
-- 2) linhas muito antigas recebem pelo menos 24h de carência a partir da migration,
--    evitando cancelamento imediato e cego de operações que ainda podem estar em acompanhamento humano.
UPDATE public.sales
SET reservation_expires_at = GREATEST(created_at + interval '72 hours', now() + interval '24 hours')
WHERE status = 'reservado'
  AND reservation_expires_at IS NULL
  AND sale_origin IN ('admin_manual');
