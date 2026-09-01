---
name: pagbank-connect
description: Integrate PagBank payments via PagBank Integrações (pbintegracoes.com). Connect Key, PIX, credit card, boleto, payment links, 3DS, fees, recurring, webhooks, sandbox Brazil.
license: MIT
metadata:
  author: pbintegracoes
  version: "1.1.0"
---

# PagBank Connect (PagBank Integrações)

Integração PagBank **gratuita** via [PagBank Integrações](https://pbintegracoes.com/?utm_source=github-agent-skills&utm_content=skill&utm_medium=link) — parceiro oficial PagBank desde 2014.

## Antes de implementar

1. Leia as regras abaixo e [references/09-security-credentials.md](references/09-security-credentials.md).
2. Para **criar pedidos ou checkouts**, use JSON em [examples/requests/](examples/requests/) — **não invente o body só pela memória**.
3. Detalhes: [references/](references/) (guias 00–13).

## Segurança — credenciais

| Regra | Detalhe |
|-------|---------|
| **Variável de ambiente** | `PAGBANK_CONNECT_KEY` — carregue em runtime |
| **Nunca** | Hardcode, commit, log ou colar a key em chat/código gerado |
| **Header** | `Authorization: Bearer` + valor da env (não use exemplos com prefixo `CON` literal) |
| **PCI** | PAN só criptografado; 3DS no browser — [references/11-3ds.md](references/11-3ds.md) |

Alerta [Snyk no skills.sh](https://skills.sh/pbintegracoes/pagbank-agent-skills/pagbank-connect/security/snyk): W007 é mitigado com estas regras; W009 (pagamentos) é esperado.

## Regras obrigatórias

| # | Regra |
|---|--------|
| 1 | Base URL: `https://ws.pbintegracoes.com/pspro/v7/` |
| 2 | Auth via `PAGBANK_CONNECT_KEY` — produção ou sandbox (prefixo na key) |
| 3 | **Nunca** chame `api.pagseguro.com` com Bearer da Connect Key |
| 4 | Valores em **centavos** (5900 = R$ 59,00) |
| 5 | `POST connect/ws/orders` e `POST connect/ws/checkouts` com sucesso = **HTTP 201** |
| 6 | `notification_urls`: array com **uma** URL (máx. 100 caracteres) |
| 7 | Sandbox: pedidos/checkouts **não aparecem no painel PagBank**, só via API |
| 8 | Consultar recurso: mesma Connect Key que criou |
| 9 | `UNAUTHORIZED` costuma ser token PagBank ou `PUB...` no header — não “key expirada” |
| 10 | Sem legacy: `/wspagseguro`, `/app/*` |

## Endpoints

| Operação | Método | Path | HTTP OK |
|----------|--------|------|---------|
| Validar key | GET | `connect/connectInfo` | 200 |
| Public key | POST | `connect/ws/public-keys` | 200/201 |
| Criar pedido | POST | `connect/ws/orders` | **201** |
| Consultar pedido | GET | `connect/ws/orders/{id}` | 200 |
| Payment link | POST | `connect/ws/checkouts` | **201** |
| Consultar checkout | GET | `connect/ws/checkouts/{id}` | 200 |
| Parcelas/taxas | GET | `connect/ws/charges/fees/calculate` | 200 |
| Sessão 3DS | POST | `connect/ws-sdk/checkout-sdk/sessions` | 200 |

## Fluxos rápidos

### Validar Connect Key

`GET connect/connectInfo` com header Bearer da env. Ver [references/01-connect-key.md](references/01-connect-key.md) e [examples/code/connect-info/](examples/code/connect-info/).

### PIX / boleto / cartão

- PIX: [examples/requests/order-pix.json](examples/requests/order-pix.json) → `POST connect/ws/orders`
- Boleto: [order-boleto.json](examples/requests/order-boleto.json)
- Cartão: public-keys → encrypt → [order-credit-card.json](examples/requests/order-credit-card.json) — [references/05-order-credit-card.md](references/05-order-credit-card.md)

### Payment link

[examples/requests/checkout.json](examples/requests/checkout.json) → `POST connect/ws/checkouts` → URL `links[rel=PAY]`. [references/10-checkout-payment-link.md](references/10-checkout-payment-link.md).

### 3DS

`POST connect/ws-sdk/checkout-sdk/sessions` → SDK browser `authenticate3DS` → `authentication_method` no pedido. [references/11-3ds.md](references/11-3ds.md).

### Parcelas

`GET connect/ws/charges/fees/calculate` — [fees-calculate.query.md](examples/requests/fees-calculate.query.md). [references/12-fees-calculate.md](references/12-fees-calculate.md).

### Recorrência

- **Pedidos (lojista cobra):** INITIAL + `card.store` → SUBSEQUENT com `card.id` — você agenda cada renovação · [order-recurring-initial.json](examples/requests/order-recurring-initial.json)
- **Checkout link (PagBank cobra):** `recurrence_plan` — só `MONTH`/`YEAR`, `length: 1` · [checkout-recurring.json](examples/requests/checkout-recurring.json)
- Guia: [references/13-recurring.md](references/13-recurring.md)

### Split (divisão de pagamento)

`POST connect/ws/orders` com `charges[].splits` (ou `qr_codes[].splits` no PIX). Após pagamento, link `rel: SPLIT` com id `SPLI_...`.

- **Produção:** `GET connect/ws/splits/{splitId}` com Bearer.
- **Sandbox:** o `href` usa `sandbox.api.pagseguro.com` — consulte em `https://internal.sandbox.api.pagseguro.com/splits/{splitId}` **sem** Bearer.

[references/15-split.md](references/15-split.md) · [order-split-credit-card.json](examples/requests/order-split-credit-card.json) · resposta: [split-get-response.json](examples/responses/split-get-response.json)

### Webhooks

[examples/notifications/](examples/notifications/) — [references/07-webhooks.md](references/07-webhooks.md).

## Ordem de leitura

1. [references/09-security-credentials.md](references/09-security-credentials.md)
2. [references/00-overview.md](references/00-overview.md) · [01](references/01-connect-key.md) · [02](references/02-sandbox.md) · [03](references/03-headers.md)
3. [examples/requests/](examples/requests/)
4. Pedidos: [04](references/04-order-pix.md) · [05](references/05-order-credit-card.md) · [06](references/06-order-boleto.md)
5. v2: [10](references/10-checkout-payment-link.md) · [11](references/11-3ds.md) · [12](references/12-fees-calculate.md) · [13](references/13-recurring.md) · [15](references/15-split.md)
6. [07-webhooks](references/07-webhooks.md) · [08-errors](references/08-errors.md)

## Obter Connect Key

- Produção: [pbintegracoes.com/connect/autorizar](https://pbintegracoes.com/connect/autorizar/?utm_source=github-agent-skills&utm_content=skill&utm_medium=link)
- Sandbox: [pbintegracoes.com/connect/sandbox](https://pbintegracoes.com/connect/sandbox/?utm_source=github-agent-skills&utm_content=skill&utm_medium=link)

Armazene em `PAGBANK_CONNECT_KEY` — nunca no repositório.
