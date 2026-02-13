-- Campo para exibir informações/regras importantes do evento no app público.
alter table public.events
add column if not exists public_info text;
