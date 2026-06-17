## Objetivo
Padronizar a comissão da plataforma em **6%** e a taxa do sócio em **0%** para todas as empresas (existentes e futuras), atualizando também os defaults no código.

## Diagnóstico
Colunas reais na tabela `public.companies`:
- `platform_fee_percent` (default atual: `3`)
- `socio_split_percent` (default atual: `3`)

Atualmente há valores divergentes: 0, 3, 6, 7, 7.5, 50, etc.

Pontos no código que definem default `3` e precisam virar `6` / `0`:
- `supabase/functions/register-company/index.ts` (linhas 200-201) — criação SaaS de nova empresa
- `src/pages/admin/Company.tsx` (linhas 265-266, 417-418, 713-714) — fallback de formulário (`?? 3`) e `?? 3` no card de comissão (linha 2233)

## Mudanças

### 1. Migration única
- `ALTER TABLE public.companies ALTER COLUMN platform_fee_percent SET DEFAULT 6;`
- `ALTER TABLE public.companies ALTER COLUMN socio_split_percent SET DEFAULT 0;`
- `UPDATE public.companies SET platform_fee_percent = 6, socio_split_percent = 0;` (todas as empresas existentes)

### 2. Backend (Edge Function)
- `register-company/index.ts`: `platform_fee_percent: 6`, `socio_split_percent: 0`

### 3. Frontend — `src/pages/admin/Company.tsx`
- Trocar todos os fallbacks `'3'` / `?? 3` referentes a estas duas taxas por `'6'` / `?? 6` (plataforma) e `'0'` / `?? 0` (sócio).
- Linha 2233 do card "A plataforma retém": ajustar fallback para `6 + 0`.

## Fora de escopo (não será tocado)
- Vendas antigas, `split_snapshot_*` em `sales`, logs, webhooks, confirmação de pagamento, representantes, wallet, integração Asaas, RLS, motor progressivo (`platform-fee-engine.ts` continua sendo a fonte oficial do cálculo monetário — a coluna `platform_fee_percent` segue funcionando como gate operacional/exibição).
- Testes que usam `platform_fee_percent: 3` como fixture (não impactam comportamento em produção).

## Resultado esperado
- Aba **Pagamentos** de qualquer empresa: Taxa Plataforma `6%`, Sócio `0%`, Total `6.0%`, Empresa recebe `94.0%`.
- Novas empresas criadas via SaaS ou inserção direta já nascem com 6/0.
