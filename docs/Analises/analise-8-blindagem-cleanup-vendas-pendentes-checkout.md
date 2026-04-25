# 1. O que foi ajustado

Foi implementada uma **blindagem defensiva mínima dentro do cleanup oficial** (`cleanup-expired-locks`) para alcançar vendas órfãs do checkout público que poderiam ficar em `pendente_pagamento` sem lock/ticket ativo.

Ajuste aplicado sem criar rotina paralela:

1. mantém o pipeline atual por `seat_locks` expirados
2. adiciona uma varredura complementar segura de `sales` do checkout público pendente
3. cancela somente candidatas com alta confiança de abandono
4. mantém logs operacionais/técnicos rastreáveis por `sale_id`, `company_id` e `payment_environment`

---

# 2. Como o cleanup funcionava antes

Antes, o cleanup do checkout público partia de `seat_locks` expirados:

- buscava locks vencidos
- derivava `sale_ids` a partir desses locks
- validava ausência de lock ativo
- cancelava vendas `pendente_pagamento`
- removia resíduos (locks expirados e `sale_passengers`)

Limitação: quando a venda não aparecia mais nesse caminho (ex.: lock não rastreável por `sale_id`), ela podia não entrar na lista de candidatas.

---

# 3. Lacuna estrutural identificada

A lacuna ocorre quando existe venda do checkout público:

- `status = pendente_pagamento`
- acima da janela operacional
- sem ticket
- sem lock ativo
- sem confirmação financeira

mas sem lock expirado vinculável em `seat_locks.sale_id` para iniciar o pipeline original.

Nessa situação, o cleanup antigo podia não alcançar a venda, deixando pendência órfã.

---

# 4. Regra nova de blindagem

A nova blindagem atua **após** o pipeline normal de lock expirado, com critérios explícitos:

## 4.1 Pré-filtro de candidatas órfãs

- `sales.status = pendente_pagamento`
- `sale_origin = online_checkout`
- `reservation_expires_at IS NULL`
- `payment_confirmed_at IS NULL`
- `created_at < now - 15 min`

## 4.2 Guard rails de segurança antes de cancelar

Para cada candidata, só cancela quando:

- **não tem lock ativo** (`seat_locks.expires_at > now`)
- **não tem ticket emitido**
- **não está com status confirmado no Asaas** (`RECEIVED`, `CONFIRMED`, `RECEIVED_IN_CASH` bloqueiam cancelamento)
- `asaas_payment_status` permitido para cancelamento defensivo: `null`, `PENDING`, `AWAITING_RISK_ANALYSIS`, `OVERDUE`

## 4.3 Ação aplicada nas elegíveis

- atualiza `sales` para `cancelado`
- `cancel_reason` explícito de blindagem do cleanup oficial
- grava `sale_logs` com ação `auto_cancelled` e motivo rastreável
- limpa resíduos acessórios por `sale_id` (`sale_passengers`, `seat_locks`)

---

# 5. Medidas de segurança

A implementação evita cancelar venda válida porque:

1. exige `status = pendente_pagamento` e `payment_confirmed_at IS NULL`
2. exige janela mínima de 15 minutos (mesma janela operacional já usada no checkout)
3. exige ausência de lock ativo e ausência de ticket
4. bloqueia cancelamento quando `asaas_payment_status` indica confirmação
5. mantém cláusula de guarda na atualização (`eq(status, 'pendente_pagamento')` e `is(payment_confirmed_at, null)`)
6. não toca fluxo de reserva manual (`reservado`) nem seu pipeline próprio

---

# 6. Arquivos alterados

- `supabase/functions/cleanup-expired-locks/index.ts`
- `analise-8-blindagem-cleanup-vendas-pendentes-checkout.md`

---

# 7. Impacto esperado

Com a blindagem:

- reduz `pendente_pagamento` órfã do checkout público
- reduz ruído no diagnóstico por pendências antigas sem ação
- reduz necessidade de limpeza manual futura
- mantém assento livre quando não há lock/ticket ativo
- preserva separação entre checkout público e reserva manual

---

# 8. Checklist de validação manual

- [ ] Checkout público não pago expira e é cancelado automaticamente.
- [ ] Venda paga (ou com status confirmado) não é cancelada.
- [ ] Reserva manual (`reservado`) não é afetada.
- [ ] Venda com lock ativo válido não é cancelada.
- [ ] Venda órfã sem lock/ticket acima da janela segura é cancelada.
- [ ] Logs (`logCleanup` + `sale_logs`) ficam rastreáveis com motivo claro.
- [ ] Sandbox e produção mantêm o mesmo comportamento funcional.
