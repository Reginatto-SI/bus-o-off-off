
-- Migração 1: Apenas adicionar o valor ao enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'developer';
