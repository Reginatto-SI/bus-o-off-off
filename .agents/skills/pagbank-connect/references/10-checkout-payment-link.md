# Payment link (Checkout)

Cria um **link de pagamento** hospedado pelo PagBank. O comprador abre a URL (`links` com `rel: PAY`) e conclui o pagamento no ambiente PagBank.

Documentação oficial:

- [Checkout e Link de Pagamento](https://developer.pagbank.com.br/docs/checkout)
- [Criar checkout](https://developer.pagbank.com.br/reference/criar-checkout)
- [Consultar checkout](https://developer.pagbank.com.br/reference/consultar-checkout)
- [Checkout recorrente](https://developer.pagbank.com.br/docs/checkout#checkout-recorrente)

## Endpoint

| Operação | Método | Path | HTTP sucesso |
|----------|--------|------|--------------|
| Criar link | POST | `connect/ws/checkouts` | **201** |
| Consultar | GET | `connect/ws/checkouts/{checkoutId}` | 200 |
| Inativar | POST | `connect/ws/checkouts/{checkoutId}/inactivate` | 200 |
| Ativar | POST | `connect/ws/checkouts/{checkoutId}/activate` | 200 |

Base: `https://ws.pbintegracoes.com/pspro/v7/` — auth via `PAGBANK_CONNECT_KEY` ([09-security-credentials.md](09-security-credentials.md)).

## Fluxo resumido

1. `POST connect/ws/checkouts` com itens, meios de pagamento, `redirect_url`, etc.
2. Resposta: `id` (`CHEC_...`) e `links[]` com `rel: PAY` → URL para enviar ao cliente.
3. Cliente paga no PagBank; opcionalmente retorna para `redirect_url`.
4. Webhooks e `GET checkouts/{id}` para ver `orders[]` gerados.

## Payload (checkout simples)

Use [examples/requests/checkout.json](../examples/requests/checkout.json).

| Campo | Observação |
|-------|------------|
| `reference_id` | ID do seu sistema |
| `items[].unit_amount` | Centavos |
| `payment_methods` | `CREDIT_CARD`, `PIX`, `BOLETO`, etc. |
| `notification_urls` | **Uma** URL (máx. 100 caracteres) |
| `redirect_url` | Retorno após pagamento |
| `expiration_date` | ISO 8601; opcional (sem prazo = link permanece ativo) |
| `customer_modifiable` | `true`: comprador preenche dados no checkout |
| `shipping.address_modifiable` | Controla edição do endereço |

Valor cobrado: `itens + frete + additional_amount - discount_amount` (doc PagBank).

## Parcelas no checkout

Para limitar parcelas ou assumir juros como vendedor, use `payment_methods_configs` com `config_options`:

| `option` | Função |
|----------|--------|
| `INSTALLMENTS_LIMIT` | Máximo de parcelas |
| `INTEREST_FREE_INSTALLMENTS` | Parcelas sem juros pagas pelo vendedor |

Exemplo na [doc Checkout](https://developer.pagbank.com.br/docs/checkout#repassando-taxas-de-parcelamento-ao-vendedor).

## Checkout recorrente

Automatiza mensalidades/assinaturas: **1ª cobrança no checkout** → **assinatura criada** → demais cobranças automáticas.

Inclua `recurrence_plan`:

```json
"recurrence_plan": {
  "name": "Plano mensal",
  "interval": { "unit": "MONTH", "length": 1 },
  "billing_cycles": 12
}
```

Para plano **anual**, use `"unit": "YEAR", "length": 1`.

| Regra | Detalhe |
|-------|---------|
| `interval.unit` | Apenas **`MONTH`** ou **`YEAR`** |
| `interval.length` | Sempre **`1`** (não envie 2, 3, etc.) |
| Meios de pagamento | Apenas **CREDIT_CARD** |
| Renovações | **PagBank** cobra automaticamente após o 1º pagamento (não depende de cron do lojista) |
| `billing_cycles` | Ciclos de cobrança do plano (ver exemplo oficial) |
| Erro comum | `payment_method_not_allowed_for_recurrence` com PIX/boleto |

Exemplo: [checkout-recurring.json](../examples/requests/checkout-recurring.json).

Recorrência em **pedidos** (`INITIAL`/`SUBSEQUENT`) é outro modelo — [13-recurring.md](13-recurring.md).

## Resposta

- `id`: `CHEC_...`
- `status`: `ACTIVE`, etc.
- `links[]`: `rel: PAY` (pagamento), `SELF`, `INACTIVATE`
- Checkout recorrente: `recurrence_plan.id` (`PLAN_...`) na resposta

## Webhooks

`notification_urls` e `payment_notification_urls`. Consulte pedidos vinculados:

`GET connect/ws/checkouts/{checkoutId}` → `orders[]`.

## Snippets

[examples/code/checkout/](../examples/code/checkout/)
