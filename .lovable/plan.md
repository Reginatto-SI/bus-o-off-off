

# Diagnostic Report: Asaas Account Linking Flow in `/admin/empresa`

## Files Involved

| File | Role |
|------|------|
| `src/pages/admin/Company.tsx` | Main page; loads company, renders Payments tab, opens wizard |
| `src/components/admin/AsaasOnboardingWizard.tsx` | Wizard modal (create/link flows) |
| `supabase/functions/create-asaas-account/index.ts` | Edge function handling create, link_existing, revalidate, disconnect modes |
| `supabase/functions/_shared/runtime-env.ts` | Host-based environment resolution |
| `src/hooks/use-runtime-payment-environment.ts` | Frontend environment hook |
| `src/lib/asaasIntegrationStatus.ts` | Snapshot for visual status card |
| `src/lib/asaasError.ts` | Error message extraction |

---

## Flow Sequence (Current)

1. User opens `/admin/empresa` → `fetchCompany()` loads company by `activeCompanyId`
2. `useRuntimePaymentEnvironment()` resolves environment (calls `get-runtime-payment-environment` edge function)
3. User clicks "Criar conta Asaas" or "Já tenho conta Asaas" → sets `asaasOnboardingMode`
4. User clicks "Iniciar conexão guiada" or "Abrir wizard de vínculo" → sets `asaasWizardOpen = true`
5. `AsaasOnboardingWizard` opens with `companyData` from `getAsaasWizardCompanyData()`
6. User navigates wizard steps, selects environment
7. On submit: calls `supabase.functions.invoke('create-asaas-account', { body: { company_id, mode, api_key, target_environment } })`
8. Edge function processes request

---

## Critical Bug #1: Structural nesting error in edge function (BLOCKS link_existing and create)

**Location**: `supabase/functions/create-asaas-account/index.ts`, lines 338-703

The `mode === "revalidate"` block starting at line 339 **never closes properly**. Here's the structure:

```text
Line 339: if (mode === "revalidate") {
Line 387:   try {
Line 513:     }  // closes the if (!walletId) block inside revalidate
Line 515:     if (mode === "link_existing" && api_key) {  ← INSIDE revalidate's try block!
Line 703:     }  // closes link_existing
Line 705:     // MODE: Create subaccount
             // Also INSIDE revalidate's try block!
```

**This means**: When `mode === "link_existing"`, the code enters the `if (mode === "revalidate")` check at line 339. Since `mode` is NOT `"revalidate"`, **the entire link_existing and create blocks are skipped**. The function falls through to the end and returns nothing meaningful, or hits an unrelated catch.

Wait — let me re-read this more carefully. The `if (mode === "revalidate")` block at line 339... let me trace the braces.

Actually, looking again at line 513, the `}` closes the `if (!walletId)` block. Then line 515 starts `if (mode === "link_existing")` — but is this still inside the `revalidate` block's `try`? Let me trace:

- Line 339: `if (mode === "revalidate") {`
- Line 387: `try {`
- Line 513: `}` — closes `if (!walletId)`
- Line 515: `if (mode === "link_existing" && api_key) {` — **this is inside the revalidate try block**

**Confirmed**: `link_existing` and `create` modes are nested inside `mode === "revalidate"`, so they are **unreachable** when mode is `link_existing` or `create`. The function should be returning early or falling through without processing.

**However**, the edge function logs from the user's session show `link_existing` WAS reached and the `walletId` error occurred. This contradicts the nesting theory.

Let me re-examine. Looking at line 339: `if (mode === "revalidate")` — if mode is `link_existing`, this check fails and execution skips to... what? Let me check what comes AFTER the revalidate block closes.

Actually, the problem is I can't see all braces clearly. The revalidate `try/catch` may have been closed somewhere I'm not seeing. Let me look at the code from 385 onward more carefully.

Looking at the logs: the `link_existing` mode IS being executed (we see `"onboarding_mode": "link_existing"` and walletId error). So the nesting must be fine — the `link_existing` block is NOT inside the `revalidate` block. The confusing indentation misled me.

Let me re-trace: Line 515 has indentation that's 4 spaces (top-level inside `serve`), while the revalidate block content at line 387 is at 6 spaces. So `link_existing` at line 515 is at the same level as `if (mode === "revalidate")`. The nesting is actually correct.

---

## What Actually Works

1. ✅ Company loads correctly (`fetchCompany` with `activeCompanyId`)
2. ✅ `company_id` is passed correctly via `getAsaasWizardCompanyData()` → `editingId`
3. ✅ Environment selection works (frontend sends `target_environment`)
4. ✅ Edge function receives request, authenticates user, finds company
5. ✅ Edge function calls Asaas `/myAccount` API successfully
6. ✅ Error messages from Asaas are surfaced to user

## What Doesn't Work

1. **walletId extraction fails for sub-accounts** — The Asaas `/myAccount` endpoint for sub-accounts returns a payload without `walletId`, `wallet.id`, or `id` fields. The 3-tier fallback (myAccount → /wallets → /accounts) still can't find a usable ID.

2. **"Automático pelo host" option still exists** — Despite a previous fix that was supposed to remove it, the wizard at lines 314-321 still shows `auto` option for developers. When selected, `effectiveTargetEnvironment` becomes `undefined`, and the edge function falls back to host resolution which always yields `sandbox` in Edge Runtime.

3. **`disconnect` mode referenced in frontend but has no handler in edge function** — `Company.tsx` line 553 sends `mode: 'disconnect'` but the edge function has no `if (mode === "disconnect")` block. This means disconnect falls through to the `create` flow.

4. **The `revalidate` block has unreachable code after the walletId check** — After line 513 (closing the `!walletId` error response), the revalidate block continues but never returns a success response for valid wallets. It falls through into the `link_existing` and `create` blocks.

---

## Root Cause of the Current Error

Based on the edge function logs, the user's last attempt was `mode: "link_existing"` in `sandbox`. The call reached `/myAccount` successfully but the response payload lacked a `walletId`:

```
response_keys: ["object", "personType", "companyType", "company", "cpfCnpj", "email", 
"responsibleName", "phone", "mobilePhone", "postalCode", "address", "addressNumber", 
"complement", "province", "city", "inscricaoEstadual", "name", "birthDate", "status", 
"denialReason", "incomeValue"]
```

Note: **there is no `id` field in this response**. This is the sub-account's `/myAccount` which doesn't return the account's own ID. The `/wallets` fallback also failed, and the `/accounts` platform lookup also didn't yield a result.

**The real problem is**: for this specific Asaas sub-account, none of the API endpoints expose a walletId or account ID when queried by the sub-account's own API key. The platform `/accounts` search may also fail if the search parameters don't match.

---

## Where Exactly It Breaks

**Location**: Edge function, after all 3 fallback tiers fail to extract walletId.
**Stage**: Backend (edge function), Asaas API response processing.
**NOT** in: frontend click, company loading, environment resolution, or payload assembly.

---

## Recommended Minimum Fix (Next Step)

1. **Remove `auto` environment option from wizard** — It was supposed to be removed but is still present at lines 314-321 of `AsaasOnboardingWizard.tsx`. Default to `sandbox` for developers.

2. **Fix walletId extraction for sub-accounts** — The Asaas sub-account `/myAccount` endpoint doesn't return `id`. For `link_existing` mode, **use the account's own API key prefix** (first segment before `$`) as account identifier, or accept that some sub-accounts don't expose walletId and instead persist the API key without walletId, then use it for payment operations directly.

3. **Add `disconnect` handler** — The edge function needs an explicit `if (mode === "disconnect")` block before falling through to create.

4. **Fix revalidate block flow** — Ensure the revalidate block returns a success response when wallet IS found, instead of falling through.

5. **Add diagnostic panel** (as requested) — Add a developer-only panel in the Payments tab showing: current environment, execution steps, status per step, technical error, readable error, copy diagnostic button.

---

## Plan for Developer Diagnostic Panel

### File: `src/pages/admin/Company.tsx`

Add a collapsible developer-only section inside the Payments tab (visible when `isDeveloper` is true):

**Features:**
- Current resolved environment + source (build/edge/browser_fallback)
- Company ID loaded
- Asaas snapshot status per environment
- Last wizard action attempted + result
- Edge function call status (pending/success/error with HTTP code)
- Raw error message from edge function
- "Copy diagnostic" button that copies a JSON blob to clipboard

**Implementation approach:**
- Create a new component `AsaasDiagnosticPanel` in `src/components/admin/`
- Accept props: `company`, `runtimeEnvironment`, `runtimeSource`, `asaasSnapshot`, `editingId`
- Render conditionally with `isDeveloper`
- Include a "Test connection" button that calls `create-asaas-account` with `mode: 'revalidate'` and captures full response for display
- Show step-by-step execution trace

### File: `supabase/functions/create-asaas-account/index.ts`

- Add `mode === "disconnect"` handler
- Fix revalidate block to return success when wallet is found  
- Remove dead code paths
- For `link_existing`: if walletId can't be extracted but `/myAccount` succeeded (HTTP 200), persist the API key and mark as partially configured instead of failing hard

### File: `src/components/admin/AsaasOnboardingWizard.tsx`

- Remove `auto` option from environment selector (lines 314-321)
- Default `targetEnvironment` state to `'sandbox'` instead of `'auto'`

