# GET charges/fees/calculate — parâmetros de query

Substitua valores conforme seu checkout. Autenticação: `Authorization: Bearer $PAGBANK_CONNECT_KEY` (variável de ambiente).

## Query string

```
payment_methods=CREDIT_CARD
value=59000
credit_card_bin=411111
max_installments=12
max_installments_no_interest=3
```

## URL completa (exemplo)

```
GET https://ws.pbintegracoes.com/pspro/v7/connect/ws/charges/fees/calculate?payment_methods=CREDIT_CARD&value=59000&credit_card_bin=411111&max_installments=12&max_installments_no_interest=3
```

## Sandbox

Em testes, se o BIN real falhar, use `credit_card_bin=555566` (padrão em integrações oficiais).
