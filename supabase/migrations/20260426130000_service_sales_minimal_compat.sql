-- Correção mínima para habilitar venda avulsa de serviços sem dependência de logística de passagem.
-- Escopo deliberadamente reduzido: apenas compatibilização de contrato já existente.

-- 1) Status operacionais do PRD para venda avulsa de serviços.
ALTER TYPE public.sale_status ADD VALUE IF NOT EXISTS 'pendente';
ALTER TYPE public.sale_status ADD VALUE IF NOT EXISTS 'pendente_taxa';

-- 2) Remover obrigatoriedade de trip/embarque para permitir venda operacional de serviços.
ALTER TABLE public.sales
  ALTER COLUMN trip_id DROP NOT NULL,
  ALTER COLUMN boarding_location_id DROP NOT NULL;

-- 3) CPF/telefone deixam de ser obrigatórios para venda avulsa operacional.
ALTER TABLE public.sales
  ALTER COLUMN customer_cpf DROP NOT NULL,
  ALTER COLUMN customer_phone DROP NOT NULL;
