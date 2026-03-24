-- Categoria do evento (UX/filtros): não altera regras de transporte, apenas registra classificação operacional.
alter table public.events
  add column if not exists event_category text;

-- Garantia de consistência dos valores permitidos, mantendo coluna opcional.
alter table public.events
  drop constraint if exists events_event_category_check;

alter table public.events
  add constraint events_event_category_check
  check (
    event_category is null
    or event_category in ('evento', 'excursao', 'bate_e_volta', 'viagem')
  );

comment on column public.events.event_category is
  'Categoria operacional usada para UX e filtros no admin; não impõe regras de negócio.';
