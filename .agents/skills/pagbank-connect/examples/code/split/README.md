# Split — exemplos

## Criar pedido com divisão

Use [../../requests/order-split-credit-card.json](../../requests/order-split-credit-card.json) no fluxo de [order-credit-card](../order-credit-card/) (public-keys → encrypt → POST orders).

Guia: [../../docs/15-split.md](../../docs/15-split.md).

## Consultar split (produção)

```bash
export PAGBANK_CONNECT_KEY='...'
export SPLIT_ID='SPLI_...'
./consult-split-curl.sh
```

Exemplo de resposta: [split-get-response.json](../../responses/split-get-response.json).

## Consultar split (sandbox)

O `href` na resposta usa `sandbox.api.pagseguro.com` — troque para `internal.sandbox.api.pagseguro.com` **sem** Bearer:

```bash
# Exemplo — ajuste SPLI_... conforme sua resposta
curl -sS "https://internal.sandbox.api.pagseguro.com/splits/SPLI_SEU_ID_AQUI"
```

Ver [../../docs/15-split.md](../../docs/15-split.md#sandbox--regra-importante-da-url).
