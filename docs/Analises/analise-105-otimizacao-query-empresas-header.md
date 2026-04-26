# Análise — otimização da query de empresas no modal do Header

## 1) Query anterior

No `AdminHeader`, a carga para Developer no modal fazia:

```ts
supabase
  .from('companies')
  .select('*')
  .order('name', { ascending: true })
```

## 2) Query nova

Após ajuste, a query ficou:

```ts
supabase
  .from('companies')
  .select('id, name, trade_name, legal_name, document_number, cnpj, is_active')
  .order('name', { ascending: true })
  .limit(100)
```

## 3) Colunas reduzidas

A listagem do modal usa apenas dados necessários para UX da fase atual:
- `id`
- `name`
- `trade_name`
- `legal_name`
- `document_number`
- `cnpj`
- `is_active`

Não foram adicionados campos novos nem alterações de schema.

## 4) Justificativa da limitação

- `select('*')` traz payload maior do que o necessário.
- O modal está no header e pode abrir com frequência.
- Limitar colunas reduz tráfego, parse e memória no cliente.
- `limit(100)` evita carga massiva no contexto de UI rápida sem introduzir paginação nesta fase.

## 5) Impacto esperado de performance

1. Menor payload por requisição.
2. Menor custo de renderização/filtragem local em listas grandes.
3. Maior previsibilidade de tempo de abertura do modal para Developer.

## 6) O que NÃO foi alterado

- Sem alteração de `AuthContext`.
- Sem alteração de `switchCompany`.
- Sem alteração de RLS/permissões/login.
- Sem nova rota/tela/módulo.
- Sem paginação/infinite scroll.
- Sem alteração em outras telas.

## 7) Validação funcional esperada (pós-ajuste)

- Modal abre normalmente.
- Busca local continua funcionando.
- Filtro local de status continua funcionando.
- Ativas/inativas continuam sendo exibidas conforme dados disponíveis.
- Seleção por botão continua funcionando.
- Sem regressão de regra de negócio.
