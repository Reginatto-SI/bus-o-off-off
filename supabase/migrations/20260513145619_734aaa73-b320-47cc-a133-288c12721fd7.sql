create or replace function public.get_trip_available_capacity(trip_uuid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select t.capacity - coalesce(
    (select count(*)::integer from public.tickets tk where tk.trip_id = trip_uuid),
    0
  )
  from public.trips t
  where t.id = trip_uuid
    and exists (
      select 1
      from public.events e
      where e.id = t.event_id and e.status = 'a_venda'
    );
$$;

grant execute on function public.get_trip_available_capacity(uuid) to anon, authenticated;