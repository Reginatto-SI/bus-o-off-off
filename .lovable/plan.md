## Causa raiz

A tela branca **não** vem da navegação mobile e sim de `src/pages/admin/Dashboard.tsx`.

- Linha 229 usa o ícone `Bus` no atalho "Embarque".
- O bloco de imports de `lucide-react` (linhas 5–29) **não inclui** `Bus`.
- Resultado em runtime: `ReferenceError: Bus is not defined` durante a avaliação do módulo Dashboard, o que derruba todo o bundle admin e produz tela branca em qualquer rota (login/dashboard/vendas/validador).

Confirmado via Playwright em `http://localhost:8080/`:
```
pageerror: Bus is not defined
```

A correção anterior adicionou `Bus` em `adminMobileBottomNavItems.ts` (que já estava OK), mas deixou passar a segunda ocorrência dentro de `Dashboard.tsx` — por isso o erro persistiu.

## Correção mínima

Arquivo único: `src/pages/admin/Dashboard.tsx`

- Adicionar `Bus` na lista de imports de `lucide-react` (junto com os demais ícones já usados, entre linhas 5 e 29). Nenhuma outra alteração.

## Validação

1. Recarregar `/` — sem `Bus is not defined` no console.
2. Verificar renderização de: `/login`, `/admin/dashboard`, `/admin/vendas`, `/validador/embarque`.
3. Confirmar que o menu "Mais" e a navegação inferior mobile continuam funcionando.
4. Desktop preservado (nenhuma mudança de layout, apenas import).

## Preservação

Nada de banco, RLS, regras de venda/financeiro, rotas, permissões, filtros, modais, exportações ou desktop é tocado.
