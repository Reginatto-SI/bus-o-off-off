ALTER TABLE public.companies ALTER COLUMN platform_fee_percent SET DEFAULT 6;
ALTER TABLE public.companies ALTER COLUMN socio_split_percent SET DEFAULT 0;
UPDATE public.companies SET platform_fee_percent = 6, socio_split_percent = 0;