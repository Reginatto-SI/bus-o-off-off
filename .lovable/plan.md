

# Correcao: "Erro ao finalizar compra" ao comprar via link de vendedor

## Causa Raiz

O problema **nao e do link do vendedor**. O evento "Meu Primeiro Evento" esta com o campo `allow_online_sale = false` no banco de dados. A politica de seguranca (RLS) exige que `allow_online_sale = true` para permitir compras publicas. Como essa condicao nao e atendida, o INSERT na tabela `sales` e rejeitado silenciosamente pelo banco, resultando no erro generico "Erro ao finalizar compra".

## O que sera feito

### 1. Corrigir o dado no banco (imediato)

Atualizar o evento para permitir venda online:

```sql
UPDATE events SET allow_online_sale = true WHERE name ILIKE '%Primeiro%';
```

### 2. Melhorar a mensagem de erro no Checkout

O erro atual e generico e nao ajuda a diagnosticar o problema. Sera adicionada uma verificacao **antes** de tentar inserir a venda: se o evento nao permite venda online, exibir uma mensagem clara ao usuario.

No `Checkout.tsx`, antes do INSERT de `sales`:
- Verificar `event.allow_online_sale`
- Se `false`, exibir toast: "Este evento nao esta disponivel para compra online."
- Interromper o fluxo sem tentar o INSERT

Alem disso, no tratamento de erro do INSERT, incluir detalhes do erro no log para facilitar depuracao futura (ja existe `console.error`, mas a mensagem ao usuario sera mais especifica quando possivel, detectando o codigo RLS).

### 3. Bloquear acesso ao checkout para eventos sem venda online

Na carga inicial do Checkout (onde busca o evento), se `allow_online_sale === false`, redirecionar de volta para a pagina do evento com uma mensagem, evitando que o usuario preencha todo o formulario para so entao descobrir que nao pode comprar.

---

## Detalhes Tecnicos

### Arquivos modificados

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/public/Checkout.tsx` | Guard no carregamento do evento + mensagem de erro mais clara no INSERT |

### Migracao de banco

Corrigir o evento existente:

```sql
UPDATE public.events SET allow_online_sale = true WHERE allow_online_sale = false;
```

### Nenhuma relacao com vendedor/ref

O link do vendedor (`?ref=...`) **funciona corretamente**. A validacao do `ref` foi implementada e nao interfere no fluxo de compra. O problema e exclusivamente do campo `allow_online_sale` do evento.

