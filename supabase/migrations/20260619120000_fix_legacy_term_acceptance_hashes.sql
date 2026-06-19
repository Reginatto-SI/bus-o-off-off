-- Corrige termos legados publicados antes da normalização do content_hash.
create extension if not exists pgcrypto with schema extensions;

update public.company_term_versions
set content_hash = encode(extensions.digest(content::text, 'sha256'::text), 'hex')
where (content_hash is null or length(btrim(content_hash)) = 0)
  and content is not null
  and length(btrim(content)) > 0;

create or replace function public.prepare_sale_term_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version record;
begin
  select title, term_type, version_number, content, summary, content_hash, status
    into v_version
  from public.company_term_versions
  where id = new.term_version_id
    and term_id = new.term_id
    and company_id = new.company_id;

  if not found then
    raise exception 'Term version does not belong to the selected term/company';
  end if;

  if v_version.status = 'draft' then
    raise exception 'Draft term versions cannot be accepted by sales';
  end if;

  new.term_title_snapshot := coalesce(nullif(btrim(new.term_title_snapshot), ''), v_version.title);
  new.term_type_snapshot := coalesce(nullif(btrim(new.term_type_snapshot), ''), v_version.term_type);
  new.version_number := coalesce(new.version_number, v_version.version_number);
  -- Comentário de suporte: evita falha no checkout quando versões legadas ainda não possuem content_hash persistido.
  new.content_hash := coalesce(
    nullif(btrim(new.content_hash), ''),
    nullif(btrim(v_version.content_hash), ''),
    encode(extensions.digest(v_version.content::text, 'sha256'::text), 'hex')
  );
  new.accepted_text_snapshot := coalesce(nullif(btrim(new.accepted_text_snapshot), ''), v_version.content);
  new.summary_snapshot := coalesce(new.summary_snapshot, v_version.summary);

  return new;
end;
$$;
