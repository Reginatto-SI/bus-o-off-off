# Análise 99 — Ajuste final de layout `/admin/servicos`

## 1) Comparação entre `/admin/servicos` e `/admin/frota`

### `/admin/frota` (referência consolidada)
- Estrutura base: `AdminLayout` + `<div className="page-container">`.
- Sequência de blocos: `PageHeader` → `FilterCard` → conteúdo (loading/empty/table/card).
- Não usa `space-y-*` no container principal.
- Não usa `mb-*` no `FilterCard` para separar do card/listagem.

### `/admin/servicos` (antes do refinamento final)
- Já estava com `AdminLayout` + `page-container`.
- Mantinha `FilterCard` com `className="mb-6"`, o que criava variação de espaçamento em relação ao padrão real de `/admin/frota`.

## 2) Padrão identificado (container + espaçamento)

Padrão real copiado de `/admin/frota`:
1. `AdminLayout` como wrapper da página.
2. Container principal `page-container`.
3. Blocos em ordem direta, sem margem manual entre `PageHeader`, `FilterCard` e card principal.
4. Espaçamento percebido é definido pelo comportamento padrão dos próprios componentes (principalmente `PageHeader`) e não por `mb-*`/`mt-*` locais.

## 3) Ajustes realizados

- Removido `className="mb-6"` do `FilterCard` em `/admin/servicos`.
- Mantido `page-container` para seguir exatamente o mesmo container principal de `/admin/frota`.
- Mantido `Card` principal com `CardContent className="p-0"` (padrão de listagem em tabela).
- Mantidos comportamento e fluxo funcional (CRUD, botão “Novo serviço”, guards de acesso, consultas por `company_id`).

## 4) Arquivos alterados

- `src/pages/admin/Services.tsx`
- `docs/Analises/analise-99-ajuste-layout-servicos.md`

## 5) Checklist visual validado

- [x] Mesmo container principal de `/admin/frota` (`page-container`).
- [x] Sem variação local de espaçamento entre `FilterCard` e card principal (`mb-*` removido).
- [x] Card principal mantém borda/radius/sombra padrão de `Card`.
- [x] EmptyState permanece centralizado pelo componente padrão (`empty-state`).
- [x] `PageHeader` sem margem arbitrária adicionada na página.
- [x] Página continua no `AdminLayout`.
- [x] Nenhuma alteração de regra de negócio, API, RLS, rotas ou hooks.
