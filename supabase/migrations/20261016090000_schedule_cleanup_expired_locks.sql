-- Step 1 (operacional): garante execução automática do cleanup de reservas pendentes.
-- Estratégia simples e auditável: pg_cron + pg_net chamando a Edge Function interna.

DO $$
DECLARE
  v_existing_job_id bigint;
  v_project_url text;
BEGIN
  -- Tentamos usar a configuração do ambiente. Se não existir (caso reportado em produção),
  -- aplicamos fallback determinístico para a URL do projeto deste repositório.
  -- Isso evita falha da migration por configuração ausente e mantém a automação ativa.
  v_project_url := nullif(current_setting('app.settings.supabase_url', true), '');
  v_project_url := coalesce(v_project_url, 'https://cdrcyjrvurrphnceromd.supabase.co');

  -- Idempotência: remove jobs antigos com o mesmo nome antes de recriar.
  FOR v_existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'cleanup-expired-locks-every-1-minute'
  LOOP
    PERFORM cron.unschedule(v_existing_job_id);
  END LOOP;

  -- Frequência de 1 minuto para reduzir janela de assento travado pós-expiração
  -- sem criar arquitetura paralela. O timeout de negócio continua em 15 minutos.
  -- A função está com verify_jwt=false, então o cron pode chamar só com Content-Type.
  PERFORM cron.schedule(
    'cleanup-expired-locks-every-1-minute',
    '*/1 * * * *',
    format(
      $cron$
      SELECT
        net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb
        )
      $cron$,
      v_project_url || '/functions/v1/cleanup-expired-locks'
    )
  );
END;
$$;
