# Divisão de pagamento (Split)

Divide o valor de um pedido entre **dois ou mais recebedores** PagBank (marketplace, multivendedor, comissão + vendedor).

Documentação PagBank: [Divisão de pagamento](https://developer.pagbank.com.br/reference/divisao-de-pagamento) · [Criar pedido com divisão](https://developer.pagbank.com.br/reference/crie-e-pague-pedido-com-divisao-do-pagamento) · [Consultar divisão](https://developer.pagbank.com.br/reference/consulte-a-divisao-do-pagamento).

Testes em sandbox: [Como testar Split (ajuda PB Integrações)](https://ajuda.pbintegracoes.com/hc/pt-br/articles/41646134633741-Como-testar-Split-Divis%C3%A3o-de-pagamento?utm_source=github-agent-skills&utm_content=docs-split-teste&utm_medium=link).

Base: `https://ws.pbintegracoes.com/pspro/v7/` — auth via `PAGBANK_CONNECT_KEY` ([09-security-credentials.md](09-security-credentials.md)).

---

## Criar pedido com split

`POST connect/ws/orders` com `charges[].splits` (cartão) ou `qr_codes[].splits` (PIX), conforme o meio de pagamento.

Exemplo cartão: [order-split-credit-card.json](../examples/requests/order-split-credit-card.json).

### Campos principais

| Campo | Descrição |
|-------|-----------|
| `splits.method` | `FIXED` (valores fixos em centavos) ou percentual (ver doc PagBank) |
| `splits.receivers[]` | Lista de recebedores |
| `receivers[].account.id` | `ACCO_...` do recebedor |
| `receivers[].amount.value` | Centavos para este recebedor |
| `receivers[].type` | `PRIMARY` (marketplace) ou `SECONDARY` (vendedor) |
| `receivers[].reason` | Texto exibido no extrato |
| `receivers[].configurations.custody` | Retenção de valores ao secundário (opcional) |
| `receivers[].configurations.chargeback` | Quem absorve chargeback (`charge_transfer.percentage`) |
| `receivers[].configurations.liable` | MCC / responsabilidade em cartão (ver doc PagBank) |

Soma dos `amount.value` dos receivers deve bater com o valor cobrado (ajuste frete/desconto conforme regra do pedido).

### Obter `account.id` dos recebedores

| Método | Endpoint |
|--------|----------|
| E-mail da conta PagBank | `GET connect/accountId?email={email}` |
| Connect Key do recebedor | `GET connect/connectInfo` → campo `accountId` |

Resposta de `connectInfo` também indica `isSandbox`.

---

## Consultar split após pagamento

Quando o pedido é **pago**, a charge traz um link:

```json
{
  "rel": "SPLIT",
  "href": "https://sandbox.api.pagseguro.com/splits/SPLI_61729513-2C20-4C37-96FB-3C9A16FAD431",
  "type": "GET"
}
```

O `SPLI_...` no path é o **split id**.

### Produção

Use sempre a API PagBank Integrações (com autenticação):

```
GET connect/ws/splits/{splitId}
Authorization: Bearer ${PAGBANK_CONNECT_KEY}
```

Exemplo: `GET .../connect/ws/splits/SPLI_3B068275-7E32-4ECD-B7C4-B8AC59AE2886`

Resposta completa de referência: [split-get-response.json](../examples/responses/split-get-response.json).

#### Campos da resposta (`GET connect/ws/splits/{splitId}`)

| Campo | Descrição |
|-------|-----------|
| `id` | Id do split (`SPLI_...`) |
| `method` | `FIXED` ou percentual — igual ao enviado na criação do pedido |
| `receivers[]` | Um item por recebedor; cada um pode ter um `payment.id` distinto (pagamento parcial da divisão) |
| `receivers[].payment.id` | Id da cobrança **deste** recebedor (UUID, sem prefixo `CHAR_` neste payload) |
| `receivers[].account.id` | `ACCO_...` do recebedor |
| `receivers[].amount.value` | Valor em centavos creditado a este recebedor |
| `receivers[].amount.refunded` | Centavos estornados deste recebedor (ex.: `100` = R$ 1,00 estornado) |
| `receivers[].type` | `PRIMARY` ou `SECONDARY` |
| `receivers[].reason` | Motivo no extrato |
| `receivers[].configurations.custody` | `apply`, `status` (`HELD`, `RELEASED`, etc.), `release.scheduled`, `release.released_at` |
| `receivers[].configurations.chargeback.charge_transfer.percentage` | % de chargeback transferido a este recebedor |
| `receivers[].configurations.liable` | Responsável MCC / chargeback em cartão |
| `receivers[].configurations.statement.amount.show_full_value` | Exibição do valor no extrato (`true` no PRIMARY, frequentemente `false` no SECONDARY) |
| `links[]` | `SELF` (split), `CHARGE` (cobrança principal com prefixo `CHAR_`), `ORDER` (`ORDE_...`) |

Em **sandbox**, a consulta direta em `internal.sandbox.api.pagseguro.com` pode trazer campos adicionais (`status`, `confirmed_at`, `payment.order_id`, etc.). Via Connect em produção, o payload costuma ser o formato acima.

### Sandbox — regra importante da URL

O `href` na resposta vem com host **`sandbox.api.pagseguro.com`**, mas essa URL **não responde** para consulta do split em testes.

**Substitua o host** por `internal.sandbox.api.pagseguro.com`, mantendo o mesmo path:

| Na resposta | Use na consulta |
|-------------|-----------------|
| `https://sandbox.api.pagseguro.com/splits/SPLI_...` | `https://internal.sandbox.api.pagseguro.com/splits/SPLI_...` |

Exemplo que funciona em sandbox:

```
GET https://internal.sandbox.api.pagseguro.com/splits/SPLI_61729513-2C20-4C37-96FB-3C9A16FAD431
```

**Sem** header `Authorization` em sandbox para essa consulta direta ao host internal.

Em **produção**, não use o `href` do PagBank direto no browser sem auth — use `GET connect/ws/splits/{splitId}` com Connect Key.

### Quando o link SPLIT aparece

| Meio | Quando |
|------|--------|
| Cartão aprovado | Na resposta do `POST connect/ws/orders` (charge `PAID`) |
| PIX / boleto / checkout | Após confirmação — webhook ou `GET connect/ws/orders/{orderId}` |

---

## Custódia e liberação

Secundários podem ter `configurations.custody.apply: true` e data em `release.scheduled`.

Para **antecipar liberação** (quando a API permitir):

```
POST connect/ws/splits/{splitId}/custody/release
```

Corpo e regras: [PagBank — custódia](https://developer.pagbank.com.br/reference/crie-e-pague-um-pedido-com-custodia).

---

## Sandbox vs produção (resumo)

| Tópico | Sandbox | Produção |
|--------|---------|----------|
| Criar pedido com split | `POST connect/ws/orders` + `CONSANDBOX` key | Idem + key produção |
| `href` do SPLIT na resposta | `sandbox.api.pagseguro.com` | `api.pagseguro.com` |
| Consultar split | `GET https://internal.sandbox.api.pagseguro.com/splits/{id}` **sem** Bearer | `GET connect/ws/splits/{id}` **com** Bearer |
| Painel PagBank | Pedidos sandbox não aparecem no painel | Pedidos visíveis conforme conta |

---

## Recorrência e 3DS

- **Recorrência** com split: API não permite `liable` em cobranças recorrentes com split — ver [13-recurring.md](13-recurring.md).
- **3DS** com split + liable: integrações podem omitir 3DS — ver [11-3ds.md](11-3ds.md).

---

## Snippets

- Criar pedido: [order-split-credit-card.json](../examples/requests/order-split-credit-card.json)
- Resposta consulta split: [split-get-response.json](../examples/responses/split-get-response.json)
- Consultar split (produção): [examples/code/split/](../examples/code/split/)
