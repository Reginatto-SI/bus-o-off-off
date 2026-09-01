# Sandbox

## Identificação

A API detecta sandbox quando a Connect Key começa com **`CONSANDBOX`**. As chamadas em `connect/ws/*` usam o ambiente de testes do PagBank.

Obtenha uma key de sandbox em [pbintegracoes.com/connect/sandbox](https://pbintegracoes.com/connect/sandbox/?utm_source=github-agent-skills&utm_content=docs-sandbox&utm_medium=link).

Não é necessário enviar parâmetros extras na URL — basta usar a Connect Key `CONSANDBOX` no header `Authorization`.

Exemplo (key só via ambiente — ver [09-security-credentials.md](09-security-credentials.md)):

```
POST https://ws.pbintegracoes.com/pspro/v7/connect/ws/orders
Authorization: Bearer ${PAGBANK_CONNECT_KEY}
```

## Pedidos não aparecem no painel PagBank

Pedidos criados em **sandbox** (`CONSANDBOX`) **não aparecem em nenhum painel do PagBank** — nem no painel de produção, nem no painel sandbox da conta. Eles existem **somente na API**: crie, consulte e acompanhe status via `POST`/`GET connect/ws/orders` e pelos webhooks.

Guarde o `id` do pedido (`ORDE_...`) e o `reference_id` do seu sistema; não espere localizar esses pedidos na interface web do PagBank.

## Comportamento de aprovação (sandbox)

Regras documentadas para testes automatizados:

| Valor do pedido (PIX / boleto) | Comportamento típico |
|-------------------------------|----------------------|
| Abaixo de R$ 100,00 | Aprovação automática |
| Entre R$ 100,00 e R$ 200,00 | Atraso de ~5 minutos |
| Acima de R$ 200,00 | Varia conforme cenário |

Valores em centavos: R$ 100 = `10000`.

## Cartões de teste

Consulte a central de ajuda PagBank Integrações para números de cartão de teste em sandbox:

[Cartões de crédito para testes](https://ajuda.pbintegracoes.com/hc/pt-br/articles/22375426666253-Cart%C3%B5es-de-Cr%C3%A9dito-para-Testes-PagBank?utm_source=github-agent-skills&utm_content=docs-sandbox-cartoes-teste&utm_medium=link)

## Fluxo cartão em sandbox

1. `POST connect/ws/public-keys` com `{"type":"card"}`
2. Carregar SDK JS PagBank e chamar `PagSeguro.encryptCard` com a `public_key`
3. `POST connect/ws/orders` com `charges[].payment_method.card.encrypted`

Ver [05-order-credit-card.md](05-order-credit-card.md).

## Split (divisão de pagamento)

Após pagamento com split, o link `rel: SPLIT` na charge aponta para `https://sandbox.api.pagseguro.com/splits/SPLI_...`, mas **essa URL não funciona** em testes.

- Consulta: troque o host para **`internal.sandbox.api.pagseguro.com`** (mesmo path `SPLI_...`).
- **Sem** header `Authorization` nessa consulta direta em sandbox.
- Em produção: `GET connect/ws/splits/{splitId}` com Connect Key.

Detalhes: [15-split.md](15-split.md) · [Como testar Split (ajuda)](https://ajuda.pbintegracoes.com/hc/pt-br/articles/41646134633741-Como-testar-Split-Divis%C3%A3o-de-pagamento?utm_source=github-agent-skills&utm_content=docs-sandbox-split&utm_medium=link).

## Validar ambiente

`GET connect/connectInfo` retorna `"isSandbox": true` para keys `CONSANDBOX`.
