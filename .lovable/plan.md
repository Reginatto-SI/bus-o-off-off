

# Fase 2 — Modo Edição Inline na Vitrine Pública

## Abordagem

Tudo acontece em um único arquivo principal (`PublicCompanyShowcase.tsx`) com 3 modais extraídos para componentes pequenos. Sem migrations, sem novas tabelas, sem mudanças de RLS — os campos (`cover_image_url`, `intro_text`, `background_style`) e as permissões (gerente pode UPDATE na company dele) já existem.

## Implementação

### 1. Detectar permissão de edição (no Showcase)

Usar `useAuth()` para obter `isGerente`, `activeCompanyId` e `session`. Condição:
```
const canEdit = !!session && isGerente && company?.id === activeCompanyId;
```
Se `canEdit` é false, zero UI extra é renderizado.

### 2. Estado local de modo edição

```ts
const [editMode, setEditMode] = useState(false);
const [clientView, setClientView] = useState(false);
```
- `editMode` ON + `clientView` OFF = mostra ícones de edição
- `clientView` ON = esconde tudo (simula visão do cliente)
- Quando `!canEdit`, ambos ficam false e nada aparece

### 3. Barra de controle do gerente

Renderizada apenas quando `canEdit && !clientView`:
- Faixa discreta no topo (abaixo do header, acima do hero)
- Conteúdo: Toggle "Modo edição" | Botão "Ver como cliente" | Link "Gerenciar patrocinadores → /admin/patrocinadores"
- Quando `clientView`: mostrar apenas um botão flutuante "Voltar ao modo edição" para sair da visão de cliente

### 4. Três modais de edição (componentes separados)

Criar `src/components/public/showcase/`:

**A) `EditCoverModal.tsx`**
- Input URL da capa + preview da imagem
- Salvar → `supabase.from('companies').update({ cover_image_url }).eq('id', companyId)`
- Ao salvar com sucesso: atualizar state local `company` + toast

**B) `EditIntroModal.tsx`**
- Textarea com limite 400 chars + contador
- Salvar → `update({ intro_text })`

**C) `EditBackgroundStyleModal.tsx`**
- Select com 3 opções (solid, subtle_gradient, cover_overlay)
- Salvar → `update({ background_style })`

Todos os modais: Dialog do shadcn, botão salvar com loading/disabled, toast sucesso/erro, `onSave` callback que atualiza o state da company no Showcase sem refetch.

### 5. Ícones de edição nos blocos

Quando `editMode && !clientView`:
- **Hero**: ícone lápis no canto superior direito (abre EditCoverModal + EditBackgroundStyleModal agrupados ou separados — vou agrupar em um único "Editar aparência" com os dois campos no mesmo modal para simplificar UX)
- **Intro text**: ícone lápis ao lado do bloco (abre EditIntroModal)
- **Patrocinadores**: botão "Gerenciar patrocinadores" linkando para `/admin/patrocinadores`

### 6. Simplificação: agrupar Capa + Estilo em um modal

Em vez de 3 modais, fazer 2:
- **EditHeroModal**: URL da capa + select de estilo de fundo (são visualmente ligados)
- **EditIntroModal**: textarea do intro

Isso reduz cliques e é mais intuitivo.

## Arquivos

| Arquivo | Ação |
|---------|------|
| `src/components/public/showcase/EditHeroModal.tsx` | Criar — modal capa + estilo |
| `src/components/public/showcase/EditIntroModal.tsx` | Criar — modal intro text |
| `src/pages/public/PublicCompanyShowcase.tsx` | Editar — adicionar barra gerente, ícones edição, state editMode |

## Segurança

- RLS já garante que só gerente pode UPDATE na company dele
- Frontend só mostra UI de edição quando `company.id === activeCompanyId && isGerente`
- Nenhum dado novo é exposto; updates usam campos existentes

