-- Minimiza a resposta pública da elegibilidade: CPF, nome, notas e metadados
-- administrativos não são necessários para calcular ou exibir o benefício.
-- O preflight evita remover silenciosamente overloads ou quebrar dependências externas.
do $$
declare
  v_function_oid oid;
  v_overload_count integer;
  v_dependency_count integer;
begin
  v_function_oid := to_regprocedure(
    'public.get_benefit_eligibility_matches(uuid,uuid,text,date)'
  );

  if v_function_oid is null then
    raise exception 'RPC get_benefit_eligibility_matches(uuid,uuid,text,date) não encontrada';
  end if;

  select count(*)
    into v_overload_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_benefit_eligibility_matches'
    and p.oid <> v_function_oid;

  if v_overload_count > 0 then
    raise exception 'RPC get_benefit_eligibility_matches possui % overload(s) não auditado(s)', v_overload_count;
  end if;

  select count(*)
    into v_dependency_count
  from pg_depend d
  where d.refobjid = v_function_oid
    and d.deptype = 'n';

  if v_dependency_count > 0 then
    raise exception 'RPC get_benefit_eligibility_matches possui % dependência(s) externa(s); revisar antes de alterar retorno', v_dependency_count;
  end if;
end;
$$;

drop function if exists public.get_benefit_eligibility_matches(uuid, uuid, text, date);

create function public.get_benefit_eligibility_matches(
  p_company_id uuid,
  p_event_id uuid,
  p_cpf text,
  p_reference_date date default current_date
)
returns table (
  program_id uuid,
  program_name text,
  benefit_type text,
  benefit_value numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf text;
  v_ref_date date;
begin
  v_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_ref_date := coalesce(p_reference_date, current_date);

  if p_company_id is null or p_event_id is null or length(v_cpf) <> 11 then
    return;
  end if;

  -- Além do filtro por company_id, confirma que o evento recebido pertence à empresa.
  if not exists (
    select 1 from public.events e
    where e.id = p_event_id and e.company_id = p_company_id
  ) then
    return;
  end if;

  return query
  select bp.id, bp.name, bp.benefit_type, bp.benefit_value
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
  'Retorna somente dados mínimos do benefício elegível por CPF, empresa e evento para checkout público/admin.';

revoke all on function public.get_benefit_eligibility_matches(uuid, uuid, text, date) from public;
grant execute on function public.get_benefit_eligibility_matches(uuid, uuid, text, date) to anon, authenticated, service_role;
