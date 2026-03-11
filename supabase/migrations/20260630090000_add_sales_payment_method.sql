-- Persistência da forma de pagamento escolhida no checkout público.
alter table public.sales
  add column if not exists payment_method text;

-- Restrição defensiva para manter os valores previstos no fluxo (ou nulo para histórico legado).
alter table public.sales
  drop constraint if exists sales_payment_method_check;

alter table public.sales
  add constraint sales_payment_method_check
  check (payment_method in ('pix', 'credit_card') or payment_method is null);

comment on column public.sales.payment_method is
  'Forma de pagamento escolhida no checkout (pix ou credit_card).';
