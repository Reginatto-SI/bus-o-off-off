ALTER TABLE public.vehicles
  ADD COLUMN owner TEXT,
  ADD COLUMN brand TEXT,
  ADD COLUMN model TEXT,
  ADD COLUMN year_model INTEGER,
  ADD COLUMN chassis TEXT,
  ADD COLUMN renavam TEXT,
  ADD COLUMN color TEXT,
  ADD COLUMN whatsapp_group_link TEXT,
  ADD COLUMN notes TEXT,
  ADD COLUMN status seller_status NOT NULL DEFAULT 'ativo';
