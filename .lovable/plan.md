

# Redirecionamento por Perfil no Login + Bloqueio de Rotas Admin para Vendedor

## Resumo

Tres alteracoes pontuais para garantir que vendedores nunca acessem o painel administrativo:

## 1. Login.tsx — Redirecionar por perfil apos login

Atualmente o `Login.tsx` redireciona hardcoded para `/admin/eventos`. Precisa aguardar o `userRole` resolver e redirecionar conforme o perfil:

- `vendedor` -> `/vendedor/minhas-vendas`
- Demais (gerente, operador, developer) -> `/admin/eventos`

**Abordagem:** Usar um `useEffect` que observa `user` e `userRole` (do `useAuth`). Quando ambos estiverem definidos, redirecionar para a rota correta. Remover o redirect manual no `handleSubmit` e o `Navigate` estático.

## 2. AdminLayout.tsx — Bloquear vendedor antes de renderizar

Adicionar verificacao de `userRole` no `AdminLayout`. Se o perfil for `vendedor`, exibir toast "Acesso nao autorizado" e redirecionar para `/vendedor/minhas-vendas` sem renderizar sidebar/header admin.

**Importante:** Tambem tratar o estado onde `userRole` ainda nao carregou (null) enquanto `user` ja existe — manter o loading spinner ate o role resolver, evitando flash do layout admin.

## 3. Login.tsx — Redirect de sessao existente por perfil

O bloco que hoje faz `if (user) return <Navigate to="/admin/eventos" />` precisa tambem considerar o role. Se `userRole` ainda nao carregou, mostrar loading. Se `vendedor`, redirecionar para `/vendedor/minhas-vendas`.

---

## Arquivos modificados

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/Login.tsx` | Redirect pos-login e redirect de sessao existente baseados em `userRole` |
| `src/components/layout/AdminLayout.tsx` | Bloquear vendedor com redirect + toast antes de renderizar layout admin |

## Sem alteracoes de banco ou novas dependencias

