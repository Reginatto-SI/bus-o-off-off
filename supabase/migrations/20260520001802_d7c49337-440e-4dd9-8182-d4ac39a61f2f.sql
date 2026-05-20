-- Corrige a fonte única de ocupação do mapa de assentos.
-- Regra de negócio: para eventos ida/volta no mesmo veículo, a poltrona física é compartilhada.
-- Portanto a ocupação deve ser calculada por (event_id, vehicle_id, company_id), e não apenas por trip_id.
create or replace function public.get_trip_seat_occupancy(_trip_id uuid)
returns table(seat_id uuid, is_blocked boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with trip_ctx as (
    select tr.event_id, tr.vehicle_id, tr.company_id
    from public.trips tr
    where tr.id = _trip_id
  ),
  sibling_trips as (
    select tr.id as trip_id, tr.company_id, tr.vehicle_id
    from public.trips tr
    join trip_ctx ctx on ctx.event_id = tr.event_id
                     and ctx.vehicle_id = tr.vehicle_id
                     and ctx.company_id = tr.company_id
  ),
  occupied_from_tickets as (
    select coalesce(t.seat_id, seat_by_label.id) as seat_id,
           coalesce(s.status = 'bloqueado', false) as is_blocked
    from public.tickets t
    join sibling_trips st on st.trip_id = t.trip_id and st.company_id = t.company_id
    left join public.sales s on s.id = t.sale_id and s.company_id = t.company_id
    -- Fallback crítico: vendas legadas podem ter seat_id nulo e apenas seat_label preenchido.
    -- O mapa compara por UUID; por isso resolvemos a poltrona pelo número dentro do mesmo veículo.
    left join public.seats seat_by_label on seat_by_label.vehicle_id = st.vehicle_id
                                        and seat_by_label.company_id = st.company_id
                                        and seat_by_label.label = t.seat_label
                                        and not seat_by_label.label like '\_legacy\_%' escape '\'
                                        and not seat_by_label.label like '\_tmp\_%' escape '\'
    where coalesce(t.seat_id, seat_by_label.id) is not null
      and coalesce(s.status, 'reservado') <> 'cancelado'
  ),
  occupied_from_sale_passengers as (
    select coalesce(sp.seat_id, seat_by_label.id) as seat_id,
           (s.status = 'bloqueado') as is_blocked
    from public.sale_passengers sp
    join public.sales s on s.id = sp.sale_id and s.company_id = sp.company_id
    join sibling_trips st on st.trip_id = sp.trip_id and st.company_id = sp.company_id
    -- Mesmo fallback para o staging do checkout/reserva antes do ticket materializado.
    left join public.seats seat_by_label on seat_by_label.vehicle_id = st.vehicle_id
                                        and seat_by_label.company_id = st.company_id
                                        and seat_by_label.label = sp.seat_label
                                        and not seat_by_label.label like '\_legacy\_%' escape '\'
                                        and not seat_by_label.label like '\_tmp\_%' escape '\'
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
    join sibling_trips st on st.trip_id = sl.trip_id and st.company_id = sl.company_id
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

create index if not exists idx_tickets_trip_company_seat_lookup
  on public.tickets (trip_id, company_id, seat_id);

create index if not exists idx_sale_passengers_trip_company_seat_lookup
  on public.sale_passengers (trip_id, company_id, seat_id);

create index if not exists idx_seat_locks_trip_company_active_lookup
  on public.seat_locks (trip_id, company_id, expires_at, seat_id);

create or replace function public.assert_physical_seat_available_for_ticket()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event_id uuid;
  v_vehicle_id uuid;
  v_company_id uuid;
begin
  if new.seat_id is null then
    return new;
  end if;

  select tr.event_id, tr.vehicle_id, tr.company_id
    into v_event_id, v_vehicle_id, v_company_id
  from public.trips tr
  where tr.id = new.trip_id;

  if v_event_id is null or v_vehicle_id is null then
    return new;
  end if;

  -- Serializa tentativas concorrentes para a mesma poltrona física do mesmo evento/veículo.
  -- Isso fecha a brecha de duas abas aprovarem a validação ao mesmo tempo.
  perform pg_advisory_xact_lock(hashtextextended(v_event_id::text || ':' || v_vehicle_id::text || ':' || new.seat_id::text, 0));

  if exists (
    select 1
    from public.tickets t
    join public.trips tr on tr.id = t.trip_id
    left join public.sales s on s.id = t.sale_id and s.company_id = t.company_id
    where t.seat_id = new.seat_id
      and t.company_id = v_company_id
      and tr.event_id = v_event_id
      and tr.vehicle_id = v_vehicle_id
      and coalesce(s.status, 'reservado') <> 'cancelado'
      and t.id is distinct from new.id
  ) then
    raise exception 'Assento já ocupado neste evento e veículo.' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.seat_locks sl
    join public.trips tr on tr.id = sl.trip_id
    where sl.seat_id = new.seat_id
      and sl.company_id = v_company_id
      and tr.event_id = v_event_id
      and tr.vehicle_id = v_vehicle_id
      and sl.expires_at > now()
      and sl.sale_id is distinct from new.sale_id
  ) then
    raise exception 'Assento reservado temporariamente neste evento e veículo.' using errcode = '23505';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_assert_physical_seat_available_for_ticket on public.tickets;
create trigger trg_assert_physical_seat_available_for_ticket
before insert or update of trip_id, seat_id, sale_id, company_id
on public.tickets
for each row
execute function public.assert_physical_seat_available_for_ticket();

create or replace function public.assert_physical_seat_available_for_lock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event_id uuid;
  v_vehicle_id uuid;
  v_company_id uuid;
begin
  if new.seat_id is null or new.expires_at <= now() then
    return new;
  end if;

  select tr.event_id, tr.vehicle_id, tr.company_id
    into v_event_id, v_vehicle_id, v_company_id
  from public.trips tr
  where tr.id = new.trip_id;

  if v_event_id is null or v_vehicle_id is null then
    return new;
  end if;

  -- Mesma trava transacional usada em tickets para impedir disputa entre checkout, admin e outra aba.
  perform pg_advisory_xact_lock(hashtextextended(v_event_id::text || ':' || v_vehicle_id::text || ':' || new.seat_id::text, 0));

  if exists (
    select 1
    from public.tickets t
    join public.trips tr on tr.id = t.trip_id
    left join public.sales s on s.id = t.sale_id and s.company_id = t.company_id
    where t.seat_id = new.seat_id
      and t.company_id = v_company_id
      and tr.event_id = v_event_id
      and tr.vehicle_id = v_vehicle_id
      and coalesce(s.status, 'reservado') <> 'cancelado'
  ) then
    raise exception 'Assento já ocupado neste evento e veículo.' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.seat_locks sl
    join public.trips tr on tr.id = sl.trip_id
    where sl.seat_id = new.seat_id
      and sl.company_id = v_company_id
      and tr.event_id = v_event_id
      and tr.vehicle_id = v_vehicle_id
      and sl.expires_at > now()
      and sl.id is distinct from new.id
      and sl.sale_id is distinct from new.sale_id
  ) then
    raise exception 'Assento reservado temporariamente neste evento e veículo.' using errcode = '23505';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_assert_physical_seat_available_for_lock on public.seat_locks;
create trigger trg_assert_physical_seat_available_for_lock
before insert or update of trip_id, seat_id, expires_at, sale_id, company_id
on public.seat_locks
for each row
execute function public.assert_physical_seat_available_for_lock();