
# Ticket ID na Passagem + Sincronizacao do Status de Pagamento Stripe

## Resumo

Duas melhorias criticas: (1) exibir um ID curto e copiavel em cada passagem para facilitar suporte, e (2) criar uma edge function `verify-payment-status` que consulta o Stripe e sincroniza o status real do pagamento, com polling automatico e botao de fallback manual.

---

## Parte 1: Ticket ID no Card da Passagem

Exibir o `sale_id` (UUID) de forma amigavel: primeiros 8 caracteres com botao de copiar o UUID completo.

### Arquivos afetados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/ticket-lookup/index.ts` | Retornar `saleId: t.sale_id` e `stripeCheckoutSessionId: t.sale?.stripe_checkout_session_id` no resultado |
| `src/components/public/TicketCard.tsx` | Adicionar `saleId` e `stripeCheckoutSessionId` na interface `TicketCardData`. Exibir "Codigo: XXXXXXXX" com icone copiar abaixo do CPF. Adicionar botao "Atualizar status" quando status nao for "pago" e existir `stripeCheckoutSessionId` |
| `src/pages/public/TicketLookup.tsx` | Mapear `saleId` e `stripeCheckoutSessionId` do endpoint. Adicionar logica de verificacao automatica de status para tickets pendentes. Implementar callback `onStatusRefresh` para atualizar a UI |
| `src/pages/public/Confirmation.tsx` | Passar `saleId` nos ticketCards. Integrar chamada a `verify-payment-status` apos 15s de polling sem sucesso. Adicionar botao fallback quando polling expirar |
| `src/lib/ticketVisualRenderer.ts` | Exibir codigo curto na imagem renderizada |
| `src/lib/ticketPdfGenerator.ts` | Nenhuma mudanca necessaria (usa renderTicketVisual que ja sera atualizado) |

### UI do Ticket ID

```text
CPF: ***.456.789-**
Codigo: 23114cc2  [icone copiar]
```

O botao copiar copia o UUID completo para a area de transferencia com feedback via toast ("Codigo copiado!").

---

## Parte 2: Edge Function `verify-payment-status`

### Logica

Nova edge function publica que recebe `{ sale_id }` e:

1. Busca a venda no banco (precisa ter `stripe_checkout_session_id`)
2. Se status ja for "pago", retorna `{ paymentStatus: 'pago' }` sem consultar Stripe
3. Busca a empresa para obter `stripe_account_id`
4. Consulta a Checkout Session no Stripe (na conta conectada, usando header `stripeAccount`)
5. Mapeia o status:
   - `payment_status === 'paid'` => chama a mesma logica do webhook (`processPaymentConfirmed`) para marcar como pago, calcular comissao e fazer transfer. Retorna `{ paymentStatus: 'pago' }`
   - `payment_status === 'unpaid'` e session nao expirada => retorna `{ paymentStatus: 'processando' }`
   - Session expirada => retorna `{ paymentStatus: 'expirado' }`
6. Guard de idempotencia: `.eq('status', 'reservado')` no update para nao processar duplicado

### config.toml

Adicionar entrada:
```text
[functions.verify-payment-status]
verify_jwt = false
```

### Seguranca

- Usa `SUPABASE_SERVICE_ROLE_KEY` e `STRIPE_SECRET_KEY` (ambos ja configurados)
- `verify_jwt = false` porque consulta de passagens e publica (mesmo padrao do `ticket-lookup`)
- Idempotencia garantida pelo guard `.eq('status', 'reservado')`
- Rate limiting natural: frontend limita chamadas (maximo 3 vendas por busca, cooldown de 10s no botao manual)

---

## Parte 3: Integracao no Frontend

### TicketLookup.tsx (consultar passagens)

Apos receber os tickets do `ticket-lookup`:
- Para cada ticket com `saleStatus !== 'pago'` e que tenha `stripeCheckoutSessionId`, chamar `verify-payment-status` automaticamente (maximo 3 vendas distintas, em paralelo)
- Se o status retornado mudar, atualizar o card na lista
- Cada TicketCard com status nao-pago tera um botao "Atualizar status" que chama a verificacao on-demand com cooldown de 10s

### Confirmation.tsx (tela de confirmacao)

O polling atual (a cada 3s por 60 tentativas) consulta apenas o banco local. Ajustar para:
- Apos 15s (5 tentativas) sem confirmar, chamar `verify-payment-status` uma vez para forcar sincronizacao
- Quando polling expirar, mostrar botao "Atualizar status do pagamento" em vez de apenas texto generico
- O botao chama `verify-payment-status` e atualiza a UI conforme resultado

### TicketCard.tsx

- Novo campo `saleId: string` na interface
- Novo campo opcional `stripeCheckoutSessionId: string | null`
- Novo callback opcional `onRefreshStatus?: (saleId: string) => Promise<void>`
- Novo prop opcional `isRefreshing?: boolean`
- Exibir "Codigo: XXXXXXXX" com botao copiar
- Quando status nao for "pago" e existir `stripeCheckoutSessionId`: mostrar botao discreto "Atualizar status" que chama `onRefreshStatus`

---

## Parte 4: Status Visual "Processando"

Nao criar novo enum no banco. O banco continua com `reservado/pago/cancelado`. O status "processando" e apenas uma variante visual no frontend.

### StatusBadge.tsx

Adicionar entrada `processando` no `statusConfig` como uma string literal adicional no tipo (nao muda o enum do banco):
- Label: "Processando"
- Classe: badge azul/amber para diferenciar visualmente de "Reservado"

### TicketCard.tsx

Quando `saleStatus === 'reservado'` e `stripeCheckoutSessionId` existe, exibir badge "Processando" em vez de "Reservado" (indica que houve tentativa de pagamento mas ainda nao confirmou).

---

## Parte 5: Ticket Visual Renderer

### ticketVisualRenderer.ts

Adicionar o codigo curto (`saleId.slice(0, 8)`) na imagem renderizada, abaixo do CPF, mantendo o mesmo padrao visual dos outros campos.

---

## Fluxo Completo

```text
1. Usuario paga no Stripe -> volta para /confirmacao/{id}?payment=success
2. Polling local (3s) verifica status no banco
3. Se apos 15s ainda "reservado" -> chama verify-payment-status (forca sync com Stripe)
4. Se Stripe confirma pago -> edge function atualiza banco -> polling local detecta -> UI atualiza
5. Se Stripe ainda processando -> mostra badge "Processando" + botao manual
6. Na tela /consultar-passagens -> ao buscar, verifica automaticamente vendas pendentes
7. Botao "Atualizar status" sempre disponivel como fallback quando nao pago
```

## Arquivos a Criar/Modificar (resumo)

| Arquivo | Acao |
|---------|---------|
| `supabase/functions/verify-payment-status/index.ts` | **Criar** — edge function que consulta Stripe e sincroniza status |
| `supabase/config.toml` | Adicionar `[functions.verify-payment-status]` com `verify_jwt = false` |
| `src/components/public/TicketCard.tsx` | Adicionar `saleId`, `stripeCheckoutSessionId`, codigo curto com copiar, botao "Atualizar status", badge "Processando" |
| `src/components/ui/StatusBadge.tsx` | Adicionar variante visual "processando" |
| `src/pages/public/TicketLookup.tsx` | Mapear novos campos, verificacao automatica de vendas pendentes, callback de refresh |
| `src/pages/public/Confirmation.tsx` | Integrar `verify-payment-status` no polling (apos 15s), botao fallback, passar `saleId` |
| `supabase/functions/ticket-lookup/index.ts` | Retornar `saleId` e `stripeCheckoutSessionId` |
| `src/lib/ticketVisualRenderer.ts` | Exibir codigo curto na imagem |

## Logica de Comissao na Edge Function

A edge function `verify-payment-status` reutilizara a mesma logica do webhook (`processPaymentConfirmed`) para calcular comissao da plataforma e fazer transfer ao parceiro. Isso garante que mesmo quando o webhook falhar, a verificacao on-demand produza o mesmo resultado financeiro.
