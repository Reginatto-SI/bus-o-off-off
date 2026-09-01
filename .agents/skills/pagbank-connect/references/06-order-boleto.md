# Pedido com boleto

Cria um pedido com cobrança via boleto bancário.

## Endpoint

```
POST connect/ws/orders
```

## Campos principais

O pagamento fica em `charges[]` com `payment_method.type: BOLETO` e objeto `boleto`:

| Campo | Descrição |
|-------|-----------|
| `boleto.due_date` | Vencimento (`YYYY-MM-DD`) |
| `boleto.instruction_lines` | Linhas de instrução no boleto |
| `boleto.holder` | Dados do pagador (nome, CPF, endereço) |
| `charges[].amount.value` | Valor total em centavos |

## Body de exemplo

Ver [examples/requests/order-boleto.json](../examples/requests/order-boleto.json).

## Resposta HTTP

`POST connect/ws/orders` retorna **201 Created** quando o pedido é criado — isso é **sucesso**, não erro. Ver [08-errors.md](08-errors.md).

## Resposta — o que exibir

| Campo | Uso |
|-------|-----|
| `charges[0].payment_method.boleto.barcode` | Linha digitável / código de barras |
| `charges[0].payment_method.boleto.formatted_barcode` | Formato legível |
| `charges[0].links` | URLs `application/pdf` e `image/png` do boleto |
| `charges[0].status` | `WAITING` até pagamento |

## Erros comuns

| `parameter_name` | Causa |
|------------------|-------|
| `customer.tax_id` | CPF/CNPJ inválido |

## Documentação oficial

[PagBank — Criar pedido](https://developer.pagbank.com.br/reference/criar-pedido)

## Exemplos de código

- [examples/code/order-boleto/](../examples/code/order-boleto/)
