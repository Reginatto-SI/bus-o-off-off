# 1. O que foi ajustado

Foi ajustada **apenas** a regra de classificação operacional da tela `/admin/diagnostico-vendas` para o cenário de checkout pendente com lock ausente.

Mudança aplicada:

- quando a venda está em checkout público pendente e sem impacto operacional atual (critérios objetivos abaixo), o caso deixa de cair em divergência crítica e passa para **Atenção/Acompanhamento** com nova mensagem:
  - **`operationalLabel`: "Pendência financeira sem lock ativo"**

Sem mudanças em:

- checkout público
- webhook
- verify-payment-status
- cleanup/cron/cancelamento automático
- geração de tickets

---

# 2. Regra antiga

Antes, no bloco de `isPendingCheckout`, qualquer `lockStatus.isMissing` era classificado diretamente como:

- `category: divergencia`
- prioridade crítica
- label: **"Checkout sem bloqueio temporário"**

Isso ocorria sem diferenciar o contexto financeiro/operacional do checkout pendente.

---

# 3. Regra nova

Mantivemos a regra base de lock ausente, mas adicionamos um **rebaixamento explícito e objetivo** para um único cenário:

## Rebaixa para Atenção quando TODOS forem verdadeiros:

- `sale_origin = online_checkout`
- `status = pendente_pagamento`
- `asaas_payment_status` em `PENDING` ou `AWAITING_RISK_ANALYSIS`
- `ticket_count = 0`
- `active_lock_count = 0`
- `reservation_expires_at = null`
- e `lockStatus.isMissing = true`

Nessa combinação, a tela mostra:

- categoria: `atencao`
- título: **"Pendência financeira sem lock ativo"**
- detalhe: checkout pendente no gateway sem bloqueio operacional ativo no momento

---

# 4. Cenários que deixam de ser críticos

Deixam de ser divergência crítica os casos que representam:

- checkout público pendente no gateway (`PENDING`/`AWAITING_RISK_ANALYSIS`)
- sem ticket emitido
- sem lock ativo atual
- sem reserva manual associada
- sem evidência de ocupação operacional do veículo

Esses casos agora são tratados como **acompanhamento (Atenção)** para reduzir ruído/falso positivo.

---

# 5. Cenários que continuam críticos

Continuam em divergência crítica:

1. `lockStatus.isMissing` fora do contexto de rebaixamento acima (regra antiga preservada)
2. pagamento confirmado com venda ainda pendente (`hasGatewayDivergence`)
3. lock expirado aguardando cleanup (`lockStatus.isExpired` em checkout pendente)
4. demais incompatibilidades já existentes na lógica operacional da tela

Ou seja, o alerta crítico não foi removido, apenas contextualizado.

---

# 6. Arquivos alterados

- `src/pages/admin/SalesDiagnostic.tsx`
- `analise-7-ajuste-regra-divergencia-checkout-sem-bloqueio.md`

---

# 7. Checklist de validação manual

- [ ] Venda `pendente_pagamento` com `asaas_payment_status = PENDING`, `ticket_count=0`, `active_lock_count=0`, `reservation_expires_at=null`, `sale_origin=online_checkout` **não aparece mais como crítico indevido**.
- [ ] Venda com inconsistência real (ex.: gateway confirmado e venda pendente) **continua crítica**.
- [ ] A tela mantém agrupamento/status coerentes (`Venda com divergência`, `Venda em acompanhamento`, etc.).
- [ ] Não houve alteração de estado de venda no backend.
- [ ] Nenhuma chamada operacional nova foi criada.
