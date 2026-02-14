
ALTER TABLE public.tickets
  ADD COLUMN qr_code_token text NOT NULL DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX idx_tickets_qr_code_token ON public.tickets (qr_code_token);
