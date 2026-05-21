-- Corrige cláusula ESCAPE inválida em get_trip_seat_occupancy.
-- Causa raiz: a migration anterior usava `escape '\\'` (2 caracteres em standard_conforming_strings),
-- mas ESCAPE exige exatamente 1 caractere → função abortava no startup em qualquer chamada,
-- deixando o mapa de assentos pintar tudo como livre em checkout público e admin.
-- Mantém escopo per-trip (PRD seção 8), união tickets + sale_passengers + seat_locks,
-- fallback por seat_label e proteção transacional contra dupla venda.
create or replace function public.get_trip_seat_occupancy(_trip_id uuid)
returns table(seat_id uuid, is_blocked boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with trip_ctx as (
    select tr.id as trip_id, tr.vehicle_id, tr.company_id
    from public.trips tr
    where tr.id = _trip_id
  ),
  occupied_from_tickets as (
    select coalesce(t.seat_id, seat_by_label.id) as seat_id,
           coalesce(s.status = 'bloqueado', false) as is_blocked
    from public.tickets t
    join trip_ctx ctx on ctx.trip_id = t.trip_id and ctx.company_id = t.company_id
    left join public.sales s on s.id = t.sale_id and s.company_id = t.company_id
    left join public.seats seat_by_label on seat_by_label.vehicle_id = ctx.vehicle_id
                                        and seat_by_label.company_id = ctx.company_id
                                        and seat_by_label.label = t.seat_label
                                        and seat_by_label.label not like '#_legacy#_%' escape '#'
                                        and seat_by_label.label not like '#_tmp#_%' escape '#'
    where coalesce(t.seat_id, seat_by_label.id) is not null
      and coalesce(s.status, 'reservado') <> 'cancelado'
  ),
  occupied_from_sale_passengers as (
    select coalesce(sp.seat_id, seat_by_label.id) as seat_id,
           (s.status = 'bloqueado') as is_blocked
    from public.sale_passengers sp
    join public.sales s on s.id = sp.sale_id and s.company_id = sp.company_id
    join trip_ctx ctx on ctx.trip_id = sp.trip_id and ctx.company_id = sp.company_id
    left join public.seats seat_by_label on seat_by_label.vehicle_id = ctx.vehicle_id
                                        and seat_by_label.company_id = ctx.company_id
                                        and seat_by_label.label = sp.seat_label
                                        and seat_by_label.label not like '#_legacy#_%' escape '#'
                                        and seat_by_label.label not like '#_tmp#_%' escape '#'
    where coalesce(sp.seat_id, seat_by_label.id) is not null
      and s.status in ('pendente_pagamento', 'reservado', 'pago', 'bloqueado')
      and not exists (
        select 1
        from public.tickets t
        where t.sale_id = sp.sale_id
          and t.trip_id = sp.trip_id
          and coalesce(t.seat_id, seat_by_label.id) = coalesce(sp.seat_id, seat_by_label.id)
          and t.company_id = sp.company_id
      )
  ),
  occupied_from_active_locks as (
    select sl.seat_id,
           false as is_blocked
    from public.seat_locks sl
    join trip_ctx ctx on ctx.trip_id = sl.trip_id and ctx.company_id = sl.company_id
    where sl.seat_id is not null
      and sl.expires_at > now()
  )
  select seat_id, bool_or(is_blocked) as is_blocked
  from (
    select * from occupied_from_tickets
    union all
    select * from occupied_from_sale_passengers
    union all
    select * from occupied_from_active_locks
  ) occ
  group by seat_id;
$function$;

grant execute on function public.get_trip_seat_occupancy(uuid) to anon, authenticated;