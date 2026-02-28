-- Adiciona slug público (nick) para vitrine da empresa com normalização automática.
create extension if not exists unaccent;

alter table public.companies
  add column if not exists public_slug text;

comment on column public.companies.public_slug is
  'Nick público único da empresa para links curtos (ex: /minha-empresa)';

create or replace function public.normalize_public_slug(input_slug text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text;
begin
  if input_slug is null then
    return null;
  end if;

  normalized := lower(trim(unaccent(input_slug)));
  normalized := regexp_replace(normalized, '[^a-z0-9\s-]', '', 'g');
  normalized := regexp_replace(normalized, '[\s_]+', '-', 'g');
  normalized := regexp_replace(normalized, '-{2,}', '-', 'g');
  normalized := regexp_replace(normalized, '(^-|-$)', '', 'g');

  if normalized = '' then
    return null;
  end if;

  return normalized;
end;
$$;

create or replace function public.set_company_public_slug()
returns trigger
language plpgsql
as $$
begin
  new.public_slug := public.normalize_public_slug(new.public_slug);
  return new;
end;
$$;

drop trigger if exists companies_set_public_slug on public.companies;

create trigger companies_set_public_slug
before insert or update of public_slug on public.companies
for each row
execute function public.set_company_public_slug();

-- Normaliza registros existentes para evitar conflito com a validação/índice.
update public.companies
set public_slug = public.normalize_public_slug(public_slug)
where public_slug is not null;

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
        'cadastro-empresa',
        'v',
        'vendedor'
      )
    )
  );

create unique index if not exists companies_public_slug_unique_idx
  on public.companies (public_slug)
  where public_slug is not null;

-- Permite validação pública e resolução de vitrine por slug sem exigir autenticação.
drop policy if exists "Public can view companies with public slug" on public.companies;
create policy "Public can view companies with public slug"
  on public.companies for select
  using (
    is_active = true
    and public_slug is not null
  );

-- Mantém política já existente aderente aos eventos não arquivados.
drop policy if exists "Public can view companies with public events" on public.companies;
create policy "Public can view companies with public events"
  on public.companies for select
  using (
    is_active = true
    and exists (
      select 1
      from public.events e
      where e.company_id = companies.id
        and e.status = 'a_venda'
        and coalesce(e.is_archived, false) = false
    )
  );

-- Endurece a política pública dos eventos para respeitar arquivamento.
drop policy if exists "Public can view available events" on public.events;
create policy "Public can view available events"
  on public.events for select
  using (
    status = 'a_venda'
    and coalesce(is_archived, false) = false
  );

-- Função de apoio para checagem de disponibilidade em tempo real na tela admin.
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
