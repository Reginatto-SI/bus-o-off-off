-- Programa de Benefício (base administrativa + preparação para checkout por passageiro/CPF)
-- Esta migration mantém o padrão multiempresa do projeto: company_id obrigatório + RLS estrito.

create table if not exists public.benefit_programs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  benefit_type text not null check (benefit_type in ('percentual', 'valor_fixo', 'preco_final')),
  benefit_value numeric(12,2) not null check (benefit_value >= 0),
  valid_from date,
  valid_until date,
  applies_to_all_events boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint benefit_programs_validity_chk check (
    valid_until is null or valid_from is null or valid_until >= valid_from
  )
);

comment on table public.benefit_programs is
  'Programas de benefício por empresa. A aplicação final ocorre por passageiro (CPF) no checkout.';

create index if not exists idx_benefit_programs_company_status
  on public.benefit_programs (company_id, status, created_at desc);
create index if not exists idx_benefit_programs_company_name
  on public.benefit_programs (company_id, name);

-- Índice de suporte para FK composta com company_id (evita cross-company por referência indireta).
create unique index if not exists uq_benefit_programs_id_company
  on public.benefit_programs (id, company_id);

create table if not exists public.benefit_program_eligible_cpf (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  benefit_program_id uuid not null references public.benefit_programs(id) on delete cascade,
  cpf text not null,
  full_name text,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  valid_from date,
  valid_until date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint benefit_program_eligible_cpf_digits_chk check (cpf ~ '^\d{11}$'),
  constraint benefit_program_eligible_cpf_validity_chk check (
    valid_until is null or valid_from is null or valid_until >= valid_from
  ),
  constraint benefit_program_eligible_cpf_company_match_fk
    foreign key (benefit_program_id, company_id)
    references public.benefit_programs(id, company_id)
    on delete cascade
);

comment on table public.benefit_program_eligible_cpf is
  'CPFs elegíveis por programa. Um CPF pode participar de múltiplos programas, mas sem duplicidade exata no mesmo programa.';

create unique index if not exists uq_benefit_program_eligible_cpf_program_cpf
  on public.benefit_program_eligible_cpf (benefit_program_id, cpf);
create index if not exists idx_benefit_program_eligible_cpf_company_status
  on public.benefit_program_eligible_cpf (company_id, status, cpf);

create table if not exists public.benefit_program_event_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  benefit_program_id uuid not null references public.benefit_programs(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint benefit_program_event_links_company_match_fk
    foreign key (benefit_program_id, company_id)
    references public.benefit_programs(id, company_id)
    on delete cascade
);

comment on table public.benefit_program_event_links is
  'Vínculo N:N entre programa e evento quando applies_to_all_events = false.';

create unique index if not exists uq_benefit_program_event_links_program_event
  on public.benefit_program_event_links (benefit_program_id, event_id);
create index if not exists idx_benefit_program_event_links_company_event
  on public.benefit_program_event_links (company_id, event_id);

-- Garante coerência multiempresa: event_id precisa pertencer à mesma company_id do vínculo.
create or replace function public.enforce_benefit_program_event_company_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_company_id uuid;
begin
  select e.company_id
    into v_event_company_id
  from public.events e
  where e.id = new.event_id;

  if v_event_company_id is null then
    raise exception 'Evento % não encontrado para vínculo de programa de benefício.', new.event_id;
  end if;

  if v_event_company_id <> new.company_id then
    raise exception 'Não é permitido vincular programa da empresa % ao evento de outra empresa %.', new.company_id, v_event_company_id;
  end if;

  return new;
end;
$$;

comment on function public.enforce_benefit_program_event_company_match() is
  'Valida que o vínculo programa-evento respeita a mesma company_id.';

drop trigger if exists benefit_program_event_links_company_match_trg on public.benefit_program_event_links;
create trigger benefit_program_event_links_company_match_trg
before insert or update on public.benefit_program_event_links
for each row
execute function public.enforce_benefit_program_event_company_match();

-- Triggers de updated_at (padrão do projeto)
drop trigger if exists benefit_programs_set_updated_at on public.benefit_programs;
create trigger benefit_programs_set_updated_at
before update on public.benefit_programs
for each row
execute function public.update_updated_at_column();

drop trigger if exists benefit_program_eligible_cpf_set_updated_at on public.benefit_program_eligible_cpf;
create trigger benefit_program_eligible_cpf_set_updated_at
before update on public.benefit_program_eligible_cpf
for each row
execute function public.update_updated_at_column();

alter table public.benefit_programs enable row level security;
alter table public.benefit_program_eligible_cpf enable row level security;
alter table public.benefit_program_event_links enable row level security;

create policy "Company members can view benefit programs"
  on public.benefit_programs for select to authenticated
  using (public.user_belongs_to_company(auth.uid(), company_id));

create policy "Admins can manage benefit programs"
  on public.benefit_programs for all to authenticated
  using (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id))
  with check (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id));

create policy "Company members can view benefit eligible cpf"
  on public.benefit_program_eligible_cpf for select to authenticated
  using (public.user_belongs_to_company(auth.uid(), company_id));

create policy "Admins can manage benefit eligible cpf"
  on public.benefit_program_eligible_cpf for all to authenticated
  using (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id))
  with check (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id));

create policy "Company members can view benefit event links"
  on public.benefit_program_event_links for select to authenticated
  using (public.user_belongs_to_company(auth.uid(), company_id));

create policy "Admins can manage benefit event links"
  on public.benefit_program_event_links for all to authenticated
  using (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id))
  with check (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id));
