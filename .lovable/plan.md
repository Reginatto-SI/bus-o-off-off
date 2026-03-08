

## Plano: Controle de Exibição para Parceiros Comerciais

### 1. Migration — Adicionar colunas de visibilidade na tabela `commercial_partners`

```sql
ALTER TABLE public.commercial_partners
  ADD COLUMN show_on_showcase boolean NOT NULL DEFAULT false,
  ADD COLUMN show_on_event_page boolean NOT NULL DEFAULT false,
  ADD COLUMN show_on_ticket boolean NOT NULL DEFAULT false;
```

### 2. Tipos TypeScript — `src/types/database.ts`

Adicionar os 3 novos campos à interface `CommercialPartner`:
- `show_on_showcase: boolean`
- `show_on_event_page: boolean`
- `show_on_ticket: boolean`

### 3. Tela Admin — `src/pages/admin/CommercialPartners.tsx`

**Wizard: Adicionar etapa 5 "Exibição"**

- Atualizar `WIZARD_STEPS` para incluir `{ label: 'Exibição', icon: Eye }` (5 etapas)
- Adicionar campos ao `form` state: `show_on_showcase`, `show_on_event_page`, `show_on_ticket` (booleans)
- Criar `renderExibicaoFields()` com 3 checkboxes:
  - "Mostrar na vitrine pública"
  - "Mostrar na página de eventos"
  - "Mostrar na passagem"
- Sugerir defaults ao mudar `partner_tier`:
  - **basico**: vitrine ✔, evento ✖, passagem ✖
  - **destaque**: vitrine ✔, evento ✔, passagem ✖
  - **premium**: vitrine ✔, evento ✔, passagem ✔
  - Usuário pode alterar manualmente
- Atualizar `wizardStep === 5` como etapa final ("Finalizar cadastro"), ajustar step 4 para "Continuar"
- Incluir os 3 campos em `buildPartnerData()`, `handleWizardStep1Save` (defaults), `handleEdit`, `resetForm`
- Adicionar aba "Exibição" no modo edição (tabs)

### 4. Vitrine Pública — `src/pages/public/PublicCompanyShowcase.tsx`

Adicionar seção "Parceiros oficiais" **após** a seção de confiança e **antes** dos patrocinadores:

- Buscar `commercial_partners` onde `show_on_showcase = true` e `status = 'ativo'` e `company_id` da empresa
- Exibir grid de logos (mesmo padrão visual dos patrocinadores)
- Cada logo pode linkar para `website_url` se existir
- Título: "Parceiros oficiais"
- Separar visualmente dos patrocinadores

### Arquivos modificados

| Arquivo | Ação |
|---------|------|
| Migration SQL | 3 colunas boolean |
| `src/types/database.ts` | 3 campos na interface |
| `src/pages/admin/CommercialPartners.tsx` | Etapa 5 wizard + aba edição + defaults por tier |
| `src/pages/public/PublicCompanyShowcase.tsx` | Seção "Parceiros oficiais" |

