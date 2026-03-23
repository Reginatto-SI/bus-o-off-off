-- Motor mínimo e idempotente de progresso/elegibilidade das indicações.
-- Fonte de verdade financeira: sales.status = 'pago' + coalesce(platform_fee_total, platform_fee_amount, 0).
-- A rotina não cria pagamento nem muda fluxo financeiro; apenas recalcula um derivado auditável em company_referrals.

create or replace function public.refresh_company_referral_progress(p_referred_company_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_rows integer := 0;
begin
  -- Comentário de manutenção:
  -- Esta rotina é idempotente porque sempre recalcula o progresso a partir da fonte de verdade (`sales`)
  -- e sobrescreve `progress_platform_fee_amount`/status com o estado real atual, sem somar deltas.
  with referral_progress as (
    select
      cr.id,
      cr.status as current_status,
      coalesce(sales_agg.progress_platform_fee_amount, 0)::numeric(10,2) as progress_platform_fee_amount,
      case
        -- Nunca promover automaticamente registros já encerrados manualmente.
        when cr.status in ('paga', 'cancelada') then cr.status
        -- Elegibilidade nasce somente quando a taxa real acumulada atinge a meta configurada.
        when coalesce(sales_agg.progress_platform_fee_amount, 0) >= cr.target_platform_fee_amount then 'elegivel'
        -- Assim que houver qualquer taxa real paga, a indicação sai de `pendente` para `em_progresso`.
        when coalesce(sales_agg.progress_platform_fee_amount, 0) > 0 then 'em_progresso'
        else 'pendente'
      end as next_status,
      case
        -- `eligible_at` é preenchido uma única vez quando a indicação cruza a meta.
        -- Em reprocessamentos posteriores mantemos o timestamp existente para auditoria.
        when cr.status = 'elegivel' and cr.eligible_at is not null then cr.eligible_at
        when cr.status in ('paga', 'cancelada') then cr.eligible_at
        when coalesce(sales_agg.progress_platform_fee_amount, 0) >= cr.target_platform_fee_amount then coalesce(cr.eligible_at, now())
        else null
      end as next_eligible_at
    from public.company_referrals cr
    left join (
      select
        s.company_id as referred_company_id,
        -- `coalesce(platform_fee_total, platform_fee_amount, 0)` é obrigatório aqui porque:
        -- 1) `platform_fee_total` é o consolidado oficial nas vendas atuais;
        -- 2) `platform_fee_amount` cobre compatibilidade histórica/legado;
        -- 3) `0` evita nulls contaminando a soma.
        -- Não usamos outros campos para não duplicar ou reinterpretar a lógica financeira já persistida em `sales`.
        coalesce(sum(coalesce(s.platform_fee_total, s.platform_fee_amount, 0)), 0)::numeric(10,2) as progress_platform_fee_amount
      from public.sales s
      where s.status = 'pago'
        -- A regra do programa considera apenas retorno financeiro real já confirmado.
        -- Portanto vendas pendentes/canceladas/não confirmadas ficam fora da apuração.
        and (p_referred_company_id is null or s.company_id = p_referred_company_id)
      group by s.company_id
    ) sales_agg
      on sales_agg.referred_company_id = cr.referred_company_id
    where p_referred_company_id is null or cr.referred_company_id = p_referred_company_id
  ), updated_referrals as (
    update public.company_referrals cr
    set
      progress_platform_fee_amount = referral_progress.progress_platform_fee_amount,
      status = referral_progress.next_status,
      eligible_at = referral_progress.next_eligible_at
    from referral_progress
    where cr.id = referral_progress.id
      and (
        cr.progress_platform_fee_amount is distinct from referral_progress.progress_platform_fee_amount
        or cr.status is distinct from referral_progress.next_status
        or cr.eligible_at is distinct from referral_progress.next_eligible_at
      )
    returning 1
  )
  select count(*) into v_updated_rows from updated_referrals;

  return v_updated_rows;
end;
$$;

comment on function public.refresh_company_referral_progress(uuid) is
  'Recalcula de forma idempotente o progresso financeiro e o status das indicações com base apenas em sales.status = pago e coalesce(platform_fee_total, platform_fee_amount, 0).';

grant execute on function public.refresh_company_referral_progress(uuid) to authenticated;

create or replace function public.handle_company_referral_progress_from_sales()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Comentário de manutenção:
  -- O trigger apenas dispara a rotina central para a empresa afetada pela venda.
  -- A regra continua concentrada em `refresh_company_referral_progress`, evitando duplicação.
  if tg_op = 'DELETE' then
    perform public.refresh_company_referral_progress(old.company_id);
    return old;
  end if;

  -- Quando a venda muda de empresa, recalculamos o contexto antigo e o novo para manter consistência.
  if tg_op = 'UPDATE' and old.company_id is distinct from new.company_id then
    perform public.refresh_company_referral_progress(old.company_id);
  end if;

  perform public.refresh_company_referral_progress(new.company_id);
  return new;
end;
$$;

comment on function public.handle_company_referral_progress_from_sales() is
  'Aciona o recálculo idempotente de progresso das indicações quando uma venda muda de estado/valor relevante.';

drop trigger if exists trg_refresh_company_referral_progress_on_sales on public.sales;
create trigger trg_refresh_company_referral_progress_on_sales
after insert or delete or update of company_id, status, platform_fee_total, platform_fee_amount
on public.sales
for each row
execute function public.handle_company_referral_progress_from_sales();

-- Backfill inicial para deixar os vínculos já existentes consistentes com o histórico real de `sales`.
select public.refresh_company_referral_progress(null);
