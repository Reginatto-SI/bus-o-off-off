-- Arquivamento administrativo de eventos (exclusão virtual segura).
alter table public.events
add column if not exists is_archived boolean not null default false;

comment on column public.events.is_archived is
'Controle administrativo de arquivamento. Não representa status operacional do evento.';

-- Índice para manter listagens do admin e portal performáticas em eventos ativos.
create index if not exists events_company_status_archived_idx
  on public.events (company_id, status, is_archived, date desc);
