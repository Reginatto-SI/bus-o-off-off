# Consulta de taxas e parcelas (`charges/fees/calculate`)

Calcula **parcelas** e juros do comprador antes de criar o pedido com cartão parcelado.

Documentação PagBank: [Calcular taxas](https://developer.pagbank.com.br/reference/calcular-taxas).

## Endpoint

```
GET connect/ws/charges/fees/calculate?{query}
```

| Parâmetro | Obrigatório | Exemplo |
|-----------|-------------|---------|
| `payment_methods` | Sim | `CREDIT_CARD` |
| `value` | Sim | Valor total em **centavos** |
| `credit_card_bin` | Sim* | 6 primeiros dígitos do cartão |
| `max_installments` | Não | Limite de parcelas |
| `max_installments_no_interest` | Não | Parcelas sem juros ao comprador |

\* Em **sandbox**, integrações oficiais usam BIN de teste `555566` quando o cartão de teste não é aceito pela API. Em produção, também usa-se `555566` para pre-popular dropdown ou opções de parcelas antes do cliente preencher os dados do cartão, ou exibir simulações na página de produto e outros lugares.

## Exemplo

Query documentada em [examples/requests/fees-calculate.query.md](../examples/requests/fees-calculate.query.md).

```
GET .../connect/ws/charges/fees/calculate?payment_methods=CREDIT_CARD&value=59000&credit_card_bin=411111&max_installments=12&max_installments_no_interest=3
```

## Resposta

Estrutura resumida:

```json
{
  "payment_methods": {
    "credit_card": {
      "mastercard": {
        "installment_plans": [
          {
            "installments": 1,
            "installment_value": 59000,
            "amount": { "value": 59000, "fees": { "buyer": { "interest": { "total": 0 } } } }
          }
        ]
      }
    }
  }
}
```

### Aplicar no `POST connect/ws/orders`

Do item escolhido em `installment_plans` (bandeira retornada em `payment_methods.credit_card.{brand}`):

| Origem (`fees/calculate`) | Destino (`charges[]`) |
|---------------------------|------------------------|
| `installments` | `payment_method.installments` |
| `amount.value` | `amount.value` (total da cobrança em centavos, já com juros se houver) |
| `amount.fees` | `amount.fees` — **somente** se `amount.fees.buyer.interest.total` > 0 |

Exemplo com juros ao comprador (3x):

```json
"charges": [{
  "amount": {
    "value": 61200,
    "currency": "BRL",
    "fees": {
      "buyer": {
        "interest": {
          "installments": 3,
          "total": 2200
        }
      }
    }
  },
  "payment_method": {
    "type": "CREDIT_CARD",
    "installments": 3,
    "capture": true,
    "card": { "encrypted": "..." }
  }
}]
```

À vista (`installments: 1`) com `interest.total: 0`, omita `amount.fees` e use `amount.value` igual ao valor do carrinho.

## Quando chamar

| Cenário | Ação |
|---------|------|
| Checkout com seletor de parcelas | GET antes de exibir opções |
| Pedido à vista (1x) | Opcional |
| Após criar pedido | Valores de parcela/juros vêm na resposta/webhook — evite recalcular |

## Snippets

[examples/code/fees-calculate/](../examples/code/fees-calculate/)
