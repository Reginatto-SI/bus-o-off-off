# Exemplos de código HTTP

## Credenciais (obrigatório)

Defina a Connect Key **apenas** no ambiente — nunca no repositório:

```bash
export PAGBANK_CONNECT_KEY='sua-key-de-pbintegracoes.com'
```

Guia: [docs/09-security-credentials.md](../../docs/09-security-credentials.md).

## Pastas

| Pasta | Endpoint |
|-------|----------|
| [connect-info/](connect-info/) | `GET connect/connectInfo` |
| [order-pix/](order-pix/) | `POST connect/ws/orders` (PIX) |
| [order-boleto/](order-boleto/) | `POST connect/ws/orders` (boleto) |
| [order-credit-card/](order-credit-card/) | public-keys + pedido cartão |
| [checkout/](checkout/) | `POST connect/ws/checkouts` |
| [fees-calculate/](fees-calculate/) | `GET charges/fees/calculate` |
| [3ds/](3ds/) | `POST ws-sdk/checkout-sdk/sessions` |
| [recurring/](recurring/) | pedidos INITIAL/SUBSEQUENT |

## Uso

```bash
export PAGBANK_CONNECT_KEY='...'
./examples/code/connect-info/curl.sh
./examples/code/order-pix/curl.sh
./examples/code/checkout/curl.sh
```

Python: `pip install -r requirements.txt` onde aplicável.
