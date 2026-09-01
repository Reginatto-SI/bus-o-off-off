# Pedido PIX

Cria um pedido com QR Code PIX para pagamento.

## Endpoint

```
POST connect/ws/orders
```

URL completa:

```
https://ws.pbintegracoes.com/pspro/v7/connect/ws/orders
```

Com Connect Key `CONSANDBOX...`, a API usa automaticamente o ambiente sandbox do PagBank.

## Campos obrigatórios

| Campo | Descrição |
|-------|-----------|
| `customer.name` | Nome do comprador |
| `customer.email` | E-mail |
| `customer.tax_id` | CPF ou CNPJ válido |
| `qr_codes` | Array com pelo menos um QR (valor e expiração) |
| `items` | Recomendado: lista de itens do pedido |

## Body de exemplo

Copie ou adapte o JSON abaixo (arquivo completo: [examples/requests/order-pix.json](../examples/requests/order-pix.json)):

```json
{
  "reference_id": "pedido-1001",
  "customer": {
    "name": "Cliente Exemplo",
    "email": "cliente@exemplo.test",
    "tax_id": "01234567890"
  },
  "items": [
    {
      "reference_id": "item-1",
      "name": "Produto de teste",
      "quantity": 1,
      "unit_amount": 5900
    }
  ],
  "notification_urls": [
    "https://sua-loja.test/webhook/pagbank"
  ],
  "qr_codes": [
    {
      "amount": { "value": 5900, "currency": "BRL" },
      "expiration_date": "2026-12-31T23:59:59+00:00"
    }
  ]
}
```

`unit_amount` e `qr_codes[0].amount.value` devem ser iguais (centavos). `expiration_date` deve ser **data futura**.

## Resposta HTTP

| Código | Significado |
|--------|-------------|
| **201** | Pedido criado com sucesso (resposta esperada) |
| 4xx / 5xx | Erro — ver body `error_messages` em [08-errors.md](08-errors.md) |

Não trate `201` como erro de comunicação.

## Resposta — o que usar na sua aplicação

| Campo | Uso |
|-------|-----|
| `id` | ID do pedido PagBank (`ORDE_...`) |
| `qr_codes[0].text` | Copia e cola PIX |
| `qr_codes[0].links` | `QRCODE.PNG` e `QRCODE.BASE64` para exibir imagem |
| `qr_codes[0].expiration_date` | Validade do QR |

## Erros comuns

| `parameter_name` | Causa |
|------------------|-------|
| `qr_codes[0].expiration_date` | Data no passado |
| `customer.tax_id` | CPF/CNPJ inválido |
| `customer` | Objeto ausente |

Ver [08-errors.md](08-errors.md).

## Documentação oficial (estrutura do pedido)

[PagBank — Criar pedido](https://developer.pagbank.com.br/reference/criar-pedido)

## Exemplos de código

- [examples/code/order-pix/](../examples/code/order-pix/)
