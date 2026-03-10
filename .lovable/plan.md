

# Plan: Refactor Partners + Company Payments for Asaas Split

## Overview

Migrate the partners (socios) screen and company payment configuration from legacy Stripe model to Asaas-native split logic. The `partner_split_percent` field on companies changes meaning: it now represents the **socio's direct percentage in the split** (not a % of the platform fee).

## Database Changes

**Migration SQL:**
1. Add `asaas_wallet_id` column to `partners` table (text, nullable)
2. No need to drop `stripe_account_id` or `split_percent` — keep for history but stop using in UI

## Escopo 1 — `/admin/socios` (Partners.tsx)

Refactor the page to:
- Remove Stripe Account ID field, replace with **Asaas Wallet ID** (`asaas_wallet_id`)
- Remove Split (%) column and field entirely — percentage is now per-company, not per-partner
- Add validation: only 1 active partner allowed. On save, if status=ativo, check if another active partner exists and block with clear message
- Update all labels/descriptions to use "Sócio" / "Asaas Wallet ID" terminology
- Table columns: Nome, Asaas Wallet ID, Status, Ação
- Form fields: Nome, Asaas Wallet ID, Status, Notas
- Helper text explaining this is a technical registry — percentage is configured per company

## Escopo 2 — `/admin/empresa` Payments tab (Company.tsx)

Refactor the Developer Only card:
- Rename "Repasse ao Parceiro (%)" to **"Taxa do Sócio (%)"**
- Change description to explain the new formula
- Add computed display below inputs:
  - **Taxa total da plataforma**: `platform_fee_percent + partner_split_percent`
  - **Empresa receberá**: `100 - total`
- Add validation: sum cannot exceed 100
- If `partner_split_percent > 0` but no active partner exists, show warning alert
- Remove any Stripe references in labels/comments

## Escopo 3 — Split logic (create-asaas-payment edge function)

Update `create-asaas-payment/index.ts`:
- Fetch `partner_split_percent` from company alongside existing fields
- Fetch active partner from `partners` table (status='ativo', limit 1)
- Build split array dynamically:
  - **Always**: company wallet with `100 - (platform_fee + partner_fee)` percent
  - **If active partner exists AND partner_split_percent > 0 AND has valid asaas_wallet_id**: add partner wallet entry
  - **Otherwise**: company gets `100 - platform_fee` percent, no partner in split
- Validate total percentages before creating payment

## Escopo 4 — Nomenclature cleanup

- Partners.tsx: all Stripe references → Asaas
- Company.tsx: "parceiro" → "sócio" in the developer card
- create-asaas-payment: update comments
- types/database.ts: Partner interface — add `asaas_wallet_id` field

## Files to modify

1. `supabase/migrations/` — new migration for `asaas_wallet_id` on partners
2. `src/pages/admin/Partners.tsx` — full refactor
3. `src/pages/admin/Company.tsx` — refactor developer card (lines ~1377-1431)
4. `supabase/functions/create-asaas-payment/index.ts` — dynamic split logic
5. `src/types/database.ts` — add `asaas_wallet_id` to Partner interface

