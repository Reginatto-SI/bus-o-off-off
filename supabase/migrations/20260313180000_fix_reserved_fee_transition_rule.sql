-- Regra crítica: venda administrativa só pode virar 'pago' com taxa confirmada.
-- 'waived' representa dispensa explícita da taxa, não confirmação de pagamento.
CREATE OR REPLACE FUNCTION public.enforce_platform_fee_before_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'pago'
     AND OLD.status IS DISTINCT FROM 'pago'
     AND NEW.platform_fee_status NOT IN ('paid', 'not_applicable')
  THEN
    RAISE EXCEPTION 'Venda não pode ser marcada como paga: taxa da plataforma pendente/dispensada sem confirmação (platform_fee_status = %)', NEW.platform_fee_status;
  END IF;

  RETURN NEW;
END;
$$;
