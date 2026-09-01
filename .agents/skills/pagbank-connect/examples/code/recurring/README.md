# Recorrência — exemplos

## Modelo A — Pedidos (responsabilidade do lojista)

1. **INITIAL:** [../../requests/order-recurring-initial.json](../../requests/order-recurring-initial.json) — `card.store: true` salva o cartão; guarde `card.id` da resposta.
2. **SUBSEQUENT:** seu sistema agenda e envia [../../requests/order-recurring-subsequent.json](../../requests/order-recurring-subsequent.json) com `card.id` (sem PAN).

O PagBank **não** dispara renovações sozinho neste modelo.

- Guia API: [../../docs/13-recurring.md](../../docs/13-recurring.md)
- Como integrações oficiais fazem (opcional): [../../docs/14-recurring-integrations.md](../../docs/14-recurring-integrations.md)

## Modelo B — Checkout recorrente

[../../requests/checkout-recurring.json](../../requests/checkout-recurring.json) — `interval.unit` só `MONTH` ou `YEAR`; `length` sempre `1`. Renovações automáticas pelo PagBank.

Credenciais: `PAGBANK_CONNECT_KEY` — [../../docs/09-security-credentials.md](../../docs/09-security-credentials.md).
