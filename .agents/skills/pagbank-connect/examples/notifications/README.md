# Exemplos de notificações (webhook inbound)

O PagBank envia `POST` para a URL configurada em `notification_urls` com o pedido atualizado no body.

| Arquivo | Descrição |
|---------|-----------|
| `pixPaid.json` | PIX confirmado |
| `pixPendingOrNew.json` | PIX aguardando pagamento |
| `cardPaid.json` | Cartão aprovado |
| `cardDeclinedByBank.json` | Recusado pelo emissor |
| `cardDeclinedByPagbank.json` | Recusado PagBank |
| `boletoPaid.json` | Boleto pago |
| `boletoWaiting.json` | Boleto aguardando |

E-mails de exemplo foram sanitizados para `cliente@exemplo.test`.

Ver [docs/07-webhooks.md](../../docs/07-webhooks.md).
