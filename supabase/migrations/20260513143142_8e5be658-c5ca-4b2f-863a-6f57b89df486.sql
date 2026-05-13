create or replace function public.get_trip_seat_occupancy(_trip_id uuid)
returns table (seat_id uuid, is_blocked boolean)
language sql
stable
security definer
set search_path = public
as $$
  select t.seat_id,
         coalesce(s.status = 'bloqueado', false) as is_blocked
  from public.tickets t
  left join public.sales s on s.id = t.sale_id
  where t.trip_id = _trip_id
    and t.seat_id is not null
    and exists (
      select 1 from public.trips tr
      join public.events e on e.id = tr.event_id
      where tr.id = _trip_id and e.status = 'a_venda'
    );
$$;

grant execute on function public.get_trip_seat_occupancy(uuid) to anon, authenticated;