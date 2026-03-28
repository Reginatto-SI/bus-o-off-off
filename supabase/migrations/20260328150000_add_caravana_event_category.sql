alter table public.events
  drop constraint if exists events_event_category_check;

alter table public.events
  add constraint events_event_category_check
  check (
    event_category is null
    or event_category in ('evento', 'excursao', 'bate_e_volta', 'viagem', 'caravana')
  );
