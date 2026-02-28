-- Relatório gerencial de comissão de vendedores (independente de Stripe).
-- Regras v1:
-- 1) comissão só considera vendas pagas;
-- 2) base = gross_amount quando > 0, senão quantity * unit_price;
-- 3) vendas sem vendedor entram como "Sem vendedor" com comissão 0.

create or replace function public.get_sellers_commission_summary_paginated(
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
  seller_id uuid,
  seller_name text,
  commission_percent numeric,
  eligible_sales bigint,
  total_tickets bigint,
  eligible_revenue numeric,
  total_commission numeric,
  total_count bigint
)
language sql
stable
as $$
  with filtered_sales as (
    select
      s.id,
      s.seller_id,
      s.status,
      s.quantity,
      coalesce(sel.name, 'Sem vendedor') as seller_name,
      coalesce(sel.commission_percent, 0) as commission_percent,
      case
        when coalesce(s.gross_amount, 0) > 0 then s.gross_amount
        else (s.quantity * s.unit_price)
      end as sale_base
    from public.sales s
    left join public.sellers sel on sel.id = s.seller_id
    where
      (p_company_id is null or s.company_id = p_company_id)
      and (p_status is null or s.status = p_status)
      and (p_event_id is null or s.event_id = p_event_id)
      and (p_seller_id is null or s.seller_id = p_seller_id)
      and (p_date_from is null or s.created_at >= p_date_from)
      and (p_date_to is null or s.created_at <= p_date_to)
      and (
        p_search is null
        or s.id::text ilike ('%' || p_search || '%')
        or coalesce(sel.name, 'Sem vendedor') ilike ('%' || p_search || '%')
      )
  ),
  grouped as (
    select
      fs.seller_id,
      max(fs.seller_name) as seller_name,
      max(fs.commission_percent)::numeric as commission_percent,
      count(*) filter (where fs.status = 'pago') as eligible_sales,
      coalesce(sum(case when fs.status = 'pago' then fs.quantity else 0 end), 0)::bigint as total_tickets,
      coalesce(sum(case when fs.status = 'pago' then fs.sale_base else 0 end), 0)::numeric as eligible_revenue,
      coalesce(sum(case
        when fs.status = 'pago' and fs.seller_id is not null then (fs.sale_base * fs.commission_percent / 100.0)
        else 0
      end), 0)::numeric as total_commission
    from filtered_sales fs
    group by fs.seller_id
  )
  select
    g.seller_id,
    g.seller_name,
    g.commission_percent,
    g.eligible_sales,
    g.total_tickets,
    g.eligible_revenue,
    g.total_commission,
    count(*) over() as total_count
  from grouped g
  order by g.total_commission desc, g.eligible_revenue desc, g.seller_name asc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.get_sellers_commission_kpis(
  p_company_id uuid default null,
  p_search text default null,
  p_status public.sale_status default null,
  p_event_id uuid default null,
  p_seller_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  total_commission numeric,
  eligible_revenue numeric,
  eligible_sales bigint,
  total_tickets bigint,
  sellers_count bigint
)
language sql
stable
as $$
  with filtered_sales as (
    select
      s.id,
      s.seller_id,
      s.status,
      s.quantity,
      coalesce(sel.commission_percent, 0) as commission_percent,
      case
        when coalesce(s.gross_amount, 0) > 0 then s.gross_amount
        else (s.quantity * s.unit_price)
      end as sale_base
    from public.sales s
    left join public.sellers sel on sel.id = s.seller_id
    where
      (p_company_id is null or s.company_id = p_company_id)
      and (p_status is null or s.status = p_status)
      and (p_event_id is null or s.event_id = p_event_id)
      and (p_seller_id is null or s.seller_id = p_seller_id)
      and (p_date_from is null or s.created_at >= p_date_from)
      and (p_date_to is null or s.created_at <= p_date_to)
      and (
        p_search is null
        or s.id::text ilike ('%' || p_search || '%')
        or coalesce(sel.name, 'Sem vendedor') ilike ('%' || p_search || '%')
      )
  )
  select
    coalesce(sum(case
      when status = 'pago' and seller_id is not null then (sale_base * commission_percent / 100.0)
      else 0
    end), 0)::numeric as total_commission,
    coalesce(sum(case when status = 'pago' then sale_base else 0 end), 0)::numeric as eligible_revenue,
    count(*) filter (where status = 'pago') as eligible_sales,
    coalesce(sum(case when status = 'pago' then quantity else 0 end), 0)::bigint as total_tickets,
    count(distinct case when status = 'pago' then coalesce(seller_id, '00000000-0000-0000-0000-000000000000'::uuid) end)::bigint as sellers_count
  from filtered_sales;
$$;
