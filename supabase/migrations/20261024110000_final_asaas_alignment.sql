-- Acabamento final Asaas: alinhar banco e observabilidade com o contrato atual do código.

-- 1) Etapa 2 consolidada: `request` passou a ser fonte legítima de decisão
-- na primeira criação da cobrança, então a constraint precisa refletir isso.
ALTER TABLE public.sale_integration_logs
  DROP CONSTRAINT IF EXISTS sale_integration_logs_environment_decision_source_check;

ALTER TABLE public.sale_integration_logs
  ADD CONSTRAINT sale_integration_logs_environment_decision_source_check
  CHECK (
    environment_decision_source IS NULL
    OR environment_decision_source IN ('sale', 'request', 'host')
  );

COMMENT ON CONSTRAINT sale_integration_logs_environment_decision_source_check ON public.sale_integration_logs IS
'Origem auditável da decisão de ambiente: sale para venda persistida, request para primeiro create explícito e host apenas para compatibilidade controlada.';

-- 2) Removemos o default silencioso de sandbox. O ambiente continua obrigatório,
-- mas agora todo fluxo de criação deve persisti-lo explicitamente.
ALTER TABLE public.sales
  ALTER COLUMN payment_environment DROP DEFAULT;

COMMENT ON COLUMN public.sales.payment_environment IS
'Ambiente obrigatório e explícito da transação. Sem default silencioso para evitar nascimento incorreto fora do fluxo principal.';
