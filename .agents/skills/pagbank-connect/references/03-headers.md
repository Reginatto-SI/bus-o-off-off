# Headers HTTP

Este documento cobre **somente cabeçalhos HTTP**. Regras de body (centavos, `notification_urls`, etc.) estão em [00-overview.md](00-overview.md) e [07-webhooks.md](07-webhooks.md).

## Obrigatórios

| Header | Valor |
|--------|-------|
| `Authorization` | `Bearer {connectKey}` |
| `Content-Type` | `application/json` |

## Opcionais (telemetria)

Enviados pelas integrações oficiais para identificar a plataforma. **Omita** se não souber o valor.

| Header | Exemplo |
|--------|---------|
| `Platform` | `AI`, `n8n`, `WooCommerce`, `Magento 2` |
| `Platform-Version` | `1.0.0`, versão do WordPress, etc. |
| `Module-Version` | Versão do plugin ou integração |

Para integrações geradas por IA, use `Platform: AI`.

## Usado em integrações oficiais (não obrigatório no MVP)

| Header | Observação |
|--------|------------|
| `Api-Version` | `4.0` — enviado pelo módulo Magento 2 |
| `accept` | `application/json` |

## Exemplo

Use a Connect Key **somente** via variável de ambiente (nunca hardcode):

```http
POST /pspro/v7/connect/ws/orders HTTP/1.1
Host: ws.pbintegracoes.com
Authorization: Bearer ${PAGBANK_CONNECT_KEY}
Content-Type: application/json
Platform: AI
```

Ver [09-security-credentials.md](09-security-credentials.md).

## O que não é header

| Conceito | Onde documentar |
|----------|-----------------|
| Valores em centavos | [00-overview.md](00-overview.md) |
| `notification_urls` (máx. 100 caracteres por URL) | [07-webhooks.md](07-webhooks.md) |
| Corpo JSON do pedido | [04-order-pix.md](04-order-pix.md) e correlatos |
