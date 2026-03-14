-- Pacote 2 (rastreabilidade mínima): reforça evidência do aceite comercial da taxa por evento.
alter table public.events
  add column if not exists platform_fee_terms_version text null,
  add column if not exists platform_fee_terms_accepted_by uuid null references auth.users(id);

comment on column public.events.platform_fee_terms_version is
  'Versão textual do termo de taxa da plataforma aceito pela organizadora.';

comment on column public.events.platform_fee_terms_accepted_by is
  'Usuário autenticado responsável pelo aceite do termo de taxa da plataforma no evento.';
