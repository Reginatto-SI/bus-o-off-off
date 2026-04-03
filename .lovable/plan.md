

# Plano: Corrigir build errors + layout mobile do painel do representante

## Parte 1 — Build errors em SalesDiagnostic.tsx

Quatro erros de tipo que precisam de correção pontual:

### 1.1 `external_reference` não existe em `DiagnosticSale`
A interface `Sale` não possui `external_reference`. Linhas 1513 e 1542 acessam `relatedSale?.external_reference`.
**Correção:** Adicionar `external_reference?: string | null` à interface `DiagnosticSale` (já é um `extends` com campos adicionais).

### 1.2 Tipo de `paymentEnvironment` (linha 1545)
`relatedSale?.payment_environment` é `string` (no tipo `Sale`), mas o destino espera `"production" | "sandbox"`. 
**Correção:** Cast com `as "production" | "sandbox" | null` no valor final, ou adicionar override na interface `DiagnosticSale`.

### 1.3 `duration_ms` não existe em `SaleIntegrationLog` (linha 3208)
**Correção:** Adicionar `duration_ms?: number | null` à interface `SaleIntegrationLog`.

---

## Parte 2 — Layout mobile do painel do representante

### Causa raiz
O container raiz usa `overflow-x-hidden` para mascarar elementos que estouram a viewport. Os suspeitos reais:

1. **Grid sections sem `min-w-0`** — children de CSS grid herdam largura intrínseca do conteúdo, empurrando o grid para além da viewport.
2. **Card de compartilhamento** — a URL longa no bloco do link e os botões `w-full` dentro de um grid sem constraints.
3. **Cards mobile do ledger** — `font-mono` no sale ID pode forçar largura mínima.

### Correções propostas

**Arquivo:** `src/pages/representative/RepresentativeDashboard.tsx`

1. **Container raiz (linha 426):** Trocar `overflow-x-hidden` por `max-w-full` — remove a máscara e força contenção real.

2. **`<main>` (linha 460):** Adicionar `min-w-0 overflow-hidden` para que o grid nunca ultrapasse a viewport.

3. **Sections com grid (linhas 462, 539, 629, 726):** Adicionar `min-w-0` em cada `<section>` que é child de grid.

4. **Cards que contêm texto dinâmico (linhas 464, 515, 630, 677, 727, 817):** Adicionar `min-w-0 overflow-hidden` nos Cards problemáticos.

5. **Bloco do link oficial (linha 484):** Já tem `min-w-0` e `overflow-hidden`, porém o parent `<div className="grid gap-3">` (linha 476) precisa de `min-w-0 overflow-hidden`.

6. **Botões de ação (linhas 493-509):** O container `<div className="space-y-2">` (linha 492) precisa de `min-w-0`. Os botões com texto longo em mobile devem ter `truncate` no texto para evitar que o label force largura.

7. **Cards mobile do ledger (linha 883):** O `font-mono` no sale ID com `truncate` já está correto; garantir que o parent `<div className="min-w-0 space-y-1">` (linha 881) se mantenha.

8. **Identidade card (linhas 521-534):** Adicionar `min-w-0 truncate` no valor do nome (linha 523) para casos de nomes longos.

### Resumo da abordagem
- Tratar a causa (largura intrínseca dos children de grid/flex) e não o sintoma (overflow-x-hidden)
- Aplicar `min-w-0` + `overflow-hidden` nos containers de grid/flex que contêm conteúdo dinâmico
- Manter `truncate` em textos longos (URLs, nomes, IDs)
- Preservar desktop intacto (todas as mudanças são neutras em breakpoints maiores)

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/admin/SalesDiagnostic.tsx` | Adicionar `external_reference` e `duration_ms` às interfaces locais; cast de `payment_environment` |
| `src/pages/representative/RepresentativeDashboard.tsx` | Corrigir contenção de largura em grid/flex containers; remover dependência de `overflow-x-hidden` |

