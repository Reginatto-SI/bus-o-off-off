

## Plano: Padronização centralizada de telefone/WhatsApp

### Diagnóstico

Existem **4+ implementações duplicadas** de formatação de telefone espalhadas pelo projeto:
- `MyAccount.tsx` → `formatPhoneInput`
- `CompanyRegistration.tsx` → `formatPhone`
- `Checkout.tsx` → `formatPhoneMask`
- `Company.tsx`, `Sellers.tsx`, `Sponsors.tsx`, `CommercialPartners.tsx` → sem máscara nenhuma

O utilitário `src/lib/whatsapp.ts` já normaliza corretamente para wa.me, mas não há função centralizada de máscara/limpeza.

---

### Etapa 1 — Criar utilitário centralizado `src/lib/phone.ts`

Funções exportadas:

```typescript
/**
 * Padrão oficial de telefone no sistema:
 * - Exibição (máscara): (65) 99999-8888 (celular) ou (65) 3333-4444 (fixo)
 * - Armazenamento (banco): somente dígitos, sem DDI → 65999218888
 * - Link WhatsApp: https://wa.me/5565999218888
 */

/** Remove tudo que não é dígito. Trata +55 e 055 colados. */
export function stripPhoneToDigits(value: string): string

/** Aplica máscara BR durante digitação. Retorna string formatada. */
export function formatPhoneBR(value: string): string

/** Extrai apenas dígitos DDD+número (10-11 chars) para persistência. */
export function normalizePhoneForStorage(value: string): string

/** Valida se o número tem quantidade válida de dígitos BR (10 ou 11). */
export function isValidBRPhone(value: string): boolean
```

Reutilizar `normalizeWhatsappForWaMe` e `buildWhatsappWaMeLink` do `whatsapp.ts` existente (sem duplicar).

---

### Etapa 2 — Criar componente `PhoneInput`

`src/components/ui/phone-input.tsx`

Componente wrapper do `Input` que:
- Aplica `formatPhoneBR` no `onChange`
- Aceita colagem com +55, espaços, etc. e limpa automaticamente
- Exibe valor mascarado no input
- Expõe `onValueChange(rawDigits)` para o formulário salvar apenas dígitos

Alternativa mais simples: não criar componente, apenas usar `formatPhoneBR` inline no onChange de cada input (como já é feito em `MyAccount.tsx`). Ambas opções são viáveis; o componente dedicado é mais limpo.

---

### Etapa 3 — Aplicar em cada tela

#### `/admin/empresa` (Company.tsx)
- Campos `phone` e `whatsapp`: adicionar máscara `formatPhoneBR` no onChange
- No save: usar `normalizePhoneForStorage` antes de enviar ao banco
- No fetch: aplicar `formatPhoneBR` ao carregar dados existentes

#### `/admin/vendedores` (Sellers.tsx)
- Campo `phone`: mesmo tratamento

#### `/admin/patrocinadores` (Sponsors.tsx)
- Campos `whatsapp_phone` e `contact_phone`: mesmo tratamento

#### `/admin/parceiros` (CommercialPartners.tsx)
- Campos `whatsapp_phone` e `contact_phone`: mesmo tratamento

#### Limpeza de duplicatas
- `MyAccount.tsx`: substituir `formatPhoneInput` local por import de `phone.ts`
- `CompanyRegistration.tsx`: substituir `formatPhone` local por import
- `Checkout.tsx`: substituir `formatPhoneMask` local por import

---

### Etapa 4 — Garantir consistência do link WhatsApp

O `whatsapp.ts` já trata corretamente a geração do link. Apenas garantir que os valores salvos no banco passem por `normalizePhoneForStorage` para que `normalizeWhatsappForWaMe` funcione sem surpresas.

---

### Resumo

- 1 arquivo novo: `src/lib/phone.ts`
- 1 componente opcional: `src/components/ui/phone-input.tsx`
- 7 arquivos modificados: `Company.tsx`, `Sellers.tsx`, `Sponsors.tsx`, `CommercialPartners.tsx`, `MyAccount.tsx`, `CompanyRegistration.tsx`, `Checkout.tsx`
- 0 alterações de banco
- 0 alterações de edge functions

