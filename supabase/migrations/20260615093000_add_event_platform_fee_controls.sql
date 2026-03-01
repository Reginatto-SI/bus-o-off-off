-- Persistência da regra comercial de taxa da plataforma por evento.
alter table public.events
  add column if not exists pass_platform_fee_to_customer boolean not null default false,
  add column if not exists platform_fee_terms_accepted boolean not null default false,
  add column if not exists platform_fee_terms_accepted_at timestamptz null;

comment on column public.events.pass_platform_fee_to_customer is 'Quando true, cliente paga preço base + 6% da plataforma.';
comment on column public.events.platform_fee_terms_accepted is 'Aceite obrigatório dos termos da taxa para permitir publicação.';
comment on column public.events.platform_fee_terms_accepted_at is 'Data/hora do aceite da taxa da plataforma no evento.';
