-- Permite que o checkout público carregue somente termos publicados vinculados a eventos vendáveis.
-- A validação multi-tenant permanece pelo company_id do vínculo e do evento.

create policy "Public can view term links for public checkout events"
on public.event_term_links
for select
to anon
using (
  exists (
    select 1
    from public.events e
    where e.id = event_term_links.event_id
      and e.company_id = event_term_links.company_id
      and e.status = 'a_venda'
      and e.is_archived = false
      and e.allow_online_sale = true
  )
);

create policy "Public can view published term versions for public checkout events"
on public.company_term_versions
for select
to anon
using (
  status = 'published'
  and exists (
    select 1
    from public.event_term_links etl
    join public.events e
      on e.id = etl.event_id
     and e.company_id = etl.company_id
    where etl.term_version_id = company_term_versions.id
      and etl.term_id = company_term_versions.term_id
      and etl.company_id = company_term_versions.company_id
      and e.status = 'a_venda'
      and e.is_archived = false
      and e.allow_online_sale = true
  )
);
