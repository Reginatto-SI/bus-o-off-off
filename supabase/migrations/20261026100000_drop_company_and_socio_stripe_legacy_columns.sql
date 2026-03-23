-- Etapa final (parcial e conservadora) do legado Stripe:
-- removemos apenas colunas de companies/socios_split que já não sustentam
-- fluxo ativo, tela atual ou auditoria operacional mínima baseada em vendas.

ALTER TABLE public.companies
  DROP COLUMN IF EXISTS stripe_account_id,
  DROP COLUMN IF EXISTS stripe_onboarding_complete;

ALTER TABLE public.socios_split
  DROP COLUMN IF EXISTS stripe_account_id,
  DROP COLUMN IF EXISTS stripe_onboarding_complete;
