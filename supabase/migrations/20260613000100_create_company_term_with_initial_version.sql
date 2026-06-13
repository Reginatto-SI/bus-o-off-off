-- Cria termo e versão inicial em uma única transação/RPC para evitar rascunho sem conteúdo.
create or replace function public.create_company_term_with_initial_version(
  p_company_id uuid,
  p_title text,
  p_term_type text,
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
  v_term_id uuid;
  v_version_id uuid;
begin
  if length(btrim(coalesce(p_title, ''))) = 0 then
    raise exception 'Term title is required';
  end if;

  if length(btrim(coalesce(p_content, ''))) = 0 then
    raise exception 'Term content is required';
  end if;

  insert into public.company_terms (
    company_id,
    title,
    term_type,
    status,
    created_by,
    updated_by
  ) values (
    p_company_id,
    btrim(p_title),
    p_term_type,
    'rascunho',
    auth.uid(),
    auth.uid()
  )
  returning id into v_term_id;

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
    v_term_id,
    1,
    btrim(p_title),
    p_term_type,
    btrim(p_content),
    nullif(btrim(coalesce(p_summary, '')), ''),
    nullif(btrim(coalesce(p_internal_note, '')), ''),
    'draft',
    auth.uid(),
    auth.uid()
  )
  returning id into v_version_id;

  return query select v_term_id, v_version_id;
exception
  when unique_violation then
    raise exception 'Já existe um termo com este título e tipo para esta empresa. Abra o termo existente para editar ou criar uma nova versão.' using errcode = '23505';
end;
$$;

-- Recupera, de forma atômica, termos legados em rascunho que ficaram sem versão inicial.
create or replace function public.recover_company_term_initial_version(
  p_company_id uuid,
  p_term_id uuid,
  p_content text,
  p_summary text default null,
  p_internal_note text default null
)
returns table(version_id uuid)
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
  for update;

  if not found or v_term.status <> 'rascunho' then
    raise exception 'Term is not eligible for draft recovery';
  end if;

  if exists (
    select 1
    from public.company_term_versions
    where term_id = p_term_id
      and company_id = p_company_id
  ) then
    raise exception 'Term is not eligible for draft recovery';
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

  return query select v_version_id;
end;
$$;
