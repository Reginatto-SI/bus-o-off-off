create table if not exists public.event_ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  company_id uuid not null references public.companies(id),
  name text not null,
  price numeric not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_ticket_types_event_id on public.event_ticket_types(event_id);
create unique index if not exists uq_event_ticket_types_event_name on public.event_ticket_types(event_id, lower(name));

alter table public.event_ticket_types enable row level security;

create policy "Admins can manage event_ticket_types of their company"
on public.event_ticket_types
for all
to authenticated
using (is_admin(auth.uid()) and user_belongs_to_company(auth.uid(), company_id))
with check (is_admin(auth.uid()) and user_belongs_to_company(auth.uid(), company_id));

create policy "Users can view event_ticket_types of their company"
on public.event_ticket_types
for select
to authenticated
using (user_belongs_to_company(auth.uid(), company_id));

create policy "Public can view ticket types for public events"
on public.event_ticket_types
for select
to anon
using (exists (select 1 from public.events e where e.id = event_ticket_types.event_id and e.status = 'a_venda'));

create trigger update_event_ticket_types_updated_at
before update on public.event_ticket_types
for each row execute function public.update_updated_at_column();

alter table public.sale_passengers add column if not exists ticket_type_id uuid null;
alter table public.sale_passengers add column if not exists ticket_type_name text null;
alter table public.sale_passengers add column if not exists ticket_type_price numeric null;

alter table public.tickets add column if not exists ticket_type_id uuid null;
alter table public.tickets add column if not exists ticket_type_name text null;
alter table public.tickets add column if not exists ticket_type_price numeric null;
