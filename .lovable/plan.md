

# Correcao: Vinculo vendedor-usuario + Build errors + Documentacao "Vendedores != Stripe"

## Contexto importante (gravado permanentemente)

**Vendedores do sistema sao 100% gerenciais.** Nao tem nenhuma relacao com Stripe, gateway de pagamento ou qualquer integracao financeira. O vendedor e um cadastro interno para controle de comissao manual e rastreamento de vendas via link de referencia. A comissao e apurada e paga manualmente pelo gerente (via Pix ou outro meio proprio). O Stripe lida apenas com o pagamento do cliente final e repasse ao parceiro — vendedores nao participam desse fluxo.

---

## Problema 1: "Nao foi possivel confirmar o vinculo salvo"

### Causa raiz
A politica RLS `"Gerente can manage user_roles"` so permite escrita para o perfil `gerente`. O perfil `developer` consegue LER (via `is_admin`), mas **nao consegue ESCREVER** na tabela `user_roles`. O UPDATE executa sem erro mas nao altera nenhuma linha (comportamento silencioso do RLS), e a verificacao posterior detecta que nada mudou.

### Correcao
Migracao SQL para substituir a policy incluindo `developer`:

```sql
DROP POLICY "Gerente can manage user_roles" ON public.user_roles;
CREATE POLICY "Gerente and developer can manage user_roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'gerente'::user_role)
    OR has_role(auth.uid(), 'developer'::user_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::user_role)
    OR has_role(auth.uid(), 'developer'::user_role)
  );
```

---

## Problema 2: 18 build errors no stripe-webhook

### Causa raiz
O `createClient` sem tipo generico faz o TypeScript inferir `never` para todas as tabelas. Nada a ver com vendedores.

### Correcao
Tipar o cliente com `<any>` e as funcoes auxiliares para aceitar esse tipo:

```typescript
const supabaseAdmin = createClient<any>(...);
```

E nas assinaturas das funcoes:

```typescript
async function processPaymentConfirmed(
  supabaseAdmin: ReturnType<typeof createClient<any>>,
  ...
)
```

---

## Problema 3: Documentacao permanente — Vendedores != Stripe

Adicionar comentarios explicitos nos seguintes locais:

| Local | Comentario |
|-------|-----------|
| `src/pages/admin/Sellers.tsx` | Bloco de comentario no topo: vendedores sao gerenciais, sem vinculo com Stripe |
| `src/pages/admin/Users.tsx` | Comentario no trecho de vinculo seller_id: o campo conecta usuario ao cadastro de vendedor para controle interno |
| `supabase/functions/stripe-webhook/index.ts` | Comentario reforçando que seller_id nao participa do fluxo Stripe (ja existe parcialmente) |
| `src/types/database.ts` | Comentario na interface Seller |

---

## Arquivos modificados

| Arquivo | Alteracao |
|---------|-----------|
| Migracao SQL (nova) | Atualizar RLS de user_roles para incluir developer |
| `supabase/functions/stripe-webhook/index.ts` | Tipar createClient com `<any>`, corrigir assinaturas |
| `src/pages/admin/Sellers.tsx` | Comentario documental no topo |
| `src/pages/admin/Users.tsx` | Comentario documental no vinculo seller_id |
| `src/types/database.ts` | Comentario na interface Seller |

## Sem novas dependencias

