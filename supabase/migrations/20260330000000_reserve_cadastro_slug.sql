-- Reserva o slug curto "cadastro" para evitar conflito com a rota pública /cadastro.
alter table public.companies
  drop constraint if exists companies_public_slug_format_chk;

alter table public.companies
  add constraint companies_public_slug_format_chk
  check (
    public_slug is null
    or (
      public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and public_slug not in (
        'eventos',
        'login',
        'admin',
        'empresa',
        'confirmacao',
        'consultar-passagens',
        'cadastro',
        'cadastro-empresa',
        'v',
        'vendedor'
      )
    )
  );

create or replace function public.is_company_public_slug_available(
  input_slug text,
  current_company_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_slug text;
  is_reserved boolean;
  already_exists boolean;
begin
  normalized_slug := public.normalize_public_slug(input_slug);

  if normalized_slug is null then
    return false;
  end if;

  is_reserved := normalized_slug in (
    'eventos',
    'login',
    'admin',
    'empresa',
    'confirmacao',
    'consultar-passagens',
    'cadastro',
    'cadastro-empresa',
    'v',
    'vendedor'
  );

  if is_reserved then
    return false;
  end if;

  select exists (
    select 1
    from public.companies c
    where c.public_slug = normalized_slug
      and (current_company_id is null or c.id <> current_company_id)
  ) into already_exists;

  return not already_exists;
end;
$$;

grant execute on function public.is_company_public_slug_available(text, uuid) to anon, authenticated;
