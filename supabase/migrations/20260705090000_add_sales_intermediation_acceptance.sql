alter table public.sales
  add column if not exists intermediation_responsibility_accepted boolean not null default false,
  add column if not exists intermediation_responsibility_accepted_at timestamptz null;

comment on column public.sales.intermediation_responsibility_accepted is 'Aceite obrigatório do comprador sobre intermediação da Smartbus BR no checkout público.';
comment on column public.sales.intermediation_responsibility_accepted_at is 'Data/hora em que o comprador aceitou as responsabilidades da organizadora e o papel intermediador da plataforma.';
