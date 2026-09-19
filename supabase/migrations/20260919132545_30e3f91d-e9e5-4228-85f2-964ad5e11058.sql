-- 1. Desativa o job de fila de e-mails: nenhuma função do sistema enfileira e-mails
--    (envio real é feito direto pelo Resend nas edge functions).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    PERFORM cron.unschedule('process-email-queue');
  END IF;
END $$;

-- 2. Função única de retenção + trava de tamanho para tabelas de histórico interno.
CREATE OR REPLACE FUNCTION public.enforce_internal_log_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, net, pg_catalog
AS $$
DECLARE
  v_limit_bytes bigint := 300 * 1024 * 1024; -- 300 MB por tabela
  v_size bigint;
BEGIN
  -- cron.job_run_details: retenção de 2 dias
  BEGIN
    DELETE FROM cron.job_run_details
    WHERE end_time IS NOT NULL
      AND end_time < now() - interval '2 days';

    SELECT pg_total_relation_size('cron.job_run_details') INTO v_size;
    IF v_size > v_limit_bytes THEN
      DELETE FROM cron.job_run_details WHERE jobid IS NOT NULL;
      RAISE LOG 'enforce_internal_log_retention: cron.job_run_details limpo (%.0f MB)', v_size / 1048576.0;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'enforce_internal_log_retention: cron.job_run_details ignorado (%)', SQLERRM;
  END;

  -- net._http_response: respostas HTTP internas, retenção de 1 hora
  BEGIN
    DELETE FROM net._http_response
    WHERE created IS NOT NULL
      AND created < now() - interval '1 hour';

    SELECT pg_total_relation_size('net._http_response') INTO v_size;
    IF v_size > v_limit_bytes THEN
      DELETE FROM net._http_response WHERE id IS NOT NULL;
      RAISE LOG 'enforce_internal_log_retention: net._http_response limpo (%.0f MB)', v_size / 1048576.0;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'enforce_internal_log_retention: net._http_response ignorado (%)', SQLERRM;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_internal_log_retention() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_internal_log_retention() TO service_role;

-- 3. Consolida em uma única rotina horária (substitui a limpeza diária anterior).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retention-cron-job-run-details') THEN
    PERFORM cron.unschedule('retention-cron-job-run-details');
  END IF;
END $$;

SELECT cron.schedule(
  'internal-log-retention-guard',
  '0 * * * *',
  $$SELECT public.enforce_internal_log_retention();$$
);
