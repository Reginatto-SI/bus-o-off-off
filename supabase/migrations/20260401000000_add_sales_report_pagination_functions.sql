-- Paginação server-side para /admin/relatorios/vendas (resumo e indicadores).
create or replace function public.get_sales_report_summary_paginated(
  p_company_id uuid default null,
  p_search text default null,
  p_status public.sale_status default null,
  p_event_id uuid default null,
  p_seller_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  event_id uuid,
  event_name text,
  event_date date,
  total_sales bigint,
  paid_sales bigint,
  cancelled_sales bigint,
  gross_revenue numeric,
  platform_fee numeric,
  sellers_commission numeric,
  total_count bigint
)
language sql
stable
as $$
  with filtered_sales as (
    select
      s.*,
      e.name as event_name,
      e.date as event_date,
      coalesce(s.gross_amount, s.quantity * s.unit_price) as sale_total,
      coalesce(sel.commission_percent, 0) as seller_commission_percent
    from public.sales s
    join public.events e on e.id = s.event_id
    left join public.sellers sel on sel.id = s.seller_id
    where
      (p_company_id is null or s.company_id = p_company_id)
      and (
        p_search is null
        or s.customer_name ilike ('%' || p_search || '%')
        or s.customer_cpf ilike ('%' || p_search || '%')
      )
      and (p_status is null or s.status = p_status)
      and (p_event_id is null or s.event_id = p_event_id)
      and (p_seller_id is null or s.seller_id = p_seller_id)
      and (p_date_from is null or s.created_at >= p_date_from)
      and (p_date_to is null or s.created_at <= p_date_to)
  ),
  grouped as (
    select
      fs.event_id,
      max(fs.event_name) as event_name,
      max(fs.event_date) as event_date,
      count(*) as total_sales,
      count(*) filter (where fs.status = 'pago') as paid_sales,
      count(*) filter (where fs.status = 'cancelado') as cancelled_sales,
      coalesce(sum(fs.sale_total), 0)::numeric as gross_revenue,
      coalesce(sum(case when fs.status = 'pago' then coalesce(fs.platform_fee_total, 0) else 0 end), 0)::numeric as platform_fee,
      coalesce(sum(case when fs.status = 'pago' then (fs.sale_total * fs.seller_commission_percent / 100.0) else 0 end), 0)::numeric as sellers_commission
    from filtered_sales fs
    group by fs.event_id
  )
  select
    g.event_id,
    g.event_name,
    g.event_date,
    g.total_sales,
    g.paid_sales,
    g.cancelled_sales,
    g.gross_revenue,
    g.platform_fee,
    g.sellers_commission,
    count(*) over() as total_count
  from grouped g
  order by g.gross_revenue desc, g.event_name asc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.get_sales_report_kpis(
  p_company_id uuid default null,
  p_search text default null,
  p_status public.sale_status default null,
  p_event_id uuid default null,
  p_seller_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  total_sales bigint,
  paid_sales bigint,
  cancelled_sales bigint,
  gross_revenue numeric,
  platform_fee numeric,
  sellers_commission numeric
)
language sql
stable
as $$
  with filtered_sales as (
    select
      s.*,
      coalesce(s.gross_amount, s.quantity * s.unit_price) as sale_total,
      coalesce(sel.commission_percent, 0) as seller_commission_percent
    from public.sales s
    left join public.sellers sel on sel.id = s.seller_id
    where
      (p_company_id is null or s.company_id = p_company_id)
      and (
        p_search is null
        or s.customer_name ilike ('%' || p_search || '%')
        or s.customer_cpf ilike ('%' || p_search || '%')
      )
      and (p_status is null or s.status = p_status)
      and (p_event_id is null or s.event_id = p_event_id)
      and (p_seller_id is null or s.seller_id = p_seller_id)
      and (p_date_from is null or s.created_at >= p_date_from)
      and (p_date_to is null or s.created_at <= p_date_to)
  )
  select
    count(*) as total_sales,
    count(*) filter (where status = 'pago') as paid_sales,
    count(*) filter (where status = 'cancelado') as cancelled_sales,
    coalesce(sum(sale_total), 0)::numeric as gross_revenue,
    coalesce(sum(case when status = 'pago' then coalesce(platform_fee_total, 0) else 0 end), 0)::numeric as platform_fee,
    coalesce(sum(case when status = 'pago' then (sale_total * seller_commission_percent / 100.0) else 0 end), 0)::numeric as sellers_commission
  from filtered_sales;
$$;
