-- Registra o instante em que o sistema confirmou a venda como paga (fonte: webhook/polling).
-- Importante: este campo NÃO representa criação de venda nem reserva.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz;

COMMENT ON COLUMN public.sales.payment_confirmed_at IS
  'Data/hora em que o sistema confirmou o pagamento da venda (ex.: confirmação Asaas via webhook/verify-payment-status).';
