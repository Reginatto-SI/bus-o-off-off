-- Camada segura única para consulta de elegibilidade de benefício
-- usada no checkout público (anon) e na venda administrativa (authenticated).
-- Evita liberar SELECT direto em tabelas sensíveis sem relaxar RLS existente.

create or replace function public.get_benefit_eligibility_matches(
  p_company_id uuid,
  p_event_id uuid,
  p_cpf text,
  p_reference_date date default current_date
)
returns table (
  program_id uuid,
  program_company_id uuid,
  program_name text,
  program_description text,
  program_status text,
  benefit_type text,
  benefit_value numeric,
  program_valid_from date,
  program_valid_until date,
  applies_to_all_events boolean,
  program_created_at timestamptz,
  program_updated_at timestamptz,
  cpf_record_id uuid,
  cpf_record_company_id uuid,
  cpf_record_program_id uuid,
  cpf text,
  cpf_full_name text,
  cpf_status text,
  cpf_valid_from date,
  cpf_valid_until date,
  cpf_notes text,
  cpf_created_at timestamptz,
  cpf_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf text;
  v_ref_date date;
begin
  -- Normalização defensiva do CPF no banco para garantir comportamento determinístico.
  v_cpf := regexp_replace(coalesce(p_cpf, ''), '\\D', '', 'g');
  v_ref_date := coalesce(p_reference_date, current_date);

  if p_company_id is null or p_event_id is null or length(v_cpf) <> 11 then
    return;
  end if;

  return query
  select
    bp.id,
    bp.company_id,
    bp.name,
    bp.description,
    bp.status,
    bp.benefit_type,
    bp.benefit_value,
    bp.valid_from,
    bp.valid_until,
    bp.applies_to_all_events,
    bp.created_at,
    bp.updated_at,
    c.id,
    c.company_id,
    c.benefit_program_id,
    c.cpf,
    c.full_name,
    c.status,
    c.valid_from,
    c.valid_until,
    c.notes,
    c.created_at,
    c.updated_at
  from public.benefit_program_eligible_cpf c
  join public.benefit_programs bp
    on bp.id = c.benefit_program_id
   and bp.company_id = c.company_id
  where c.company_id = p_company_id
    and c.cpf = v_cpf
    and c.status = 'ativo'
    and bp.status = 'ativo'
    and (c.valid_from is null or c.valid_from <= v_ref_date)
    and (c.valid_until is null or c.valid_until >= v_ref_date)
    and (bp.valid_from is null or bp.valid_from <= v_ref_date)
    and (bp.valid_until is null or bp.valid_until >= v_ref_date)
    and (
      bp.applies_to_all_events
      or exists (
        select 1
        from public.benefit_program_event_links l
        where l.benefit_program_id = bp.id
          and l.company_id = p_company_id
          and l.event_id = p_event_id
      )
    )
  order by c.created_at desc;
end;
$$;

comment on function public.get_benefit_eligibility_matches(uuid, uuid, text, date) is
  'Retorna matches de elegibilidade de benefício por CPF com escopo mínimo para checkout público e admin.';

revoke all on function public.get_benefit_eligibility_matches(uuid, uuid, text, date) from public;
grant execute on function public.get_benefit_eligibility_matches(uuid, uuid, text, date) to anon, authenticated, service_role;
