-- Política de transporte por evento:
-- - eventos antigos ficam em trecho independente (compatibilidade retroativa)
-- - novos eventos passam a usar ida obrigatória + volta opcional (padrão comercial)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS transport_policy text;

UPDATE public.events
SET transport_policy = 'trecho_independente'
WHERE transport_policy IS NULL;

ALTER TABLE public.events
  ALTER COLUMN transport_policy SET DEFAULT 'ida_obrigatoria_volta_opcional';

ALTER TABLE public.events
  ALTER COLUMN transport_policy SET NOT NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_transport_policy_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_transport_policy_check
  CHECK (transport_policy IN (
    'trecho_independente',
    'ida_obrigatoria_volta_opcional',
    'ida_volta_obrigatorio'
  ));

COMMENT ON COLUMN public.events.transport_policy IS
  'Política comercial de transporte por evento: trecho independente, ida obrigatória com volta opcional, ou pacote ida+volta obrigatório';
