-- Cartão de crédito PagBank (Sandbox): operação aditiva e uma única cobrança PagBank por venda.
ALTER TABLE public.payment_attempts DROP CONSTRAINT IF EXISTS payment_attempts_operation_check;
ALTER TABLE public.payment_attempts ADD CONSTRAINT payment_attempts_operation_check
  CHECK (operation IN ('create_pix', 'create_credit_card'));
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_one_pagbank_per_sale
  ON public.payment_attempts (sale_id) WHERE gateway = 'pagbank';
ALTER TABLE public.payment_attempts ADD COLUMN IF NOT EXISTS card_last_digits text
  CHECK (card_last_digits IS NULL OR card_last_digits ~ '^[0-9]{4}$');
ALTER TABLE public.payment_attempts ADD COLUMN IF NOT EXISTS card_brand text;
ALTER TABLE public.payment_attempts ADD COLUMN IF NOT EXISTS split_status text
  CHECK (split_status IS NULL OR split_status IN ('confirmed', 'accepted_unverified', 'not_expected'));