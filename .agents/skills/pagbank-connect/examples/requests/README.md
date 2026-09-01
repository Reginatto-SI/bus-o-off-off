# Payloads JSON de exemplo

Copie e adapte antes de `POST connect/ws/*`. **Não incluem credenciais.**

## Pedidos (orders)

| Arquivo | Uso |
|---------|-----|
| [order-pix.json](order-pix.json) | PIX |
| [order-boleto.json](order-boleto.json) | Boleto |
| [order-credit-card.json](order-credit-card.json) | Cartão (campo `encrypted`) |
| [public-keys.json](public-keys.json) | Chave RSA para criptografar cartão |
| [order-recurring-initial.json](order-recurring-initial.json) | Assinatura — 1ª cobrança |
| [order-recurring-subsequent.json](order-recurring-subsequent.json) | Assinatura — renovação |

## Payment link (checkouts)

| Arquivo | Uso |
|---------|-----|
| [checkout.json](checkout.json) | Link PIX + cartão |
| [checkout-recurring.json](checkout-recurring.json) | Link com plano recorrente |

## Query (GET)

| Arquivo | Uso |
|---------|-----|
| [fees-calculate.query.md](fees-calculate.query.md) | Parâmetros de `charges/fees/calculate` |

## Sandbox

Com Connect Key de sandbox (prefixo documentado em [02-sandbox.md](../../docs/02-sandbox.md)), a API usa ambiente de testes. Pedidos sandbox **não aparecem no painel PagBank**.

## Autenticação

`Authorization: Bearer $PAGBANK_CONNECT_KEY` — ver [09-security-credentials.md](../../docs/09-security-credentials.md).
