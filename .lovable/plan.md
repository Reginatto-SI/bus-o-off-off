

# Hardening Fase 1 — Implementado ✅

## Checklist final

- [x] Público anon NÃO consegue listar sponsors ativos de outras empresas por falha de filtro client-side
- [x] Operador não consegue salvar em `/admin/empresa` (comportamento consistente com RLS)
- [x] `/admin/patrocinadores` tem CRUD completo (inclui DELETE)
- [x] Update/Delete de sponsor sempre incluem filtro por `company_id`
- [x] Ordenação admin sponsors: `carousel_order ASC, created_at ASC`
- [x] Vitrine pública não usa `events.select('*')` (whitelist aplicada)
- [x] Build ok

## Mudanças realizadas

| Arquivo | Mudança |
|---------|---------|
| Migration SQL | RLS sponsors: policy pública exige `company.is_active=true AND public_slug IS NOT NULL` |
| `Company.tsx` | Submit bloqueado para operador (`canEdit = isGerente \|\| isDeveloper`), botão desabilitado |
| `Sponsors.tsx` | Update/toggle/upload com `.eq('company_id')`, delete com AlertDialog, ordenação ASC |
| `PublicCompanyShowcase.tsx` | Whitelist de 9 colunas + join company(id, name, logo_url, whatsapp) |
