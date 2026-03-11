-- Trilha técnica mínima para integrações de pagamento por venda.
create table if not exists public.sale_integration_logs (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  direction text not null check (direction in ('incoming_webhook', 'outgoing_request')),
  event_type text not null,
  payment_id text,
  external_reference text,
  processing_status text not null check (processing_status in ('requested', 'success', 'failed')),
  message text,
  payload_json jsonb,
  response_json jsonb,
  created_at timestamptz not null default now()
);

comment on table public.sale_integration_logs is
  'Logs técnicos de integração (requisição e resposta) para auditoria de pagamentos por venda.';

create index if not exists idx_sale_integration_logs_sale_id_created_at
  on public.sale_integration_logs (sale_id, created_at desc);

create index if not exists idx_sale_integration_logs_company_id_created_at
  on public.sale_integration_logs (company_id, created_at desc);

alter table public.sale_integration_logs enable row level security;

-- Leitura restrita ao contexto de empresa do usuário.
drop policy if exists "Company members can view sale integration logs" on public.sale_integration_logs;
create policy "Company members can view sale integration logs"
  on public.sale_integration_logs
  for select
  to authenticated
  using (public.user_belongs_to_company(auth.uid(), company_id));

-- Escrita manual restrita a administradores da empresa.
-- (Edge Functions com service role não dependem desta policy, mas mantemos segurança padrão para usuários autenticados.)
drop policy if exists "Company admins can insert sale integration logs" on public.sale_integration_logs;
create policy "Company admins can insert sale integration logs"
  on public.sale_integration_logs
  for insert
  to authenticated
  with check (public.is_admin(auth.uid()) and public.user_belongs_to_company(auth.uid(), company_id));
