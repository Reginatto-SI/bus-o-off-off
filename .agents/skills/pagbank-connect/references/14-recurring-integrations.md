# Recorrência — como as integrações oficiais implementam

Anexo **opcional** para desenvolvedores que portam lógica de assinatura para outro CMS ou automação. O agente de IA deve usar [13-recurring.md](13-recurring.md) e os JSON em `examples/requests/` — não depende deste arquivo.

Documentação baseada no comportamento observado nas integrações PagBank Integrações (WooCommerce e n8n). Sem referência a arquivos de código externos.

---

## Resumo por integração

| Integração | Modelo A (INITIAL / SUBSEQUENT) | Modelo B (checkout `recurrence_plan`) |
|------------|--------------------------------|----------------------------------------|
| WooCommerce (PagBank Connect) | **Completo** — cron, banco local, portal do assinante | **Não** — só link de pagamento redirect sem plano recorrente |
| n8n (PagBank node) | **Manual** — você monta fluxos e agenda `SUBSEQUENT` | **Suportado** — `POST checkouts` com `recurrence_plan` no body |
| Magento 2 / OpenMage (módulo PagBank) | **Não implementado** no escopo atual | **Não implementado** |

---

## WooCommerce — modelo A (pedidos recorrentes)

### O que a loja configura

- Produtos podem ser marcados como **assinatura** (frequência, ciclo, trial, taxa inicial, desconto por N ciclos, máximo de ciclos).
- Carrinho **não mistura** produto comum com produto de assinatura.
- Checkout de assinatura exige **cliente logado** (sem convidado).
- Connect Key do tipo flex (`CONPSFLEX`) **não** pode usar recorrência — exige key 14 ou 30 dias.

### Primeira compra (cobrança INITIAL)

1. Cliente finaliza checkout com cartão (ou, em cenários suportados, PIX/boleto na primeira cobrança).
2. O pedido WooCommerce é marcado como **cobrança inicial** da assinatura.
3. Na API PagBank, o pedido sai com:
   - `charges[].recurring.type` = `INITIAL`
   - `charges[].payment_method.card.store` = `true` (cartão salvo no PagBank)
   - `card.encrypted` na primeira vez (PAN nunca vai em claro).
4. Quando o pagamento é confirmado (webhook/resposta), a loja:
   - Lê `charges[].payment_method.card.id` e dados mascarados do cartão na resposta.
   - Grava um registro de **assinatura** em tabela própria (`pagbank_recurring`), incluindo:
     - ID do pedido inicial, valor recorrente, frequência, próximo vencimento (`next_bill_at`), status, trial, descontos.
     - Campo `payment_info` (JSON) com método de pagamento e **`card.id`** para renovações.
   - Envia e-mail de boas-vindas se a assinatura ficou ativa.

### Renovações (cobrança SUBSEQUENT) — responsabilidade da loja

O PagBank **não** agenda renovações neste modelo. A loja faz:

1. **Agendador (WP-Cron)** — por padrão a cada hora (configurável), dispara processamento de assinaturas.
2. **Seleção** — busca assinaturas com `next_bill_at` vencido e status `ACTIVE`, ou `SUSPENDED` ainda com tentativas de retry.
3. **Lock** — evita processar a mesma assinatura duas vezes em paralelo (bloqueio temporário ~10 min).
4. **Novo pedido WooCommerce** — pedido filho ligado ao pedido inicial, total = valor da assinatura (menos desconto se ainda aplicável), meta `_pagbank_is_recurring` = true.
5. **Chamada API** — `POST connect/ws/orders` com:
   - `charges[].recurring.type` = `SUBSEQUENT`
   - `card.id` lido do `payment_info` salvo (sem `encrypted`, sem PAN).
   - Suporte a PIX/boleto na renovação se foi assim na assinatura (menos comum que cartão).
6. **Após resposta/webhook**:
   - Se **pago**: atualiza `next_bill_at` para o próximo período (frequência + ciclo do plano).
   - Se **recusado** (`DECLINED`) em SUBSEQUENT: conforme configuração, suspende assinatura com N tentativas restantes ou cancela.
   - Se atingiu **máximo de ciclos**: marca assinatura como concluída.

### Portal do cliente

- Área **Minhas assinaturas** no WooCommerce: ver status, histórico de pedidos da assinatura, pausar/cancelar (conforme regras), trocar cartão (nova cobrança INITIAL ou fluxo de atualização de pagamento).

### Outros crons da loja

- Cancelamentos pendentes (`PENDING_CANCEL` → `CANCELED`).
- Assinaturas pausadas com vencimento expirado (remove acesso a conteúdo restrito, se configurado).

### Limitações práticas na integração

- **Split com liable** em cobrança recorrente: a API não aceita; a integração remove `liable` dos receivers em pedidos INITIAL/SUBSEQUENT com split.
- **3DS** pode ser omitido quando há split com liable (regra da integração de cartão).

---

## n8n — automação

### Modelo A

- Nodes criam **pedidos** (`POST connect/ws/orders`) como qualquer integração API.
- **Não há** módulo de assinatura embutido: você deve:
  1. Guardar `card.id` após um pedido INITIAL (banco, planilha, datastore do n8n).
  2. Agendar workflow (Schedule Trigger) na data de renovação.
  3. Montar pedido SUBSEQUENT com `examples/requests/order-recurring-subsequent.json`.

### Modelo B

- O node de **criar checkout** chama `POST connect/ws/checkouts`.
- Para link recorrente, inclua `recurrence_plan` no JSON (somente `CREDIT_CARD`; `interval.unit` = `MONTH` ou `YEAR`; `length` = `1`).
- Exemplo alinhado ao mock interno do projeto n8n: mesmo formato de [checkout-recurring.json](../examples/requests/checkout-recurring.json).
- Renovações ficam a cargo do **PagBank** após o primeiro pagamento no link.

---

## O que replicar em sistema próprio (checklist)

Se você **não** usa WooCommerce nem checkout recorrente PagBank:

| Etapa | Modelo A |
|-------|----------|
| 1 | `POST connect/ws/orders` INITIAL + `card.store: true` |
| 2 | Persistir `card.id` + calendário (`next_bill_at`) |
| 3 | Job/cron na data de vencimento |
| 4 | `POST connect/ws/orders` SUBSEQUENT com `card.id` |
| 5 | Tratar webhook DECLINED (retry / cancelar) |
| 6 | Respeitar `billing_cycles` / max cycles se aplicável |

| Etapa | Modelo B |
|-------|----------|
| 1 | `POST connect/ws/checkouts` com `recurrence_plan` |
| 2 | Enviar link `PAY` ao cliente |
| 3 | Tratar webhooks / `GET checkouts/{id}` |

---

## Ver também

- [13-recurring.md](13-recurring.md) — contrato API (agente)
- [10-checkout-payment-link.md](10-checkout-payment-link.md) — checkout e `recurrence_plan`
- [PagBank — criar pedido com recorrência](https://developer.pagbank.com.br/reference/criar-pagar-pedido-com-recorrencia)
- [PagBank — checkout recorrente](https://developer.pagbank.com.br/docs/checkout#checkout-recorrente)
