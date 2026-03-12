-- Garante assinatura RPC esperada pela tela /admin/relatorios/lista-embarque
-- e exposição no schema cache do PostgREST para roles autenticadas.

drop function if exists public.get_boarding_manifest_rows(uuid, uuid);

create or replace function public.get_boarding_manifest_rows(
  p_company_id uuid,
  p_event_id uuid,
  p_trip_id uuid default null
)
returns table (
  sale_id uuid,
  ticket_id uuid,
  event_id uuid,
  event_name text,
  event_date date,
  trip_id uuid,
  trip_departure_time time,
  vehicle_plate text,
  vehicle_type text,
  boarding_location_id uuid,
  boarding_location_name text,
  stop_order integer,
  departure_time time,
  passenger_name text,
  passenger_phone text,
  seat_label text
)
language sql
stable
as $$
  select
    s.id as sale_id,
    t.id as ticket_id,
    s.event_id,
    e.name as event_name,
    e.date as event_date,
    s.trip_id,
    tr.departure_time as trip_departure_time,
    v.plate as vehicle_plate,
    v.type::text as vehicle_type,
    s.boarding_location_id,
    bl.name as boarding_location_name,
    ebl.stop_order,
    ebl.departure_time,
    coalesce(t.passenger_name, s.customer_name) as passenger_name,
    coalesce(t.passenger_phone, s.customer_phone) as passenger_phone,
    coalesce(nullif(t.seat_label, ''), '--') as seat_label
  from public.sales s
  join public.events e on e.id = s.event_id
  join public.trips tr on tr.id = s.trip_id
  left join public.vehicles v on v.id = tr.vehicle_id
  join public.boarding_locations bl on bl.id = s.boarding_location_id
  left join public.event_boarding_locations ebl
    on ebl.event_id = s.event_id
   and ebl.trip_id = s.trip_id
   and ebl.boarding_location_id = s.boarding_location_id
  left join public.tickets t
    on t.sale_id = s.id
   and t.trip_id = s.trip_id
  where
    s.company_id = p_company_id
    and s.event_id = p_event_id
    and s.status = 'pago'
    and (p_trip_id is null or s.trip_id = p_trip_id)
  order by
    coalesce(ebl.stop_order, 9999),
    ebl.departure_time nulls last,
    coalesce(nullif(t.seat_label, ''), 'ZZZ') asc,
    coalesce(t.passenger_name, s.customer_name) asc;
$$;

-- Comentário de suporte: sem EXECUTE a função não aparece no schema cache para RPC do client.
grant execute on function public.get_boarding_manifest_rows(uuid, uuid, uuid) to authenticated;
grant execute on function public.get_boarding_manifest_rows(uuid, uuid, uuid) to service_role;
