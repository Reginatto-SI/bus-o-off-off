create or replace function public.get_trip_seat_occupancy(_trip_id uuid)
returns table (seat_id uuid, is_blocked boolean)
language sql
stable
security definer
set search_path = public
as $$
  with trip_ctx as (
    select tr.id as trip_id, e.company_id
    from public.trips tr
    join public.events e on e.id = tr.event_id
    where tr.id = _trip_id
  ),
  sold_or_blocked_by_ticket as (
    select t.seat_id,
           coalesce(s.status = 'bloqueado', false) as is_blocked
    from public.tickets t
    join trip_ctx ctx on ctx.trip_id = t.trip_id and ctx.company_id = t.company_id
    left join public.sales s on s.id = t.sale_id and s.company_id = t.company_id
    where t.seat_id is not null
      and coalesce(s.status, 'reservado') <> 'cancelado'
  ),
  occupied_from_sale_passengers as (
    select sp.seat_id,
           (s.status = 'bloqueado') as is_blocked
    from public.sale_passengers sp
    join public.sales s on s.id = sp.sale_id and s.company_id = sp.company_id
    join trip_ctx ctx on ctx.trip_id = sp.trip_id and ctx.company_id = sp.company_id
    where sp.seat_id is not null
      and s.status in ('pendente_pagamento', 'reservado', 'pago', 'bloqueado')
      and not exists (
        select 1
        from public.tickets t
        where t.sale_id = sp.sale_id
          and t.trip_id = sp.trip_id
          and t.seat_id = sp.seat_id
          and t.company_id = sp.company_id
      )
  )
  select seat_id, bool_or(is_blocked) as is_blocked
  from (
    select * from sold_or_blocked_by_ticket
    union all
    select * from occupied_from_sale_passengers
  ) occ
  group by seat_id;
$$;

grant execute on function public.get_trip_seat_occupancy(uuid) to anon, authenticated;
