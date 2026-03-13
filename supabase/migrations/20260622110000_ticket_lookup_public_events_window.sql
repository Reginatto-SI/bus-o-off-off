-- Ajuste cirúrgico: separa a régua pública de consulta de passagens da vitrine comercial.
-- A vitrine continua filtrando status = 'a_venda' na aplicação, mas a consulta pública
-- precisa enxergar também eventos encerrados recentes (até 60 dias) para recuperação de tickets.

create or replace function public.is_event_public_ticket_lookup_eligible(event_row public.events)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(event_row.is_archived, false) = false
    and event_row.status in ('a_venda', 'encerrado')
    and coalesce(
      (
        select max(ebl.departure_date)
        from public.event_boarding_locations ebl
        where ebl.event_id = event_row.id
          and ebl.departure_date is not null
      ),
      event_row.date
    ) >= (current_date - 60);
$$;

grant execute on function public.is_event_public_ticket_lookup_eligible(public.events) to anon, authenticated;

drop policy if exists "Public can view available events" on public.events;
create policy "Public can view available events"
  on public.events for select
  to anon
  using (
    public.is_event_public_ticket_lookup_eligible(events)
  );

-- Permite calcular a data final relevante (máx departure_date) no dropdown público de /consultar-passagens
-- sem abrir histórico antigo nem eventos arquivados.
drop policy if exists "Public can view boarding locations for public events" on public.event_boarding_locations;
drop policy if exists "Public can view boarding locations for ticket lookup eligible events" on public.event_boarding_locations;
create policy "Public can view boarding locations for ticket lookup eligible events"
  on public.event_boarding_locations for select
  to anon
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_boarding_locations.event_id
        and public.is_event_public_ticket_lookup_eligible(e)
    )
  );
