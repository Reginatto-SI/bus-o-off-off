-- Corrige ocupacao do mapa de assentos para refletir o VEICULO FISICO no contexto do evento,
-- nao apenas o trip_id. Causa raiz: trips ida+volta de um mesmo evento compartilham o mesmo
-- vehicle_id; tickets da volta tem seat_id NULL (regra de negocio), o que fazia a RPC retornar
-- 0 ocupados ao abrir o mapa da volta, deixando o checkout/admin pintar tudo como livre.
-- A correcao agrega ocupacao de TODOS os trips do mesmo (event_id, vehicle_id, company_id).
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
  -- Todos os trips do mesmo evento que usam o mesmo veiculo fisico (ida + volta + auxiliares).
  sibling_trips as (
    select tr.id as trip_id, tr.company_id
    from public.trips tr
    join trip_ctx ctx on ctx.event_id = tr.event_id
                     and ctx.vehicle_id = tr.vehicle_id
                     and ctx.company_id = tr.company_id
  ),
  sold_or_blocked_by_ticket as (
    select t.seat_id,
           coalesce(s.status = 'bloqueado', false) as is_blocked
    from public.tickets t
    join sibling_trips st on st.trip_id = t.trip_id and st.company_id = t.company_id
    left join public.sales s on s.id = t.sale_id and s.company_id = t.company_id
    where t.seat_id is not null
      and coalesce(s.status, 'reservado') <> 'cancelado'
  ),
  occupied_from_sale_passengers as (
    select sp.seat_id,
           (s.status = 'bloqueado') as is_blocked
    from public.sale_passengers sp
    join public.sales s on s.id = sp.sale_id and s.company_id = sp.company_id
    join sibling_trips st on st.trip_id = sp.trip_id and st.company_id = sp.company_id
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
$function$;

grant execute on function public.get_trip_seat_occupancy(uuid) to anon, authenticated;