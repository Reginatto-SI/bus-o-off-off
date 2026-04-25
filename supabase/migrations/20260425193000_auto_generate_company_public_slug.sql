-- Geração automática de slug público da vitrine para novas empresas.
-- Objetivo: garantir que toda nova company já nasça com `public_slug` válido e único,
-- preservando slugs já existentes e sem sobrescrever links públicos ativos.

create or replace function public.generate_unique_company_public_slug(
  base_input text,
  exclude_company_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved_slugs constant text[] := array[
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
  ];
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
begin
  -- Comentário de manutenção:
  -- A base usa a mesma normalização oficial da vitrine (remove acento, símbolos,
  -- duplicações de hífen etc.) para manter consistência com o frontend/admin.
  base_slug := public.normalize_public_slug(base_input);

  if base_slug is null then
    base_slug := 'empresa';
  end if;

  candidate_slug := base_slug;

  loop
    if candidate_slug = any(reserved_slugs) then
      suffix := suffix + 1;
      candidate_slug := base_slug || '-' || suffix::text;
      continue;
    end if;

    if not exists (
      select 1
      from public.companies c
      where c.public_slug = candidate_slug
        and (exclude_company_id is null or c.id <> exclude_company_id)
    ) then
      return candidate_slug;
    end if;

    suffix := suffix + 1;
    candidate_slug := base_slug || '-' || suffix::text;
  end loop;
end;
$$;

comment on function public.generate_unique_company_public_slug(text, uuid) is
  'Gera slug público de vitrine com normalização oficial + sufixo sequencial determinístico para garantir unicidade.';

create or replace function public.set_company_public_slug()
returns trigger
language plpgsql
as $$
declare
  source_name text;
  normalized_manual_slug text;
begin
  normalized_manual_slug := public.normalize_public_slug(new.public_slug);

  if tg_op = 'INSERT' then
    -- Comentário de regra: na criação da empresa, se não houver slug manual válido,
    -- o sistema cria automaticamente a vitrine usando o nome da empresa e sufixo
    -- sequencial quando necessário (sem aleatoriedade).
    if normalized_manual_slug is null then
      source_name := coalesce(
        nullif(trim(new.trade_name), ''),
        nullif(trim(new.name), ''),
        nullif(trim(new.legal_name), ''),
        'empresa'
      );

      new.public_slug := public.generate_unique_company_public_slug(source_name, new.id);
    else
      new.public_slug := public.generate_unique_company_public_slug(normalized_manual_slug, new.id);
    end if;

    return new;
  end if;

  -- Em updates, preservamos o comportamento atual: normalizar o slug informado
  -- e respeitar validações/índice de unicidade já existentes.
  new.public_slug := normalized_manual_slug;
  return new;
end;
$$;

-- Reforço defensivo: garantimos explicitamente que o trigger de slug está apontando
-- para a versão atual da função `set_company_public_slug()` após esta migration.
drop trigger if exists companies_set_public_slug on public.companies;

create trigger companies_set_public_slug
before insert or update of public_slug on public.companies
for each row
execute function public.set_company_public_slug();

-- Reforço defensivo: mantém a proteção de unicidade mesmo em ambientes com histórico
-- de migrations parcial/desalinhado.
create unique index if not exists companies_public_slug_unique_idx
  on public.companies (public_slug)
  where public_slug is not null;

-- Backfill seguro: preencher apenas empresas sem slug para não sobrescrever links existentes.
update public.companies c
set public_slug = public.generate_unique_company_public_slug(
  coalesce(
    nullif(trim(c.trade_name), ''),
    nullif(trim(c.name), ''),
    nullif(trim(c.legal_name), ''),
    'empresa'
  ),
  c.id
)
where c.public_slug is null;
