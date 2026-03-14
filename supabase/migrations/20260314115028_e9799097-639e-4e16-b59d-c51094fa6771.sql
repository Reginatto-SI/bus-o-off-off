-- 1. Add 'bloqueado' to sale_status enum
ALTER TYPE public.sale_status ADD VALUE IF NOT EXISTS 'bloqueado';

-- 2. Add block_reason column to sales table
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS block_reason text;

-- 3. Update trigger to ignore bloqueado status
CREATE OR REPLACE FUNCTION public.enforce_platform_fee_before_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Bloqueios operacionais nunca transitam para pago — ignora validação
  IF NEW.status = 'bloqueado' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'pago'
     AND OLD.status IS DISTINCT FROM 'pago'
     AND NEW.platform_fee_status NOT IN ('paid', 'not_applicable')
  THEN
    RAISE EXCEPTION 'Venda não pode ser marcada como paga: taxa da plataforma pendente/dispensada sem confirmação (platform_fee_status = %)', NEW.platform_fee_status;
  END IF;

  RETURN NEW;
END;
$function$;