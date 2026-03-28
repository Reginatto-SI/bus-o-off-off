-- Hardening final: além de pertencer à empresa, o usuário precisa ter perfil administrativo autorizado.
-- Reutilizamos o padrão oficial do projeto via public.is_admin (gerente, operador, developer).

CREATE OR REPLACE FUNCTION public.correct_sale_passenger(
  p_ticket_id uuid,
  p_company_id uuid,
  p_new_name text,
  p_new_phone text,
  p_new_cpf text,
  p_cpf_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_sale_id uuid;
  v_old_name text;
  v_old_phone text;
  v_old_cpf text;
  v_seat_label text;
  v_sale_status public.sale_status;
  v_boarding_status text;
  v_name text;
  v_phone_digits text;
  v_cpf_digits text;
  v_cpf_reason text;
  v_changes text[] := ARRAY[]::text[];
  v_action text;
  v_description text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obrigatório';
  END IF;

  -- Multiempresa estrito: usuário precisa pertencer à empresa antes de qualquer alteração.
  IF NOT public.user_belongs_to_company(v_user_id, p_company_id) THEN
    RAISE EXCEPTION 'Acesso negado para company_id %', p_company_id;
  END IF;

  -- Guard de perfil: correção sensível de passageiro só pode ser executada por perfil administrativo.
  -- Mantemos padrão central do projeto no backend via is_admin para evitar regra paralela no frontend.
  IF NOT public.is_admin(v_user_id) THEN
    RAISE EXCEPTION 'Perfil sem permissão para corrigir passageiro';
  END IF;

  v_name := btrim(coalesce(p_new_name, ''));
  v_phone_digits := regexp_replace(coalesce(p_new_phone, ''), '\D', '', 'g');
  v_cpf_digits := regexp_replace(coalesce(p_new_cpf, ''), '\D', '', 'g');
  v_cpf_reason := btrim(coalesce(p_cpf_reason, ''));

  IF v_name = '' THEN
    RAISE EXCEPTION 'Nome do passageiro é obrigatório';
  END IF;

  IF length(v_cpf_digits) <> 11 THEN
    RAISE EXCEPTION 'CPF inválido (11 dígitos)';
  END IF;

  IF v_phone_digits <> '' AND length(v_phone_digits) NOT IN (10, 11) THEN
    RAISE EXCEPTION 'Telefone inválido (DDD + número)';
  END IF;

  SELECT
    t.sale_id,
    t.passenger_name,
    t.passenger_phone,
    t.passenger_cpf,
    t.seat_label,
    t.boarding_status,
    s.status
  INTO
    v_sale_id,
    v_old_name,
    v_old_phone,
    v_old_cpf,
    v_seat_label,
    v_boarding_status,
    v_sale_status
  FROM public.tickets t
  JOIN public.sales s ON s.id = t.sale_id
  WHERE t.id = p_ticket_id
    AND t.company_id = p_company_id
    AND s.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket não encontrado para a empresa informada';
  END IF;

  IF v_sale_status = 'cancelado' THEN
    RAISE EXCEPTION 'Edição bloqueada: venda cancelada';
  END IF;

  IF v_sale_status NOT IN ('reservado', 'pago') THEN
    RAISE EXCEPTION 'Edição bloqueada para status da venda: %', v_sale_status;
  END IF;

  IF v_boarding_status <> 'pendente' THEN
    RAISE EXCEPTION 'Edição bloqueada: passagem já utilizada no embarque (%)', v_boarding_status;
  END IF;

  IF v_old_cpf IS DISTINCT FROM v_cpf_digits AND v_cpf_reason = '' THEN
    RAISE EXCEPTION 'Motivo obrigatório para correção de CPF';
  END IF;

  IF v_old_name IS DISTINCT FROM v_name THEN
    v_changes := v_changes || format('Nome: %s → %s', v_old_name, v_name);
  END IF;

  IF coalesce(v_old_phone, '') IS DISTINCT FROM coalesce(nullif(v_phone_digits, ''), '') THEN
    v_changes := v_changes || format('Telefone: %s → %s', coalesce(v_old_phone, '—'), coalesce(nullif(v_phone_digits, ''), '—'));
  END IF;

  IF v_old_cpf IS DISTINCT FROM v_cpf_digits THEN
    v_changes := v_changes || format('CPF: %s → %s', v_old_cpf, v_cpf_digits);
  END IF;

  IF array_length(v_changes, 1) IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.tickets
  SET
    passenger_name = v_name,
    passenger_phone = nullif(v_phone_digits, ''),
    passenger_cpf = v_cpf_digits,
    updated_at = now()
  WHERE id = p_ticket_id
    AND company_id = p_company_id;

  IF v_old_cpf IS DISTINCT FROM v_cpf_digits THEN
    v_action := 'cpf_corrigido';
    v_description := format(
      'Correção formal de CPF (Assento %s): %s. Motivo: %s',
      v_seat_label,
      array_to_string(v_changes, ', '),
      v_cpf_reason
    );
  ELSE
    v_action := 'passageiro_editado';
    v_description := format(
      'Dados do passageiro atualizados (Assento %s): %s',
      v_seat_label,
      array_to_string(v_changes, ', ')
    );
  END IF;

  INSERT INTO public.sale_logs (
    sale_id,
    action,
    description,
    old_value,
    new_value,
    performed_by,
    company_id
  ) VALUES (
    v_sale_id,
    v_action,
    v_description,
    format('nome=%s; telefone=%s; cpf=%s%s',
      v_old_name,
      coalesce(v_old_phone, 'null'),
      v_old_cpf,
      CASE WHEN v_old_cpf IS DISTINCT FROM v_cpf_digits THEN format('; motivo_cpf=%s', v_cpf_reason) ELSE '' END
    ),
    format('nome=%s; telefone=%s; cpf=%s',
      v_name,
      coalesce(nullif(v_phone_digits, ''), 'null'),
      v_cpf_digits
    ),
    v_user_id,
    p_company_id
  );
END;
$$;

COMMENT ON FUNCTION public.correct_sale_passenger(uuid, uuid, text, text, text, text)
IS 'Correção transacional de passageiro (ticket + sale_logs) com validações de status, multiempresa e perfil autorizado.';
