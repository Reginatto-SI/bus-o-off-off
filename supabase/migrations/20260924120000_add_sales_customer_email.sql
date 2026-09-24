-- O e-mail pertence ao comprador da venda; nullable preserva vendas históricas e fluxos não públicos.
alter table public.sales
  add column if not exists customer_email text;

comment on column public.sales.customer_email is
  'E-mail real informado pelo comprador da venda; obrigatório no checkout público para novas compras.';
