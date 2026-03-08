

## Plano: Redes sociais da empresa (cadastro + vitrine pública)

### Etapa 1 — Migração de banco de dados

Adicionar 7 colunas na tabela `companies`:

```sql
ALTER TABLE public.companies
  ADD COLUMN social_instagram text DEFAULT NULL,
  ADD COLUMN social_facebook text DEFAULT NULL,
  ADD COLUMN social_tiktok text DEFAULT NULL,
  ADD COLUMN social_youtube text DEFAULT NULL,
  ADD COLUMN social_telegram text DEFAULT NULL,
  ADD COLUMN social_twitter text DEFAULT NULL,
  ADD COLUMN social_website text DEFAULT NULL;
```

Nenhuma RLS adicional necessaria (herda as policies existentes de `companies`).

---

### Etapa 2 — Aba "Redes Sociais" no admin (`src/pages/admin/Company.tsx`)

- Adicionar nova `TabsTrigger` com valor `"redes"` e icone (ex: `Share2` do lucide) entre "Observacoes" e "Identidade Visual"
- Adicionar `TabsContent` com 7 campos `Input` opcionais (Instagram, Facebook, TikTok, YouTube, Telegram, X/Twitter, Site oficial)
- Validar formato basico de URL no submit (regex simples `https?://...`)
- Adicionar campos ao `form` state e ao `payload` de save
- Carregar valores existentes no `fetchCompany`

---

### Etapa 3 — Atualizar tipo `Company` (`src/types/database.ts`)

Adicionar os 7 campos opcionais ao type `Company`:

```typescript
social_instagram: string | null;
social_facebook: string | null;
social_tiktok: string | null;
social_youtube: string | null;
social_telegram: string | null;
social_twitter: string | null;
social_website: string | null;
```

---

### Etapa 4 — Vitrine publica (`src/pages/public/PublicCompanyShowcase.tsx`)

- Adicionar os campos sociais ao `PublicCompanyData` type e a query `select()`
- Criar componente inline (ou seção) de icones sociais logo abaixo dos CTAs do hero (apos linha ~407, antes do fechamento da `</section>`)
- Renderizar apenas redes preenchidas
- Icones: usar SVGs inline para Instagram, Facebook, TikTok, YouTube, Telegram, X (lucide nao tem todos esses)
- Links abrem em nova aba (`target="_blank" rel="noopener noreferrer"`)
- Layout: `flex gap-3 justify-center` horizontal, centralizado
- Mostrar a seção inteira somente se pelo menos 1 rede estiver preenchida

---

### Resumo

- 1 migração SQL (7 colunas em `companies`)
- 3 arquivos modificados: `Company.tsx`, `PublicCompanyShowcase.tsx`, `database.ts`
- Nenhuma alteração de RLS (herda policies existentes)
- Nenhuma edge function afetada

