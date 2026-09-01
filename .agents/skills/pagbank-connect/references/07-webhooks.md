# Webhooks (notificações)

O PagBank envia notificações HTTP para a URL que você informar ao criar o pedido.

## Configuração

No **body** do `POST connect/ws/orders`, informe `notification_urls` com **exatamente uma URL**:

```json
{
  "notification_urls": [
    "https://sua-loja.test/webhook/pagbank?h=abc12"
  ]
}
```

O campo é um array na API do PagBank, mas **apenas uma URL de notificação é permitida** — envie um único item.

### Limite de tamanho da URL

A URL deve ter no **máximo 100 caracteres**. Se precisar de mais espaço para parâmetros de validação, use um path curto com hash (`?h=abc12`).

## O que o PagBank envia

O corpo é o **pedido atualizado** (mesma estrutura de `GET connect/ws/orders/{id}`), incluindo status de `charges` ou `qr_codes`.

Exemplos em [examples/notifications/](../examples/notifications/):

| Arquivo | Cenário |
|---------|---------|
| `pixPaid.json` | PIX pago |
| `pixPendingOrNew.json` | PIX aguardando |
| `cardPaid.json` | Cartão aprovado |
| `cardDeclinedByBank.json` | Recusado pelo banco |
| `cardDeclinedByPagbank.json` | Recusado PagBank |
| `boletoPaid.json` | Boleto pago |
| `boletoWaiting.json` | Boleto aguardando |

## Boas práticas

1. **Responder HTTP 200** rapidamente; processe de forma assíncrona se necessário.
2. **Validar** com hash ou token na URL (`?h=`) gerado no seu sistema.
3. **Reconciliar** por `reference_id` (seu ID) e/ou `id` (`ORDE_...`).
4. **Consulta ativa** se o webhook falhar: `GET connect/ws/orders/{orderId}` — use a **mesma Connect Key** que criou o pedido.

## Exemplo de handler (Node/Express)

```javascript
app.post('/webhook/pagbank', express.json(), (req, res) => {
  const order = req.body;
  const ref = order.reference_id;
  const charge = order.charges?.[0];
  const status = charge?.status ?? 'PIX_PENDING';
  // Atualizar pedido no seu banco...
  res.sendStatus(200);
});
```

## Consultar pedido manualmente

```
GET connect/ws/orders/{orderId}
```

Ver [references/ws-endpoints.md](../references/ws-endpoints.md).
