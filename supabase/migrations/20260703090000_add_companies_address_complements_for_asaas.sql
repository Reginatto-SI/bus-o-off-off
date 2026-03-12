-- Endereço complementar para onboarding do Asaas.
-- Mantido como nullable para não quebrar registros já existentes.
alter table public.companies
  add column if not exists postal_code text,
  add column if not exists address_number text,
  add column if not exists province text;
