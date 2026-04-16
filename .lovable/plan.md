

# Plano: Adicionar acesso ao Painel Representante no sidebar admin

## Problema atual
1. Se o usuário é gerente **e** representante, o login redireciona para `/representante/painel` (prioridade do `isRepresentative`), e ele perde acesso direto ao admin.
2. O sidebar admin não tem nenhum link para o painel de representante — quem tem os dois papéis fica preso em um ou outro.

## Comportamento proposto

### 1. Corrigir prioridade de redirecionamento no login
**Arquivo:** `src/pages/Login.tsx` (função `getRedirectByRole`)

Inverter a prioridade: papéis administrativos (gerente, developer, operador) devem ter precedência sobre representante. O representante só é o destino padrão se o usuário **não** tiver papel admin.

```
Antes:  isRepresentative → /representante/painel (sempre primeiro)
Depois: gerente/developer/operador → /admin/dashboard (primeiro)
         vendedor → /vendedor/minhas-vendas
         motorista → /motorista
         isRepresentative (sem papel admin) → /representante/painel
```

### 2. Adicionar item condicional no sidebar
**Arquivo:** `src/components/layout/AdminSidebar.tsx`

Adicionar um item "Painel Representante" no grupo "Conta" (ou como standalone), visível **apenas** quando `isRepresentative === true` no `useAuth()`.

- Ícone: `UserCheck` ou `BadgePercent`
- Href: `/representante/painel`
- Condição: `isRepresentative` (já disponível no AuthContext)
- Posição: dentro do grupo "Conta", acima de "Minha Conta"

### 3. Adicionar botão "Voltar ao Admin" no painel do representante
**Arquivo:** `src/pages/representative/RepresentativeDashboard.tsx`

Se o usuário também tem papel admin (gerente/developer/operador), exibir um botão/link "Acessar Painel Admin" no header do dashboard de representante, apontando para `/admin/dashboard`.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/Login.tsx` | Priorizar papéis admin sobre representante no redirecionamento |
| `src/components/layout/AdminSidebar.tsx` | Item condicional "Painel Representante" quando `isRepresentative` |
| `src/pages/representative/RepresentativeDashboard.tsx` | Link "Voltar ao Admin" para quem tem papel admin |

## Riscos
- Nenhum risco estrutural. Mudança mínima e condicional.
- Representantes puros (sem papel admin) continuam sendo redirecionados para `/representante/painel` normalmente.

