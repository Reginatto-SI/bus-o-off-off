

## Plano: Padronizar Patrocinadores para usar Logo em vez de Banner

### Escopo

Renomear conceito "Banner" → "Logo" em toda a UI de patrocinadores. Ajustar dimensões do preview para formato quadrado. O campo `banner_url` no banco **permanece inalterado** (não renomear coluna) — apenas a UI muda.

### Arquivos a modificar

#### 1. `src/pages/admin/Sponsors.tsx`

- **Wizard step label** (linha 85): `'Banner'` → `'Logo'`
- **Constante** (linha 81): `SPONSOR_BANNER_BUCKET` → `SPONSOR_LOGO_BUCKET` (opcional, cosmético)
- **Função `renderBannerFields`** → renomear para `renderLogoFields`
- **Label** (linha 571): `"Banner do patrocinador"` → `"Logo do patrocinador"`
- **Preview container** (linha 575): mudar de `h-[150px] w-full max-w-[600px]` para `h-[200px] w-[200px]` (quadrado)
- **alt texts**: trocar "Banner" → "Logo"
- **Placeholder vazio** (linha 647): mesmas dimensões quadradas, texto `"Adicionar logo (512×512)"` e `"Tamanho ideal: 512×512px · PNG ou JPG · Fundo transparente recomendado"`
- **Toasts**: `"Banner enviado"` → `"Logo enviada"`, `"Banner removido"` → `"Logo removida"`
- **aria-labels**: atualizar
- **Tabela** (linhas 1025-1035): trocar `w-24` para `w-10` (quadrado), alt `"Banner ..."` → `"Logo ..."`, fallback `"Sem banner"` → `"Sem logo"`
- **Dialog preview** (linhas 1054-1070): título `"Pré-visualização do banner"` → `"Pré-visualização da logo"`, alt atualizado
- **object-cover** na tabela → `object-contain` para logos quadradas

#### 2. `src/pages/public/PublicCompanyShowcase.tsx`

- Nenhuma mudança funcional necessária — já usa `banner_url` como `object-contain` em grid de logos. Manter como está.

#### 3. `src/types/database.ts`

- Interface `Sponsor` já usa `banner_url` — **manter** (reflete a coluna real do banco). Sem alteração.

#### 4. Edge function `ticket-lookup/index.ts` e páginas `Confirmation.tsx`, `Sales.tsx`

- Sem alteração — já mapeiam `banner_url` para `logo_url` no TicketCardData.

### Sem migration

O campo `banner_url` permanece no banco. Apenas labels e dimensões visuais mudam. Dados existentes continuam funcionando.

### Resultado

- Wizard de patrocinadores: aba "Logo" com upload quadrado 512×512
- Tabela: thumbnails quadradas com `object-contain`
- Textos e toasts consistentes com "logo"
- Nenhuma quebra de dados existentes

