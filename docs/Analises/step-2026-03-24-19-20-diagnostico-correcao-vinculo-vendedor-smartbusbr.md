# Step 2026-03-24 19:20 UTC — Diagnóstico e correção de vínculo de vendedor (`/v/:codigo`)

## Escopo
Investigar por que compras iniciadas por link curto de vendedor (`/v/D1551F`) podem terminar como **"Sem vendedor"** na venda/listagem.

## Resumo executivo
- A rota curta `/v/:code` está funcional e resolve `short_code -> seller_id` via RPC pública `resolve_seller_short_code`.
- O `ref` é preservado no fluxo público (`/eventos` -> `/eventos/:id` -> `/eventos/:id/checkout`) por query string.
- O ponto de perda estava na validação do vendedor dentro do checkout público:
  - o frontend fazia `SELECT` direto em `public.sellers` com cliente `anon`;
  - RLS bloqueia leitura anônima dessa tabela;
  - resultado prático: `validatedSellerId` ficava `null` e a venda era inserida sem `seller_id`.
- Correção mínima: trocar validação direta por RPC `SECURITY DEFINER` que valida `seller_id + company_id + status=ativo` e retorna o `seller_id` válido.

## Evidências e trilha de investigação

### 1) Resolução do link do vendedor
Arquivo: `src/pages/public/SellerRedirect.tsx`
- rota pública `/v/:code`;
- chama RPC `resolve_seller_short_code(code)`;
- em sucesso redireciona para `/eventos?ref={sellerId}`.

Conclusão: o link curto nasce em `short_code` e é resolvido para `seller_id`.

### 2) Persistência do vínculo
Arquivos: `PublicEvents.tsx`, `PublicEventDetail.tsx`, `Checkout.tsx`.
- não usa localStorage/cookie/estado global para `seller_ref`;
- preserva explicitamente em query string (`ref`) nos links/navegações.

Conclusão: vínculo sobrevive a navegação e refresh **enquanto a URL mantém `ref`**.

### 3) Entrada no fluxo de compra
Arquivo: `Checkout.tsx`
- lê `sellerRef` de `searchParams.get('ref')`;
- tenta validar antes de inserir venda.

Conclusão: o checkout recebe o `ref` corretamente.

### 4) Criação da venda
Arquivo: `Checkout.tsx`
- inserção em `sales` usa `seller_id: validatedSellerId`.

Conclusão: se `validatedSellerId` vier `null`, venda já nasce sem vínculo.

### 5) Pós-pagamento
Arquivos: `supabase/functions/_shared/payment-finalization.ts`, `verify-payment-status/index.ts`, `asaas-webhook/index.ts`.
- atualizações de pagamento/status não sobrescrevem `seller_id`.

Conclusão: não há evidência de perda posterior; problema acontece na criação.

### 6) Relatório/listagem
Arquivos: `Sales.tsx`, `SalesReport.tsx`, `SellersCommissionReport.tsx`.
- telas exibem nome do vendedor por join; quando `seller_id` é `null`, renderizam fallback (`Sem vendedor` / `-`).

Conclusão: tela está refletindo corretamente o dado salvo (não é apenas bug de renderização).

## Validação explícita das hipóteses
1. `/v/:codigo` não resolve vendedor? **Não confirmado** (resolve via RPC).
2. Redirecionamento perde referência? **Não confirmado** (`?ref=` é propagado).
3. `ref` não persiste entre páginas? **Não confirmado** (query string é mantida).
4. Checkout não lê referência? **Não confirmado** (lê `sellerRef`).
5. Venda criada sem `seller_id`? **Confirmado** quando validação falha no checkout.
6. Pagamento/finalização sobrescreve `seller_id`? **Não confirmado**.
7. Vínculo existe no banco e relatório mostra errado? **Não confirmado**.
8. Divergência `seller_id`, `short_code`, `ref` e relatório? **Parcialmente confirmado**: `short_code` resolve corretamente, mas validação por leitura direta de `sellers` com `anon` quebrava o elo para `seller_id`.

## Causa raiz
No checkout público, a validação do vendedor usava:
- `supabase.from('sellers').select(...).eq('id', sellerRef).single()`

Como o cliente é `anon`, RLS impede SELECT em `sellers` para público. Sem tratamento explícito de erro nesse ponto, o fluxo seguia com `validatedSellerId = null`, gerando venda sem vendedor.

## Correção aplicada (mínima e segura)

### 1) Nova função RPC pública de validação
Arquivo: `supabase/migrations/20260324191000_fix_public_checkout_seller_ref_validation.sql`
- cria `public.resolve_event_seller_ref(p_seller_id uuid, p_company_id uuid)`;
- valida vendedor ativo na mesma empresa do evento;
- `SECURITY DEFINER` + `GRANT EXECUTE TO anon, authenticated`.

### 2) Checkout passa a usar RPC em vez de SELECT direto
Arquivo: `src/pages/public/Checkout.tsx`
- substitui query direta em `sellers` por `rpc('resolve_event_seller_ref', ...)`;
- mantém comportamento seguro: se inválido, segue sem vendedor (não bloqueia compra);
- adiciona comentário e log de suporte (`console.warn`) para observabilidade.

### 3) Tipagem Supabase atualizada
Arquivo: `src/integrations/supabase/types.ts`
- adicionada assinatura de `resolve_event_seller_ref` em `Database['public']['Functions']`.

## Segurança / multiempresa
- A validação exige `company_id` do evento e `status = 'ativo'`.
- Não há bypass de RLS em tabela pública: a regra de negócio ficou encapsulada em RPC com filtro explícito por empresa.
- Não altera comissão, financeiro, nem outros fluxos de venda.

## Testes executados
- `npm run build` para validar compilação TypeScript/Vite após alteração.

## Resultado final
Com a correção, compras iniciadas por `/v/:codigo` continuam propagando `ref` e agora conseguem validar/vincular o vendedor no checkout público sem depender de SELECT bloqueado por RLS. A venda tende a ser persistida com `seller_id` correto e a listagem deixa de cair em "Sem vendedor" para esse cenário.

## Pendências de validação operacional (ambiente real)
Como este ambiente não executa o ciclo completo de pagamento externo com Asaas + base de produção, a validação final deve ser confirmada no ambiente de homologação/produção com o roteiro:
1. abrir `/v/D1551F`;
2. escolher evento;
3. avançar checkout;
4. concluir pagamento;
5. verificar `sales.seller_id` no banco;
6. validar listagem/relatório com vendedor atribuído.
