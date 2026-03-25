# Análise 40 — Taxa de Mensageria Asaas (Smartbus BR)

## Diagnóstico do fluxo atual

### 1) Onde o Smartbus cria cliente no Asaas
Foram identificados dois pontos ativos de criação de customer (`POST /customers`) no backend:

1. `supabase/functions/create-asaas-payment/index.ts`
   - Fluxo principal de venda no checkout.
   - Primeiro busca customer por `cpfCnpj` (`GET /customers?cpfCnpj=...`).
   - Se não encontrar, cria novo customer.

2. `supabase/functions/create-platform-fee-checkout/index.ts`
   - Fluxo de cobrança de taxa de plataforma.
   - Busca por documento da empresa e cria customer quando não existe.

### 2) Situação antes da correção
Antes desta correção, os payloads de criação de customer **não enviavam** `notificationDisabled`.

Consequência prática: novos customers podiam ser criados com notificações padrão do Asaas, o que abre margem para cobrança de mensageria (ex.: SMS) por cobrança gerada.

### 3) Reutilização x recriação de customer
O fluxo já reutiliza customer quando encontrado por documento (`cpfCnpj`):
- se existe, usa `customerId` existente;
- se não existe, cria customer novo.

Ou seja, o problema de custo está principalmente no nascimento de **novos** customers sem a flag explícita de notificação desativada.

## Ajuste aplicado

### Regra implementada
Sempre que houver criação de customer no Asaas (`POST /customers`), o payload agora inclui:

```json
{
  "notificationDisabled": true
}
```

### Arquivos alterados
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/create-platform-fee-checkout/index.ts`

### Trecho de código alterado

Exemplo no fluxo principal de venda (`create-asaas-payment`):

```ts
body: JSON.stringify({
  name: sale.customer_name,
  cpfCnpj: customerCpf,
  phone: sale.customer_phone || undefined,
  externalReference: sale.id,
  // Regra de custo Smartbus BR: novos customers devem nascer sem notificações pagas.
  notificationDisabled: true,
}),
```

Exemplo no fluxo de taxa da plataforma (`create-platform-fee-checkout`):

```ts
body: JSON.stringify({
  name: companyName,
  cpfCnpj: companyDoc || undefined,
  email: companyData?.email || undefined,
  externalReference: `company_${sale.company_id}`,
  // Evita habilitação padrão de mensageria paga (SMS) em novos customers no Asaas.
  notificationDisabled: true,
}),
```

## Confirmação de não quebra de fluxo

- Não houve alteração de contrato de entrada/saída das edge functions.
- Não houve alteração da lógica de cobrança (`POST /payments`) nem de cálculo de valores/split.
- Apenas foi adicionado um campo no payload de criação do customer.
- Fluxo de reutilização de customer existente permanece igual.

## Impacto esperado

- Novos customers passam a nascer com notificações desativadas por padrão.
- Redução de risco de cobrança de mensageria paga em novas cobranças.
- Sem impacto visual no frontend e sem mudança de UX.

## Pontos de atenção futura (não implementados nesta etapa)

1. **Customers antigos** já criados sem `notificationDisabled: true` não são alterados por esta correção.
2. Se o negócio quiser manter e-mail e desligar apenas SMS, avaliar ajuste fino em `/notifications/{id}` por customer.
3. Pode ser útil script operacional para saneamento de customers legados quando validado com operação/financeiro.

## Checklist de validação

- [x] Cliente criado com `notificationDisabled: true`
- [ ] Cobrança gerada sem taxa de mensageria *(depende validação operacional com conta Asaas real)*
- [x] Fluxo de pagamento permanece intacto (mudança pontual no payload de customer)
- [x] Nenhum erro novo de webhook/confirmacao introduzido pelo patch (webhook não foi alterado)
- [x] Código comentado explicando a alteração
