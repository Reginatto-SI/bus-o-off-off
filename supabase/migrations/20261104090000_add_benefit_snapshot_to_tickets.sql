-- Fase 1 (fechamento do ciclo): preservar snapshot de benefício no artefato final (tickets).
-- Sem isso, a limpeza de sale_passengers após pagamento remove a trilha por passageiro.

alter table public.tickets
  add column if not exists benefit_program_id uuid references public.benefit_programs(id) on delete set null,
  add column if not exists benefit_program_name text,
  add column if not exists benefit_type text check (benefit_type in ('percentual', 'valor_fixo', 'preco_final')),
  add column if not exists benefit_value numeric(12,2),
  add column if not exists original_price numeric(12,2),
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists final_price numeric(12,2),
  add column if not exists benefit_applied boolean not null default false,
  add column if not exists pricing_rule_version text not null default 'beneficio_checkout_v1';

comment on column public.tickets.benefit_program_id is
  'Programa de benefício aplicado ao passageiro no checkout público (se houver).';
comment on column public.tickets.benefit_program_name is
  'Snapshot do nome do programa no momento da compra para auditoria.';
comment on column public.tickets.benefit_type is
  'Snapshot do tipo do benefício aplicado (percentual, valor_fixo, preco_final).';
comment on column public.tickets.benefit_value is
  'Snapshot do valor configurado no programa aplicado.';
comment on column public.tickets.original_price is
  'Preço bruto individual da passagem antes de benefício e taxas.';
comment on column public.tickets.discount_amount is
  'Desconto aplicado no passageiro pelo programa de benefício.';
comment on column public.tickets.final_price is
  'Preço final individual após benefício e antes das taxas.';
comment on column public.tickets.benefit_applied is
  'Indica se houve benefício aplicado ao passageiro.';
comment on column public.tickets.pricing_rule_version is
  'Versão da regra de cálculo utilizada para resolver benefício e preço do passageiro.';

-- Backfill defensivo para tickets legados (sem staging de benefício).
update public.tickets t
set
  original_price = coalesce(t.original_price, s.unit_price),
  final_price = coalesce(t.final_price, s.unit_price),
  discount_amount = coalesce(t.discount_amount, 0),
  benefit_applied = coalesce(t.benefit_applied, false)
from public.sales s
where s.id = t.sale_id
  and (t.original_price is null or t.final_price is null);

alter table public.tickets
  alter column original_price set not null,
  alter column final_price set not null;
