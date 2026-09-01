# Índice de endpoints (Connect)

Base: `https://ws.pbintegracoes.com/pspro/v7/`

Autenticação: `Authorization: Bearer $PAGBANK_CONNECT_KEY` — ver [09-security-credentials.md](09-security-credentials.md).

## Endpoints documentados

| Operação | Método | Path | HTTP OK | Documentação |
|----------|--------|------|---------|--------------|
| Validar Connect Key | GET | `connect/connectInfo` | 200 | [01-connect-key](01-connect-key.md) |
| Criar chave pública (cartão) | POST | `connect/ws/public-keys` | 200/201 | [05-order-credit-card](05-order-credit-card.md) |
| Criar pedido | POST | `connect/ws/orders` | **201** | [04](04-order-pix.md), [05](05-order-credit-card.md), [06](06-order-boleto.md), [13](13-recurring.md) |
| Consultar pedido | GET | `connect/ws/orders/{orderId}` | 200 | [07-webhooks](07-webhooks.md) |
| Criar payment link | POST | `connect/ws/checkouts` | **201** | [10-checkout](10-checkout-payment-link.md) |
| Consultar checkout | GET | `connect/ws/checkouts/{checkoutId}` | 200 | [10-checkout](10-checkout-payment-link.md) |
| Inativar checkout | POST | `connect/ws/checkouts/{id}/inactivate` | 200 | [10-checkout](10-checkout-payment-link.md) |
| Calcular parcelas/taxas | GET | `connect/ws/charges/fees/calculate` | 200 | [12-fees-calculate](12-fees-calculate.md) |
| Sessão 3DS | POST | `connect/ws-sdk/checkout-sdk/sessions` | 200 | [11-3ds](11-3ds.md) |
| Consultar split | GET | `connect/ws/splits/{splitId}` | 200 | [15-split](15-split.md) |
| Liberar custódia do split | POST | `connect/ws/splits/{splitId}/custody/release` | 200 | [15-split](15-split.md) |
| Account ID por e-mail | GET | `connect/accountId?email=` | 200 | [15-split](15-split.md) |

## Sandbox

Ambiente definido pelo **prefixo** da Connect Key (sandbox). Sem `?isSandbox` na URL.

Consulta de split em sandbox: host `internal.sandbox.api.pagseguro.com`, sem Bearer — ver [15-split](15-split.md).

## Notificações (inbound)

Ver [07-webhooks.md](07-webhooks.md).
