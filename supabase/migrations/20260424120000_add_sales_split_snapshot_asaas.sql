-- Snapshot financeiro imutável do split Asaas por venda.
-- Objetivo: evitar divergência entre cobrança criada e reconciliações futuras (webhook/verify).
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS split_snapshot_platform_fee_percent numeric(10,2),
  ADD COLUMN IF NOT EXISTS split_snapshot_socio_split_percent numeric(10,2),
  ADD COLUMN IF NOT EXISTS split_snapshot_representative_percent numeric(10,2),
  ADD COLUMN IF NOT EXISTS split_snapshot_platform_fee_total numeric(12,2),
  ADD COLUMN IF NOT EXISTS split_snapshot_socio_fee_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS split_snapshot_platform_net_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS split_snapshot_source text,
  ADD COLUMN IF NOT EXISTS split_snapshot_captured_at timestamptz;

COMMENT ON COLUMN public.sales.split_snapshot_platform_fee_percent IS
'Percentual da taxa da plataforma congelado no momento da criação da cobrança Asaas.';

COMMENT ON COLUMN public.sales.split_snapshot_socio_split_percent IS
'Percentual de repasse ao sócio congelado no momento da criação da cobrança Asaas.';

COMMENT ON COLUMN public.sales.split_snapshot_representative_percent IS
'Percentual do representante congelado na criação da cobrança Asaas (regra operacional vigente).';

COMMENT ON COLUMN public.sales.split_snapshot_platform_fee_total IS
'Valor absoluto da taxa da plataforma calculado na criação da cobrança Asaas.';

COMMENT ON COLUMN public.sales.split_snapshot_socio_fee_amount IS
'Valor absoluto do repasse ao sócio calculado na criação da cobrança Asaas.';

COMMENT ON COLUMN public.sales.split_snapshot_platform_net_amount IS
'Valor líquido da plataforma após repasse ao sócio, congelado na criação da cobrança Asaas.';

COMMENT ON COLUMN public.sales.split_snapshot_source IS
'Origem da captura do snapshot financeiro (ex.: create-asaas-payment).';

COMMENT ON COLUMN public.sales.split_snapshot_captured_at IS
'Momento em que o snapshot financeiro da cobrança Asaas foi persistido na venda.';
