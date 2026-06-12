-- =========================================================
-- Fase 1 — Termos de Serviço, Políticas da Empresa e Aceite
-- Fundação de banco, RLS, versionamento e imutabilidade.
-- Não altera checkout, telas administrativas, Asaas, webhook, split ou venda manual.
-- =========================================================

create extension if not exists pgcrypto;

-- Índices compostos necessários para FKs que preservam consistência por empresa.
-- Mantêm o padrão multiempresa com company_id redundante em tabelas de vínculo.
create unique index if not exists events_id_company_id_unique_idx
  on public.events (id, company_id);

create unique index if not exists sales_id_company_id_unique_idx
  on public.sales (id, company_id);

create unique index if not exists sales_id_event_id_company_id_unique_idx
  on public.sales (id, event_id, company_id);

-- =========================================================
-- Termo lógico da empresa
-- =========================================================
create table if not exists public.company_terms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  term_type text not null default 'termos_servico',
  status text not null default 'rascunho',
  current_version_id uuid null,
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_terms_title_not_blank_chk check (length(btrim(title)) > 0),
  constraint company_terms_type_chk check (
    term_type in (
      'termos_servico',
      'politica_cancelamento',
      'politica_reembolso',
      'regras_embarque',
      'regras_evento',
      'personalizado'
    )
  ),
  constraint company_terms_status_chk check (status in ('rascunho', 'vigente', 'substituido', 'inativo')),
  constraint company_terms_current_version_required_chk check (status <> 'vigente' or current_version_id is not null)
);

comment on table public.company_terms is
  'Agrupador lógico dos termos e políticas cadastrados por empresa. O conteúdo auditável fica em company_term_versions.';
comment on column public.company_terms.current_version_id is
  'Versão vigente do termo lógico. Validada por trigger para pertencer ao mesmo termo/empresa e estar publicada.';

create unique index if not exists company_terms_id_company_id_unique_idx
  on public.company_terms (id, company_id);

create index if not exists company_terms_company_status_idx
  on public.company_terms (company_id, status, created_at desc);

create unique index if not exists company_terms_company_title_type_unique_idx
  on public.company_terms (company_id, lower(title), term_type);

create trigger trg_company_terms_updated_at
before update on public.company_terms
for each row execute function public.update_updated_at_column();

-- =========================================================
-- Versões imutáveis do termo
-- =========================================================
create table if not exists public.company_term_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  term_id uuid not null,
  version_number integer not null,
  title text not null,
  term_type text not null,
  content text not null,
  summary text null,
  content_hash text null,
  status text not null default 'draft',
  published_at timestamptz null,
  published_by uuid null references auth.users(id) on delete set null,
  effective_from timestamptz null,
  internal_note text null,
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_term_versions_term_fk
    foreign key (term_id, company_id)
    references public.company_terms(id, company_id)
    on delete cascade,
  constraint company_term_versions_version_positive_chk check (version_number > 0),
  constraint company_term_versions_title_not_blank_chk check (length(btrim(title)) > 0),
  constraint company_term_versions_content_not_blank_chk check (length(btrim(content)) > 0),
  constraint company_term_versions_type_chk check (
    term_type in (
      'termos_servico',
      'politica_cancelamento',
      'politica_reembolso',
      'regras_embarque',
      'regras_evento',
      'personalizado'
    )
  ),
  constraint company_term_versions_status_chk check (status in ('draft', 'published', 'superseded', 'inactive')),
  constraint company_term_versions_published_fields_chk check (
    status = 'draft'
    or published_at is not null
  )
);

comment on table public.company_term_versions is
  'Conteúdo versionado dos termos. Versões publicadas são protegidas contra alteração silenciosa por trigger.';
comment on column public.company_term_versions.content_hash is
  'Hash SHA-256 do conteúdo usado para rastreabilidade de snapshot/aceite.';

create unique index if not exists company_term_versions_id_company_id_unique_idx
  on public.company_term_versions (id, company_id);

create unique index if not exists company_term_versions_id_term_company_unique_idx
  on public.company_term_versions (id, term_id, company_id);

create unique index if not exists company_term_versions_term_version_unique_idx
  on public.company_term_versions (term_id, company_id, version_number);

create unique index if not exists company_term_versions_one_published_per_term_idx
  on public.company_term_versions (term_id, company_id)
  where status = 'published';

create index if not exists company_term_versions_company_status_idx
  on public.company_term_versions (company_id, status, published_at desc);

alter table public.company_terms
  add constraint company_terms_current_version_fk
  foreign key (current_version_id, company_id)
  references public.company_term_versions(id, company_id)
  deferrable initially immediate;

-- =========================================================
-- Funções de integridade/imutabilidade
-- =========================================================
create or replace function public.prepare_company_term_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.content_hash is null or length(btrim(new.content_hash)) = 0 then
    new.content_hash := encode(digest(new.content, 'sha256'), 'hex');
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

create or replace function public.prevent_published_company_term_version_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Published term versions cannot be deleted. Use status transitions instead.';
  end if;

  return old;
end;
$$;

create or replace function public.validate_company_term_current_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version record;
begin
  if new.current_version_id is null then
    return new;
  end if;

  select id, company_id, term_id, status
    into v_version
  from public.company_term_versions
  where id = new.current_version_id;

  if not found then
    raise exception 'Current version % not found', new.current_version_id;
  end if;

  if v_version.company_id <> new.company_id or v_version.term_id <> new.id then
    raise exception 'Current version must belong to the same term and company';
  end if;

  if v_version.status <> 'published' then
    raise exception 'Current version must be published';
  end if;

  return new;
end;
$$;

create trigger trg_company_term_versions_prepare
before insert or update on public.company_term_versions
for each row execute function public.prepare_company_term_version();

create trigger trg_company_term_versions_prevent_published_delete
before delete on public.company_term_versions
for each row execute function public.prevent_published_company_term_version_delete();

create trigger trg_company_term_versions_updated_at
before update on public.company_term_versions
for each row execute function public.update_updated_at_column();

create trigger trg_company_terms_validate_current_version
before insert or update of company_id, current_version_id, status on public.company_terms
for each row execute function public.validate_company_term_current_version();

-- =========================================================
-- Vínculo futuro de termo/versão com evento
-- =========================================================
create table if not exists public.event_term_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  event_id uuid not null,
  term_id uuid not null,
  term_version_id uuid not null,
  selection_mode text not null default 'specific_version',
  acceptance_required boolean not null default true,
  linked_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_term_links_event_company_fk
    foreign key (event_id, company_id)
    references public.events(id, company_id)
    on delete cascade,
  constraint event_term_links_term_company_fk
    foreign key (term_id, company_id)
    references public.company_terms(id, company_id)
    on delete restrict,
  constraint event_term_links_version_term_company_fk
    foreign key (term_version_id, term_id, company_id)
    references public.company_term_versions(id, term_id, company_id)
    on delete restrict,
  constraint event_term_links_selection_mode_chk check (
    selection_mode in ('company_current_at_publish', 'specific_version')
  )
);

comment on table public.event_term_links is
  'Vínculo auditável entre evento e versão de termo. Nesta fase não há tela; a estrutura prepara o checkout futuro.';

create unique index if not exists event_term_links_event_term_unique_idx
  on public.event_term_links (event_id, term_id);

create unique index if not exists event_term_links_event_version_company_unique_idx
  on public.event_term_links (event_id, term_version_id, company_id);

create index if not exists event_term_links_company_event_idx
  on public.event_term_links (company_id, event_id);

create index if not exists event_term_links_term_version_idx
  on public.event_term_links (term_version_id);

create or replace function public.validate_event_term_link_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_status text;
begin
  select status
    into v_version_status
  from public.company_term_versions
  where id = new.term_version_id
    and term_id = new.term_id
    and company_id = new.company_id;

  if not found then
    raise exception 'Term version does not belong to the selected term/company';
  end if;

  if v_version_status <> 'published' then
    raise exception 'Only published term versions can be linked to events';
  end if;

  return new;
end;
$$;

create trigger trg_event_term_links_validate_version
before insert or update of company_id, event_id, term_id, term_version_id
on public.event_term_links
for each row execute function public.validate_event_term_link_version();

create trigger trg_event_term_links_updated_at
before update on public.event_term_links
for each row execute function public.update_updated_at_column();

-- =========================================================
-- Aceite futuro por venda
-- =========================================================
create table if not exists public.sale_term_acceptances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sale_id uuid not null,
  event_id uuid not null,
  term_id uuid not null,
  term_version_id uuid not null,
  term_title_snapshot text not null,
  term_type_snapshot text not null,
  version_number integer not null,
  content_hash text not null,
  accepted_text_snapshot text not null,
  summary_snapshot text null,
  accepted_at timestamptz not null default now(),
  accepted_by_name text null,
  accepted_by_cpf text null,
  accepted_by_phone text null,
  acceptance_origin text not null default 'public_checkout',
  ip_address inet null,
  user_agent text null,
  accepted_by_user_id uuid null references auth.users(id) on delete set null,
  explicit_acceptance boolean not null default true,
  created_at timestamptz not null default now(),
  constraint sale_term_acceptances_sale_event_company_fk
    foreign key (sale_id, event_id, company_id)
    references public.sales(id, event_id, company_id)
    on delete cascade,
  constraint sale_term_acceptances_event_term_link_fk
    foreign key (event_id, term_version_id, company_id)
    references public.event_term_links(event_id, term_version_id, company_id)
    on delete restrict,
  constraint sale_term_acceptances_version_term_company_fk
    foreign key (term_version_id, term_id, company_id)
    references public.company_term_versions(id, term_id, company_id)
    on delete restrict,
  constraint sale_term_acceptances_title_not_blank_chk check (length(btrim(term_title_snapshot)) > 0),
  constraint sale_term_acceptances_snapshot_not_blank_chk check (length(btrim(accepted_text_snapshot)) > 0),
  constraint sale_term_acceptances_hash_not_blank_chk check (length(btrim(content_hash)) > 0),
  constraint sale_term_acceptances_version_positive_chk check (version_number > 0),
  constraint sale_term_acceptances_origin_chk check (
    acceptance_origin in ('public_checkout', 'admin_manual_external', 'admin_manual_internal', 'support_adjustment')
  ),
  constraint sale_term_acceptances_explicit_chk check (explicit_acceptance = true)
);

comment on table public.sale_term_acceptances is
  'Snapshot imutável do aceite de termos por venda. Será usado pelas próximas fases do checkout, venda manual e ticket.';
comment on column public.sale_term_acceptances.accepted_text_snapshot is
  'Texto aceito no momento da venda, preservado para que alterações futuras do termo não afetem vendas antigas.';

create unique index if not exists sale_term_acceptances_sale_term_version_unique_idx
  on public.sale_term_acceptances (sale_id, term_version_id);

create index if not exists sale_term_acceptances_company_sale_idx
  on public.sale_term_acceptances (company_id, sale_id, accepted_at desc);

create index if not exists sale_term_acceptances_event_version_idx
  on public.sale_term_acceptances (event_id, term_version_id);

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
  new.content_hash := coalesce(nullif(btrim(new.content_hash), ''), v_version.content_hash);
  new.accepted_text_snapshot := coalesce(nullif(btrim(new.accepted_text_snapshot), ''), v_version.content);
  new.summary_snapshot := coalesce(new.summary_snapshot, v_version.summary);

  return new;
end;
$$;

create or replace function public.prevent_sale_term_acceptance_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Sale term acceptances are immutable. Register a new operational log instead.';
end;
$$;

create trigger trg_sale_term_acceptances_prepare
before insert on public.sale_term_acceptances
for each row execute function public.prepare_sale_term_acceptance();

create trigger trg_sale_term_acceptances_prevent_update
before update on public.sale_term_acceptances
for each row execute function public.prevent_sale_term_acceptance_mutation();

create trigger trg_sale_term_acceptances_prevent_delete
before delete on public.sale_term_acceptances
for each row execute function public.prevent_sale_term_acceptance_mutation();

-- =========================================================
-- Auditoria administrativa dos termos
-- =========================================================
create table if not exists public.company_term_audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  term_id uuid null,
  term_version_id uuid null,
  event_id uuid null,
  sale_id uuid null,
  action text not null,
  description text not null,
  old_value text null,
  new_value text null,
  metadata jsonb null,
  performed_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint company_term_audit_logs_term_company_fk
    foreign key (term_id, company_id)
    references public.company_terms(id, company_id),
  constraint company_term_audit_logs_version_company_fk
    foreign key (term_version_id, company_id)
    references public.company_term_versions(id, company_id),
  constraint company_term_audit_logs_event_company_fk
    foreign key (event_id, company_id)
    references public.events(id, company_id),
  constraint company_term_audit_logs_sale_company_fk
    foreign key (sale_id, company_id)
    references public.sales(id, company_id),
  constraint company_term_audit_logs_action_not_blank_chk check (length(btrim(action)) > 0),
  constraint company_term_audit_logs_description_not_blank_chk check (length(btrim(description)) > 0)
);

comment on table public.company_term_audit_logs is
  'Trilha administrativa para criação, publicação, troca de vigente, vínculo a evento e ajustes futuros de termos.';

create index if not exists company_term_audit_logs_company_created_idx
  on public.company_term_audit_logs (company_id, created_at desc);

create index if not exists company_term_audit_logs_term_created_idx
  on public.company_term_audit_logs (term_id, created_at desc);

create index if not exists company_term_audit_logs_sale_created_idx
  on public.company_term_audit_logs (sale_id, created_at desc);

-- =========================================================
-- RLS: sem leitura pública nesta fase.
-- =========================================================
alter table public.company_terms enable row level security;
alter table public.company_term_versions enable row level security;
alter table public.event_term_links enable row level security;
alter table public.sale_term_acceptances enable row level security;
alter table public.company_term_audit_logs enable row level security;

create policy "Users can view company_terms of their company"
on public.company_terms
for select
to authenticated
using (public.user_belongs_to_company(auth.uid(), company_id));

create policy "Admins can insert company_terms of their company"
on public.company_terms
for insert
to authenticated
with check (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id));

create policy "Admins can update company_terms of their company"
on public.company_terms
for update
to authenticated
using (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id))
with check (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id));

create policy "Users can view company_term_versions of their company"
on public.company_term_versions
for select
to authenticated
using (public.user_belongs_to_company(auth.uid(), company_id));

create policy "Admins can insert company_term_versions of their company"
on public.company_term_versions
for insert
to authenticated
with check (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id));

create policy "Admins can update company_term_versions of their company"
on public.company_term_versions
for update
to authenticated
using (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id))
with check (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id));

create policy "Users can view event_term_links of their company"
on public.event_term_links
for select
to authenticated
using (public.user_belongs_to_company(auth.uid(), company_id));

create policy "Admins can insert event_term_links of their company"
on public.event_term_links
for insert
to authenticated
with check (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id));

create policy "Admins can update event_term_links of their company"
on public.event_term_links
for update
to authenticated
using (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id))
with check (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id));

create policy "Users can view sale_term_acceptances of their company"
on public.sale_term_acceptances
for select
to authenticated
using (public.user_belongs_to_company(auth.uid(), company_id));

create policy "Admins can insert sale_term_acceptances of their company"
on public.sale_term_acceptances
for insert
to authenticated
with check (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id));

create policy "Users can view company_term_audit_logs of their company"
on public.company_term_audit_logs
for select
to authenticated
using (public.user_belongs_to_company(auth.uid(), company_id));

create policy "Admins can insert company_term_audit_logs of their company"
on public.company_term_audit_logs
for insert
to authenticated
with check (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id));
