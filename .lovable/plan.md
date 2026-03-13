

## Plan: Address Validation Modal Between Step 2 and Step 3 of Asaas Wizard

### What Changes

**1. New component: `AsaasAddressModal`** (`src/components/admin/AsaasAddressModal.tsx`)

A compact Dialog modal with 6 address fields pre-filled from company data. Fields: Endereço, Numero, Bairro, CEP, Cidade, UF. On save, updates the `companies` table directly and closes, allowing the wizard to proceed. Uses existing UI components (Dialog, Input, Label, Select) and `brazilianStates` from `cityUtils`.

**2. Modify: `AsaasOnboardingWizard.tsx`**

- Expand `AsaasOnboardingCompanyData` interface to include address fields: `address`, `addressNumber`, `province`, `postalCode`, `city`, `state`.
- Add state for the address modal (`showAddressModal`).
- When user clicks "Continuar" on Step 2, validate address fields. If any are missing/empty, open `AsaasAddressModal` instead of advancing. If all present, advance to Step 3.
- On successful save from `AsaasAddressModal`, update internal company data and proceed to Step 3.
- Update Step 3 content to clarify that the Asaas will send an email with a password setup link after account creation.

**3. Modify: `Company.tsx`**

- Update `getAsaasWizardCompanyData()` to pass address fields from the form state to the wizard.

### Address Validation Logic

Before advancing from Step 2 to Step 3, check:
- `address` is non-empty
- `addressNumber` is non-empty
- `province` is non-empty
- `postalCode` has exactly 8 digits
- `city` is non-empty
- `state` is exactly 2 chars

### Address Modal Behavior

- Header: "Complete o endereço da empresa"
- Brief message explaining why it's needed
- 6 fields in a compact grid layout
- CEP field strips non-digits on save
- Save button updates `companies` table, then closes modal and advances wizard to Step 3
- Cancel returns to Step 2 without advancing

### Step 3 Communication Update

Add explicit mention that:
- The password is not created inside Smartbus BR
- Asaas will send an email to the registered address with a link to set up the account password

### Income/Revenue

No changes - `incomeValue` remains internal in the edge function, never shown in the wizard UI.

### Files Modified

- `src/components/admin/AsaasAddressModal.tsx` (new)
- `src/components/admin/AsaasOnboardingWizard.tsx` (modified)
- `src/pages/admin/Company.tsx` (modified)

