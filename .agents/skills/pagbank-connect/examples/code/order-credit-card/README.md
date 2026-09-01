# Cartão de crédito — exemplos

Estes scripts cobrem **public-keys** e **criar pedido** depois que você já tem `card.encrypted`.

## Criptografia do cartão

| Cenário | Onde ler |
|---------|----------|
| Web / produção (recomendado) | SDK browser — [docs/05-order-credit-card.md](../../../docs/05-order-credit-card.md) (Opção A) |
| Servidor, n8n, desktop | [examples/encryption/README.md](../../encryption/README.md) e [PagBank-n8n](https://github.com/r-martins/PagBank-n8n) (`lib/pagbank/pagseguro-n8n-compatible.js`) |

Apps desktop: prefira **WebView + SDK** ou **iframe** para PCI; ver doc acima.

## Passos

1. `POST connect/ws/public-keys` — obter `public_key`
2. Gerar `encryptedCard` (browser ou referência n8n)
3. `POST connect/ws/orders` com `charges[].payment_method.card.encrypted` — sucesso = **HTTP 201**

## SDK (browser)

```
https://assets.pagseguro.com.br/checkout-sdk-js/rc/dist/browser/pagseguro.min.js
```

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `public-keys-curl.sh` | Criar chave pública |
| `create-order-curl.sh` | Criar pedido (defina `ENCRYPTED_CARD`) |
| `create-order.mjs` | Mesmo fluxo em Node |
| `encrypt-card.browser.mjs` | Referência `PagSeguro.encryptCard` no browser |
