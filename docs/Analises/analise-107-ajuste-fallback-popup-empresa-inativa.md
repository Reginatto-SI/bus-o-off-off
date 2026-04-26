# Análise — ajuste de fallback do popup de empresa inativa

## 1) Risco identificado

- O fallback anterior no `AdminLayout` marcava bloqueio ao detectar **qualquer** empresa inativa vinculada (`some(is_active === false)`).
- Em usuário com múltiplas empresas (ao menos uma ativa e outra inativa), isso poderia bloquear indevidamente mesmo com empresa ativa disponível.

## 2) Correção aplicada

- A lógica do fallback foi ajustada para bloquear somente quando **não existe nenhuma empresa ativa vinculada**.
- Nova regra aplicada na leitura de vínculos (`user_roles -> companies(is_active)`):

```ts
const companies = data ?? [];
const hasAnyCompany = companies.length > 0;
const hasActiveCompany = companies.some(row => row.company?.is_active === true);
const shouldFallbackBlock = hasAnyCompany && !hasActiveCompany;
```

## 3) Regra final do bloqueio

1. Se `activeCompany?.is_active === false` → bloquear.
2. Se não houver `activeCompany` → bloquear apenas quando o usuário tiver vínculos e **todas** as empresas vinculadas estiverem inativas.
3. Se houver pelo menos uma empresa ativa vinculada → não bloquear pelo fallback.

## 4) O que não foi alterado

- `AuthContext`.
- RLS.
- Fluxo de login.
- Modal visual e ações (Entrar em contato / Sair).
- Fluxo de ativar/inativar empresas no Header.
- Rotas/telas novas.
