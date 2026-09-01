# Recorrência (assinaturas)

O PagBank oferece **mais de um caminho** para cobrança recorrente. Via PagBank Integrações, use a base `https://ws.pbintegracoes.com/pspro/v7/` e os paths `connect/ws/*` documentados abaixo.

> Implementação em CMS/automação (WooCommerce, n8n, cron, portal): anexo opcional [14-recurring-integrations.md](14-recurring-integrations.md) — **não** é necessário para o agente montar payloads.

## Três modelos (escolha um)

| Modelo | Endpoint | Documentação PagBank | Uso típico |
|--------|----------|----------------------|------------|
| **A — Pedido com recorrência** | `POST connect/ws/orders` + `charges[].recurring` | [Criar e pagar pedido com recorrência](https://developer.pagbank.com.br/reference/criar-pagar-pedido-com-recorrencia) | Loja custom, automação (INITIAL / SUBSEQUENT) |
| **B — Checkout recorrente** | `POST connect/ws/checkouts` + `recurrence_plan` | [Checkout recorrente](https://developer.pagbank.com.br/docs/checkout#checkout-recorrente) | Link de assinatura; plano criado no 1º pagamento |
| **C — API Pagamentos Recorrentes** | Planos, assinantes, assinaturas (API própria) | [Pagamentos Recorrentes](https://developer.pagbank.com.br/docs/pagamentos-recorrentes) | Gestão no painel; **PJ** para API; PF usa link no painel |

Este repositório documenta **A** e **B** (Connect). O modelo **C** usa API e autenticação próprias — fora do escopo `connect/ws`; consulte a doc PagBank.

---

## Quem cobra as renovações?

| Modelo | Quem dispara as cobranças seguintes |
|--------|-------------------------------------|
| **A — Pedidos** (`INITIAL` / `SUBSEQUENT`) | **Sistema do lojista** (cron, fila, job). O PagBank processa cada `POST connect/ws/orders` que você enviar; não agenda sozinho. |
| **B — Checkout recorrente** | **PagBank** (assinatura criada no 1º pagamento; cobranças automáticas conforme o plano). |

---

## Modelo A — Pedido com `INITIAL` / `SUBSEQUENT`

Fluxo oficial: criptografar cartão no browser → criar e pagar pedido indicando recorrência.

**Responsabilidade:** sua aplicação deve agendar e executar cada renovação (`SUBSEQUENT`), tratar falhas, retry e cancelamento. Veja checklist em [14-recurring-integrations.md](14-recurring-integrations.md#o-que-replicar-em-sistema-próprio-checklist).

### Cobrança inicial (`INITIAL`)

Conforme [criar-pagar-pedido-com-recorrencia](https://developer.pagbank.com.br/reference/criar-pagar-pedido-com-recorrencia):

1. `POST connect/ws/public-keys` → criptografar com SDK PagBank (`PagSeguro.encryptCard`).
2. `POST connect/ws/orders` com:
   - `charges[].payment_method.card.encrypted`
   - `charges[].payment_method.card.store`: **`true`** — o cartão fica **salvo no PagBank** para uso nas cobranças seguintes (obrigatório para renovação com `card.id`)
   - `charges[].recurring.type`: **`"INITIAL"`**

Exemplo: [examples/requests/order-recurring-initial.json](../examples/requests/order-recurring-initial.json).

Na resposta, guarde **`charges[].payment_method.card.id`** (quando presente) no seu banco — é o token para os `SUBSEQUENT`. Em sandbox o campo pode não vir — ver [discussão PagBank](https://developer.pagbank.com.br/v1/discuss/670aeed2bcf09a006ecc0e99).

### Cobranças seguintes (`SUBSEQUENT`)

Disparadas **pelo seu sistema** na data de vencimento (não pelo PagBank automaticamente):

- `charges[].recurring.type`: **`"SUBSEQUENT"`**
- Cartão: `charges[].payment_method.card.id` obtido no **INITIAL** — **não** reenvie PAN nem `encrypted` de novo (salvo troca de cartão)
- Mesmo fluxo de [05-order-credit-card.md](05-order-credit-card.md), trocando `encrypted` por `id`

Exemplo: [examples/requests/order-recurring-subsequent.json](../examples/requests/order-recurring-subsequent.json).

### Cartão Elo

Para Elo, a primeira cobrança retorna `brand_reference_id` (NRID). Nas **SUBSEQUENT** com Elo, envie esse valor conforme [recorrência Elo](https://developer.pagbank.com.br/reference/criar-e-pagar-pedidos-com-identificacao-de-recorrencia-elo).

### Connect Key (PagBank Integrações)

Keys `CONPSFLEX...` **não** suportam recorrência em contas novas na PagBank Integrações — use keys **14 ou 30 dias** (`CONPS14DIAS...`, `CONPS30DIAS...`). Erro típico: `INVALID_APP_TYPE`.

---

## Modelo B — Checkout / link recorrente

`POST connect/ws/checkouts` com objeto **`recurrence_plan`**.

Conforme [Checkout recorrente](https://developer.pagbank.com.br/docs/checkout#checkout-recorrente):

| Campo | Descrição |
|-------|-----------|
| `recurrence_plan.name` | Nome do plano |
| `recurrence_plan.interval.unit` | **`MONTH`** ou **`YEAR`** apenas (únicos valores aceitos) |
| `recurrence_plan.interval.length` | Sempre **`1`** (mensal = 1 mês; anual = 1 ano — não use outros valores) |
| `recurrence_plan.billing_cycles` | Número de ciclos de cobrança (omitir ou ajustar para recorrência contínua conforme regra de negócio) |

Exemplo de intervalos válidos:

| Plano | `unit` | `length` |
|-------|--------|----------|
| Mensal | `MONTH` | `1` |
| Anual | `YEAR` | `1` |

Regras importantes:

- **Somente cartão de crédito** em `payment_methods` (por enquanto na doc PagBank).
- No 1º pagamento o comprador paga no checkout PagBank; **assinatura é criada automaticamente**; **cobranças seguintes são automáticas pelo PagBank** (diferente do modelo A).
- Erro `payment_method_not_allowed_for_recurrence` se misturar PIX/boleto com `recurrence_plan`.
- Inativar link: mesmo fluxo de checkout comum (`POST .../inactivate`).
- Gestão de assinaturas também no **painel de recorrência** PagBank.

Guia: [10-checkout-payment-link.md](10-checkout-payment-link.md) · JSON: [checkout-recurring.json](../examples/requests/checkout-recurring.json).

---

## Webhooks

| Modelo | Notificação |
|--------|-------------|
| A (orders) | Webhooks de pedido/cobrança — [07-webhooks.md](07-webhooks.md); campo `charges[].recurring.type` |
| B (checkout) | `notification_urls` / `payment_notification_urls`; consulte `GET connect/ws/checkouts/{id}` → `orders[]` |
| C (assinaturas API) | [Webhooks assinaturas](https://developer.pagbank.com.br/devpagbank/reference/webhooks-assinaturas) |

Em **SUBSEQUENT** com charge `DECLINED`, trate retry/cancelamento no seu sistema (ex.: suspender assinatura, N tentativas, depois cancelar).

---

## Limitações

- Split com `liable` em cobrança recorrente: a API não permite liable em cobranças recorrentes com split
- 3DS + split liable: 3DS pode ser omitido — [11-3ds.md](11-3ds.md)
- PF: API Pagamentos Recorrentes (modelo C) restrita a PJ; PF usa [link recorrente no painel](https://developer.pagbank.com.br/docs/pagamentos-recorrentes#link-recorrente)

## Snippets

[examples/code/recurring/](../examples/code/recurring/)
