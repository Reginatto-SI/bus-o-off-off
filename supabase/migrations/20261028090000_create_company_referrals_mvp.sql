-- MVP de indicação por link: código oficial por empresa + vínculo oficial entre indicadora e indicada.
-- Regra de negócio: o tracking do link é temporário; o vínculo nasce apenas quando a empresa indicada é criada com sucesso.

alter table public.companies
  add column if not exists referral_code text;

comment on column public.companies.referral_code is
  'Código oficial de indicação da empresa. Usado no link /i/:code do MVP de referrals.';

update public.companies
set referral_code = upper(left(replace(gen_random_uuid()::text, '-', ''), 10))
where referral_code is null;

alter table public.companies
  alter column referral_code set not null;

alter table public.companies
  drop constraint if exists companies_referral_code_format_chk;

alter table public.companies
  add constraint companies_referral_code_format_chk
  check (referral_code ~ '^[A-Z0-9]{6,16}$');

create unique index if not exists companies_referral_code_unique_idx
  on public.companies (referral_code);

create or replace function public.resolve_company_referral_code(code text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.companies c
  where c.referral_code = upper(trim(code))
    and coalesce(c.is_active, true) = true
  limit 1;
$$;

comment on function public.resolve_company_referral_code(text) is
  'Resolve o código público de indicação para company_id sem expor a tabela companies ao fluxo público.';

grant execute on function public.resolve_company_referral_code(text) to anon, authenticated;

create table if not exists public.company_referrals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  referrer_company_id uuid not null references public.companies(id) on delete cascade,
  referred_company_id uuid not null references public.companies(id) on delete cascade,
  referral_code text not null,
  status text not null default 'pendente',
  target_platform_fee_amount numeric(10,2) not null default 100.00,
  reward_amount numeric(10,2) not null default 50.00,
  progress_platform_fee_amount numeric(10,2) not null default 0,
  tracking_captured_at timestamptz null,
  activated_at timestamptz not null default now(),
  eligible_at timestamptz null,
  paid_at timestamptz null,
  paid_amount numeric(10,2) null,
  payment_note text null,
  created_by uuid null,
  paid_by uuid null,
  cancelled_by uuid null,
  cancel_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_referrals_status_chk check (status in ('pendente', 'em_progresso', 'elegivel', 'paga', 'cancelada')),
  constraint company_referrals_referrer_not_self_chk check (referrer_company_id <> referred_company_id),
  constraint company_referrals_code_format_chk check (referral_code ~ '^[A-Z0-9]{6,16}$'),
  constraint company_referrals_company_matches_referrer_chk check (company_id = referrer_company_id),
  constraint company_referrals_paid_fields_chk check (
    (paid_at is null and paid_amount is null)
    or (paid_at is not null and paid_amount is not null)
  )
);

comment on table public.company_referrals is
  'Vínculo oficial do programa de indicação por link entre empresa indicadora e empresa indicada.';

comment on column public.company_referrals.tracking_captured_at is
  'Timestamp do tracking temporário recebido pelo fluxo público antes da criação oficial do vínculo.';

comment on column public.company_referrals.activated_at is
  'Momento exato em que o backend transformou o tracking em vínculo oficial na criação da empresa indicada.';

create unique index if not exists company_referrals_referred_company_unique_idx
  on public.company_referrals (referred_company_id);

create index if not exists company_referrals_company_status_idx
  on public.company_referrals (company_id, status, created_at desc);

create index if not exists company_referrals_referrer_status_idx
  on public.company_referrals (referrer_company_id, status, created_at desc);

create index if not exists company_referrals_referral_code_idx
  on public.company_referrals (referral_code);

alter table public.company_referrals enable row level security;

drop policy if exists "Users can view own company referrals" on public.company_referrals;
create policy "Users can view own company referrals"
on public.company_referrals
for select
to authenticated
using (
  public.user_belongs_to_company(auth.uid(), company_id)
);

drop policy if exists "Admins can manage own company referrals" on public.company_referrals;
create policy "Admins can manage own company referrals"
on public.company_referrals
for all
to authenticated
using (
  public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id)
)
with check (
  public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id)
);

drop trigger if exists company_referrals_set_updated_at on public.company_referrals;
create trigger company_referrals_set_updated_at
before update on public.company_referrals
for each row
execute function public.update_updated_at_column();
