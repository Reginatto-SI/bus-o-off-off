

# Personalização da Vitrine Pública — Plano de Implementação

## Resumo

Sim, dá para fazer. O escopo é grande mas bem definido. Vou dividir em 4 blocos: migrations, admin Company, admin Sponsors (multi-tenant), e vitrine pública. Opcionalmente, o header público com indicador de login.

---

## 1. Migrations (banco de dados)

### 1a. Novos campos em `companies`
```sql
ALTER TABLE public.companies
  ADD COLUMN cover_image_url text,
  ADD COLUMN intro_text text,
  ADD COLUMN background_style text NOT NULL DEFAULT 'solid';

-- CHECK constraint para enum fechado
ALTER TABLE public.companies
  ADD CONSTRAINT companies_background_style_check
  CHECK (background_style IN ('solid', 'subtle_gradient', 'cover_overlay'));
```

### 1b. Adicionar `company_id` em `sponsors`
```sql
ALTER TABLE public.sponsors
  ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- Backfill: preencher com a primeira empresa existente (MVP single-company)
UPDATE public.sponsors
  SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
  WHERE company_id IS NULL;

-- Tornar NOT NULL após backfill
ALTER TABLE public.sponsors
  ALTER COLUMN company_id SET NOT NULL;

-- Índice para queries públicas
CREATE INDEX idx_sponsors_company_status_order
  ON public.sponsors (company_id, status, carousel_order, created_at);
```

### 1c. Atualizar RLS de `sponsors`
Substituir as policies existentes:
- **Admin (gerente)**: CRUD apenas onde `company_id` pertence à empresa do usuário
- **Público**: SELECT apenas `status='ativo'` (já existe, mas adicionar filtro `company_id` implícito via query)

```sql
-- Drop existing
DROP POLICY IF EXISTS "Admins can manage sponsors" ON public.sponsors;
DROP POLICY IF EXISTS "Admins can view sponsors" ON public.sponsors;
DROP POLICY IF EXISTS "Public can view active sponsors" ON public.sponsors;

-- Gerente pode CRUD sponsors da sua empresa
CREATE POLICY "Gerente can manage sponsors"
  ON public.sponsors FOR ALL TO authenticated
  USING (
    (has_role(auth.uid(), 'gerente') OR is_developer(auth.uid()))
    AND user_belongs_to_company(auth.uid(), company_id)
  )
  WITH CHECK (
    (has_role(auth.uid(), 'gerente') OR is_developer(auth.uid()))
    AND user_belongs_to_company(auth.uid(), company_id)
  );

-- Público pode ver sponsors ativos
CREATE POLICY "Public can view active sponsors"
  ON public.sponsors FOR SELECT
  USING (status = 'ativo');
```

### 1d. Atualizar RLS de `companies` para novos campos públicos
A policy "Public can view companies with public slug" já permite SELECT quando `public_slug IS NOT NULL`. Os novos campos (`cover_image_url`, `intro_text`, `background_style`) serão acessíveis via essa policy. A query pública usará select estrito de colunas (sem `select('*')`).

---

## 2. Types (database.ts)

Atualizar `Company` interface:
- Adicionar `cover_image_url: string | null`
- Adicionar `intro_text: string | null`
- Adicionar `background_style: 'solid' | 'subtle_gradient' | 'cover_overlay'`

Atualizar `Sponsor` interface:
- Adicionar `company_id: string`

---

## 3. Admin — Company.tsx

### Nova aba "Vitrine Pública" (ou seção dentro de "Identidade Visual")
Adicionar uma nova `TabsTrigger` "Vitrine" com:
- **Imagem de capa**: upload (mesmo padrão do logo, bucket `company-logos`) ou URL
- **Texto de apresentação**: `<Textarea>` com limite 400 chars + contador
- **Estilo de fundo**: `<Select>` com 3 opções (`solid`, `subtle_gradient`, `cover_overlay`)

Novos campos no `form` state: `cover_image_url`, `intro_text`, `background_style`.

Incluir no `payload` do `handleSubmit`. Incluir no `hydrateFormFromCompany`.

Visibilidade: somente `isGerente || isDeveloper`. Operador vê a aba mas campos desabilitados (ou aba oculta).

---

## 4. Admin — Sponsors.tsx (multi-tenant)

Mudanças mínimas:
- Importar `activeCompanyId` do `useAuth()`
- Em `fetchSponsors`: adicionar `.eq('company_id', activeCompanyId)` + guard
- Em `handleSubmit` (insert): incluir `company_id: activeCompanyId` no payload
- Em `handleToggleStatus`: já usa `.eq('id')`, OK
- Manter acesso restrito a `isGerente` (já tem o redirect)

---

## 5. Público — PublicCompanyShowcase.tsx

### Query atualizada (select estrito)
```ts
.select('id, name, trade_name, logo_url, public_slug, primary_color, cover_image_url, intro_text, background_style')
```

### Hero section
- Se `cover_image_url`: imagem de fundo com overlay
- Se não: fundo sólido usando `primary_color`
- `background_style` controla o visual:
  - `solid`: bg com primary_color
  - `subtle_gradient`: gradiente suave
  - `cover_overlay`: capa com overlay escuro

### Texto de apresentação
- Renderizar `intro_text` se preenchido, abaixo do hero

### Seção Patrocinadores
Nova query:
```ts
supabase.from('sponsors')
  .select('id, name, banner_url, link_type, site_url, whatsapp_phone, whatsapp_message')
  .eq('company_id', companyData.id)
  .eq('status', 'ativo')
  .order('carousel_order').order('created_at')
```
- Grid responsivo com logo/banner + link
- Ocultar seção se vazio

### Eventos
- Manter exatamente como está (carrossel + grid)

---

## 6. (Opcional) Header público — indicador de login

No `PublicLayout.tsx`:
- Importar `useAuth` (session check leve)
- Se autenticado: substituir os links desktop por menu de usuário com avatar/nome
  - Items: "Minhas Passagens", "Área Administrativa" (se `isGerente || isOperador || isDeveloper`), "Sair"
- Se não autenticado: manter comportamento atual
- No mobile sheet: adicionar os mesmos items condicionais

---

## Arquivos a modificar

| Arquivo | Mudanças |
|---------|----------|
| Migration SQL | Novos campos + company_id sponsors + RLS |
| `src/types/database.ts` | Company + Sponsor types |
| `src/pages/admin/Company.tsx` | Nova aba Vitrine (capa, texto, estilo) |
| `src/pages/admin/Sponsors.tsx` | Multi-tenant (company_id filter + insert) |
| `src/pages/public/PublicCompanyShowcase.tsx` | Hero + intro + patrocinadores |
| `src/components/layout/PublicLayout.tsx` | Indicador de login (opcional) |

---

## Ordem de execução

1. Migration SQL (campos + RLS)
2. Types update
3. Sponsors multi-tenant
4. Company admin (aba vitrine)
5. PublicCompanyShowcase (hero + intro + sponsors)
6. PublicLayout (header login indicator)

