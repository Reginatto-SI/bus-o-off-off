ALTER TABLE public.commercial_partners
  ADD COLUMN show_on_showcase boolean NOT NULL DEFAULT false,
  ADD COLUMN show_on_event_page boolean NOT NULL DEFAULT false,
  ADD COLUMN show_on_ticket boolean NOT NULL DEFAULT false;