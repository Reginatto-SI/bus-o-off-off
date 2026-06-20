-- Link opcional do grupo de WhatsApp do evento.
-- Multi-tenant permanece protegido pelas políticas existentes de events via company_id.
alter table public.events
  add column if not exists whatsapp_group_link text;

comment on column public.events.whatsapp_group_link is
  'Link opcional do grupo de WhatsApp exibido apenas para compradores com venda confirmada/paga.';
