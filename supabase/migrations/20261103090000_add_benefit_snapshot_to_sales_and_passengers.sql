-- Fase 1: snapshot auditável de benefício no checkout público (por passageiro via CPF)
-- Mantemos mudança mínima: campos em sale_passengers + agregado em sales.

alter table public.sale_passengers
  add column if not exists benefit_program_id uuid references public.benefit_programs(id) on delete set null,
  add column if not exists benefit_program_name text,
  add column if not exists benefit_type text check (benefit_type in ('percentual', 'valor_fixo', 'preco_final')),
  add column if not exists benefit_value numeric(12,2),
  add column if not exists original_price numeric(12,2),
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists final_price numeric(12,2),
  add column if not exists benefit_applied boolean not null default false,
  add column if not exists pricing_rule_version text not null default 'beneficio_checkout_v1';

comment on column public.sale_passengers.benefit_program_id is
  'Programa de benefício aplicado ao passageiro no checkout público (se houver).';
comment on column public.sale_passengers.benefit_program_name is
  'Snapshot do nome do programa no momento da compra para auditoria.';
comment on column public.sale_passengers.benefit_type is
  'Snapshot do tipo do benefício aplicado (percentual, valor_fixo, preco_final).';
comment on column public.sale_passengers.benefit_value is
  'Snapshot do valor configurado no programa aplicado.';
comment on column public.sale_passengers.original_price is
  'Preço bruto individual da passagem antes de benefício e taxas.';
comment on column public.sale_passengers.discount_amount is
  'Desconto aplicado no passageiro pelo programa de benefício.';
comment on column public.sale_passengers.final_price is
  'Preço final individual após benefício e antes das taxas.';
comment on column public.sale_passengers.benefit_applied is
  'Indica se houve benefício aplicado ao passageiro.';
comment on column public.sale_passengers.pricing_rule_version is
  'Versão da regra de cálculo utilizada para resolver benefício e preço do passageiro.';

-- Backfill defensivo para registros legados sem snapshot financeiro.
update public.sale_passengers sp
set
  original_price = coalesce(sp.original_price, s.unit_price),
  final_price = coalesce(sp.final_price, s.unit_price),
  discount_amount = coalesce(sp.discount_amount, 0),
  benefit_applied = coalesce(sp.benefit_applied, false)
from public.sales s
where s.id = sp.sale_id
  and (sp.original_price is null or sp.final_price is null);

alter table public.sale_passengers
  alter column original_price set not null,
  alter column final_price set not null;

alter table public.sales
  add column if not exists benefit_total_discount numeric(12,2) not null default 0;

comment on column public.sales.benefit_total_discount is
  'Soma agregada dos descontos de benefício aplicados aos passageiros na venda.';
