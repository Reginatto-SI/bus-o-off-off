

# Plano: Corrigir Build Errors + Email com Resend

## Parte 1: Corrigir 3 Build Errors

### 1A. BenefitPrograms.tsx (linhas 1352 e 1502)
O `StatusBadge` aceita `StatusType` que inclui `'ativo'` e `'inativo'`, mas o código passa `'active'` / `'inactive'`.

**Correção:** Trocar `'active'` por `'ativo'` e `'inactive'` por `'inativo'`, e remover `customLabel` (que não existe no componente).

```tsx
// Linha 1352
<StatusBadge status={record.status === 'ativo' ? 'ativo' : 'inativo'} />

// Linha 1502
<StatusBadge status={program.status === 'ativo' ? 'ativo' : 'inativo'} />
```

### 1B. benefitEligibility.ts (linha 100)
A query tem relação ambígua entre `benefit_programs` e `benefit_program_eligible_cpf`. Precisa hint explícito na select.

**Correção:** Adicionar hint de coluna na relação e usar cast via `unknown`:

```typescript
program:benefit_programs!benefit_program_eligible_cpf_benefit_program_id_fkey(*)
```

E no cast (linha 100):
```typescript
const rows = (data ?? []) as unknown as Array<...>
```

---

## Parte 2: Integração de E-mail com Resend

### Situação atual
O projeto já tem domínio `notify.www.smartbusbr.com.br` configurado no Lovable Cloud, com status **Pending** (DNS ainda não verificado). O `auth-email-hook` já existe e usa o sistema de fila do Lovable (`enqueue_email`). Os templates já estão padronizados com "SmartBus BR".

**Causa raiz dos e-mails não chegarem:** O DNS do domínio de envio ainda não foi verificado. Enquanto o DNS não propagar, nenhum e-mail customizado é enviado.

### Sobre usar Resend
O projeto já tem infraestrutura de e-mail do Lovable Cloud configurada para `notify.www.smartbusbr.com.br`. Usar Resend no mesmo subdomínio causaria conflito de DNS (os registros NS já apontam para os nameservers do Lovable).

**Opções para o usuário:**
1. **Completar verificação DNS do Lovable Cloud** — Caminho mais simples. Sem mudança de código. Basta verificar os registros NS no provedor de domínio. Tudo já está implementado.
2. **Desativar Lovable Emails e usar Resend** — Requer remover registros NS do domínio, desativar Lovable Emails, configurar Resend API Key como secret, e reescrever o `auth-email-hook` para chamar a API do Resend diretamente.

**Recomendação:** Perguntar ao usuário qual caminho prefere antes de implementar, já que ambos são válidos mas mutuamente exclusivos no mesmo subdomínio.

### Arquivos alterados
- `src/pages/admin/BenefitPrograms.tsx` — fix StatusBadge status values
- `src/lib/benefitEligibility.ts` — fix ambiguous relationship hint + cast

