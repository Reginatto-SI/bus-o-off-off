

# Menu Lateral Colapsavel — Painel Administrativo

## Resumo

Implementar funcionalidade de colapso no menu lateral desktop do painel administrativo. Quando colapsado, exibe apenas icones com tooltips. Persistencia via localStorage. Transicao animada suave.

---

## Abordagem

Implementacao custom sem usar o componente Shadcn Sidebar (o sidebar atual e totalmente custom). Adicionar estado `collapsed` gerenciado internamente no `AdminSidebar`, persistido em localStorage, e propagado para o `AdminLayout` para ajustar o padding do conteudo principal.

---

## Alteracoes

### 1. AdminSidebar.tsx — Estado de colapso + layout colapsado

**Estado:**
- Novo state `collapsed` inicializado a partir de `localStorage.getItem('sidebar_collapsed') === 'true'`
- Funcao `toggleCollapsed` que alterna e persiste no localStorage

**Header (desktop):**
- Quando colapsado: mostrar apenas o icone do busao (sem texto) + botao de toggle (seta para direita)
- Quando expandido: layout atual + botao de toggle (seta para esquerda)
- Botao de toggle: icone `PanelLeftClose`/`PanelLeftOpen` do lucide-react

**Navegacao (desktop):**
- Quando colapsado: remover Accordion, mostrar apenas icones centralizados sem labels de grupo
- Cada icone envolto em `Tooltip` (do Radix/shadcn ja existente) mostrando o nome do item
- Quando expandido: manter layout atual com Accordion

**Rodape usuario (desktop):**
- Quando colapsado: mostrar apenas avatar com inicial do nome + tooltip
- Botao Sair: apenas icone LogOut com tooltip

**Seletor de empresa (developer):**
- Quando colapsado: ocultar completamente (ocupa pouco espaco e nao faz sentido em modo icone)

**Largura desktop:**
- Expandido: `w-64` (atual)
- Colapsado: `w-16`
- Transicao: `transition-all duration-300`

**Mobile:**
- Nenhuma alteracao. Mobile continua com overlay de menu completo.

### 2. AdminLayout.tsx — Padding dinamico

- Importar estado de colapso do sidebar
- Problema: AdminSidebar e AdminLayout sao componentes separados sem estado compartilhado

**Solucao:** O AdminSidebar exporta o estado de collapsed via um callback prop OU usa um contexto simples. Abordagem mais simples: ler diretamente do localStorage no AdminLayout e escutar evento de storage.

**Abordagem escolhida:** Criar um hook `useSidebarCollapsed` que le/escreve no localStorage e dispara um custom event para sincronizar entre componentes.

- `lg:pl-64` (expandido) vs `lg:pl-16` (colapsado)
- Transicao suave: `transition-all duration-300`

### 3. Novo hook: src/hooks/use-sidebar-collapsed.ts

```typescript
// Hook que gerencia estado collapsed com persistencia e sincronizacao
// - Le de localStorage('sidebar_collapsed')
// - Dispara custom event 'sidebar-collapsed-change' ao alterar
// - Escuta o mesmo evento para sincronizar entre AdminSidebar e AdminLayout
```

Retorna: `{ collapsed: boolean, toggleCollapsed: () => void }`

### 4. AdminHeader.tsx — Nenhuma alteracao necessaria

O header ja e `hidden lg:flex` e fica dentro do container com padding. Ele se ajusta automaticamente.

---

## Arquivos

| Arquivo | Alteracao |
|---------|-----------|
| `src/hooks/use-sidebar-collapsed.ts` | Novo hook de persistencia + sync |
| `src/components/layout/AdminSidebar.tsx` | Estado de colapso, layout colapsado com tooltips, botao toggle |
| `src/components/layout/AdminLayout.tsx` | Padding dinamico baseado em collapsed |

## Sem alteracoes de banco, dependencias ou rotas

Usa apenas `lucide-react` (PanelLeftClose/PanelLeftOpen) e `Tooltip` do shadcn (ja existentes).

