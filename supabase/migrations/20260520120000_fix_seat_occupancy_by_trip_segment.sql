-- Ajuste de regra por trecho: ocupação deve respeitar trip_id (ida/volta)
-- e não compartilhar assento automaticamente entre viagens irmãs do mesmo veículo.

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
                                        and not seat_by_label.label like '\_legacy\_%' escape '\\'
                                        and not seat_by_label.label like '\_tmp\_%' escape '\\'
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
                                        and not seat_by_label.label like '\_legacy\_%' escape '\\'
                                        and not seat_by_label.label like '\_tmp\_%' escape '\\'
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

create or replace function public.assert_physical_seat_available_for_ticket()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
begin
  if new.seat_id is null then
    return new;
  end if;

  select tr.company_id into v_company_id
  from public.trips tr
  where tr.id = new.trip_id;

  if v_company_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.trip_id::text || ':' || new.seat_id::text, 0));

  if exists (
    select 1
    from public.tickets t
    left join public.sales s on s.id = t.sale_id and s.company_id = t.company_id
    where t.seat_id = new.seat_id
      and t.company_id = v_company_id
      and t.trip_id = new.trip_id
      and coalesce(s.status, 'reservado') <> 'cancelado'
      and t.id is distinct from new.id
  ) then
    raise exception 'Assento já ocupado neste trecho.' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.seat_locks sl
    where sl.seat_id = new.seat_id
      and sl.company_id = v_company_id
      and sl.trip_id = new.trip_id
      and sl.expires_at > now()
      and sl.sale_id is distinct from new.sale_id
  ) then
    raise exception 'Assento reservado temporariamente neste trecho.' using errcode = '23505';
  end if;

  return new;
end;
$function$;

create or replace function public.assert_physical_seat_available_for_lock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
begin
  if new.seat_id is null or new.expires_at <= now() then
    return new;
  end if;

  select tr.company_id into v_company_id
  from public.trips tr
  where tr.id = new.trip_id;

  if v_company_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.trip_id::text || ':' || new.seat_id::text, 0));

  if exists (
    select 1
    from public.tickets t
    left join public.sales s on s.id = t.sale_id and s.company_id = t.company_id
    where t.seat_id = new.seat_id
      and t.company_id = v_company_id
      and t.trip_id = new.trip_id
      and coalesce(s.status, 'reservado') <> 'cancelado'
  ) then
    raise exception 'Assento já ocupado neste trecho.' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.seat_locks sl
    where sl.seat_id = new.seat_id
      and sl.company_id = v_company_id
      and sl.trip_id = new.trip_id
      and sl.expires_at > now()
      and sl.id is distinct from new.id
      and sl.sale_id is distinct from new.sale_id
  ) then
    raise exception 'Assento reservado temporariamente neste trecho.' using errcode = '23505';
  end if;

  return new;
end;
$function$;
