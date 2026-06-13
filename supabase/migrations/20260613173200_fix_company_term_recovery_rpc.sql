-- Garante que a recuperação de termos legados sem versão inicial exista no PostgREST
-- e que o hash de conteúdo usado pelo trigger funcione em ambientes com pgcrypto no schema extensions.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.prepare_company_term_version()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.content_hash is null or length(btrim(new.content_hash)) = 0 then
    new.content_hash := encode(extensions.digest(new.content::text, 'sha256'::text), 'hex');
  end if;

  if new.status in ('published', 'superseded', 'inactive') then
    new.published_at := coalesce(new.published_at, now());
    new.published_by := coalesce(new.published_by, auth.uid());
  end if;

  if tg_op = 'UPDATE' and old.status <> 'draft' then
    -- Versões já publicadas/substituídas/inativas preservam o conteúdo e metadados de publicação.
    -- Mudanças reais devem gerar nova versão; apenas status, nota interna e updated_by podem evoluir.
    if new.company_id is distinct from old.company_id
      or new.term_id is distinct from old.term_id
      or new.version_number is distinct from old.version_number
      or new.title is distinct from old.title
      or new.term_type is distinct from old.term_type
      or new.content is distinct from old.content
      or new.summary is distinct from old.summary
      or new.content_hash is distinct from old.content_hash
      or new.published_at is distinct from old.published_at
      or new.published_by is distinct from old.published_by
      or new.effective_from is distinct from old.effective_from then
      raise exception 'Published term versions are immutable. Create a new version instead.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.recover_company_term_initial_version(
  p_company_id uuid,
  p_term_id uuid,
  p_content text,
  p_summary text default null,
  p_internal_note text default null
)
returns table(term_id uuid, version_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_term public.company_terms%rowtype;
  v_version_id uuid;
begin
  if length(btrim(coalesce(p_content, ''))) = 0 then
    raise exception 'Term content is required';
  end if;

  select *
    into v_term
  from public.company_terms
  where id = p_term_id
    and company_id = p_company_id
    and status = 'rascunho'
  for update;

  if not found then
    raise exception 'Term is not eligible for draft recovery';
  end if;

  if exists (
    select 1
    from public.company_term_versions
    where term_id = p_term_id
      and company_id = p_company_id
  ) then
    raise exception 'Term already has an initial version and cannot be recovered again';
  end if;

  insert into public.company_term_versions (
    company_id,
    term_id,
    version_number,
    title,
    term_type,
    content,
    summary,
    internal_note,
    status,
    created_by,
    updated_by
  ) values (
    p_company_id,
    p_term_id,
    1,
    v_term.title,
    v_term.term_type,
    btrim(p_content),
    nullif(btrim(coalesce(p_summary, '')), ''),
    nullif(btrim(coalesce(p_internal_note, '')), ''),
    'draft',
    auth.uid(),
    auth.uid()
  )
  returning id into v_version_id;

  update public.company_terms
  set updated_by = auth.uid()
  where id = p_term_id
    and company_id = p_company_id;

  return query select p_term_id, v_version_id;
exception
  when unique_violation then
    raise exception 'Term already has an initial version and cannot be recovered again' using errcode = '23505';
end;
$$;
