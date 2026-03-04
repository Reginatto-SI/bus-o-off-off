

# Hardening Fase 1 — Plano de Implementação

## Resumo das 4 correções

Faz total sentido. Todas as lacunas são reais e cirúrgicas. Segue o plano.

---

## A. RLS `sponsors` — isolamento por tenant (Migration)

**Escolha: Opção 1** (mais simples, sem RPC novo).

Substituir a policy pública atual por uma que exija empresa ativa e publicável:

```sql
DROP POLICY IF EXISTS "Public can view active sponsors" ON public.sponsors;

CREATE POLICY "Public can view active sponsors of public companies"
  ON public.sponsors FOR SELECT
  USING (
    status = 'ativo'
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = sponsors.company_id
        AND c.is_active = true
        AND c.public_slug IS NOT NULL
    )
  );
```

Isso elimina a dependência do filtro client-side para isolamento.

---

## B. `/admin/empresa` — alinhar permissões (Company.tsx)

Linha 548: `const isAdmin = isGerente || isOperador;` permite operador submeter.

**Correção:** Trocar para `const canEdit = isGerente || isDeveloper;` e bloquear operador no submit com toast. O banco já bloqueia via RLS (só gerente/developer), então a UI deve refletir isso.

- No `handleSubmit`: return early com toast se `!canEdit`
- Desabilitar botão de salvar para operador (read-only)

---

## C. `/admin/patrocinadores` — CRUD completo (Sponsors.tsx)

3 ajustes:

1. **Update com company_id**: linha 225, adicionar `.eq('company_id', activeCompanyId!)` ao update. Também em `handleToggleStatus` (linha 284) e `handleImageUpload` (linha 332).

2. **Delete**: adicionar `handleDelete` com confirmação via `AlertDialog` e query `.delete().eq('id', sponsorId).eq('company_id', activeCompanyId!)`. Adicionar item "Excluir" no `getSponsorActions`.

3. **Ordenação**: linha 133-134, trocar `created_at DESC` para `created_at ASC` (já tem `carousel_order ASC`).

---

## D. Público — whitelist de colunas em events (PublicCompanyShowcase.tsx)

Campos usados por `EventCard` e `EventCardFeatured`:
- `id`, `name`, `date`, `city`, `image_url`, `unit_price`, `status`, `is_archived`, `company_id`
- Join company: `id`, `name`, `logo_url` (+ `whatsapp` para link de ajuda)

Substituir `select('*', ...)` por:
```ts
.select(`
  id, name, date, city, image_url, unit_price, status, is_archived, company_id,
  company:companies!events_company_id_fkey(
    id, name, logo_url, whatsapp
  )
`)
```

---

## Arquivos a modificar

| Arquivo | Mudança |
|---------|---------|
| Migration SQL | RLS sponsors mais restritiva |
| `Company.tsx` | Bloquear submit para operador |
| `Sponsors.tsx` | Update com company_id, delete, ordenação ASC |
| `PublicCompanyShowcase.tsx` | Whitelist de colunas em events |

