# Step 2 — Política de reserva manual administrativa

## 1. Problema encontrado

Reservas administrativas em `reservado` eram criadas corretamente no fluxo manual do admin, mas não possuíam uma validade explícita própria. Como o cleanup central só tratava `pendente_pagamento` com base em `seat_locks.expires_at`, vendas administrativas podiam permanecer abertas por tempo indefinido, mantendo assentos ocupados via `tickets` e gerando ruído operacional.

## 2. Regra anterior

- checkout público:
  - cria `seat_locks` com 15 minutos;
  - cria venda em `pendente_pagamento`;
  - cleanup cancela pelo vencimento do lock.
- administrativo/manual:
  - cria venda em `reservado`;
  - ocupa assentos por `tickets` imediatamente;
  - não tinha uma validade própria explícita;
  - não era tratado pelo cleanup automático.

## 3. Regra nova implementada

Foi implementada uma validade própria para reservas manuais administrativas por meio do campo `sales.reservation_expires_at`.

### Regra aplicada
- reservas criadas manualmente no admin agora nascem com `reservation_expires_at = now + 72h`;
- o checkout público continua usando exclusivamente `seat_locks.expires_at` para `pendente_pagamento`;
- o cleanup agora trata dois fluxos separados:
  - `pendente_pagamento` → vence por `seat_locks.expires_at`;
  - `reservado` manual → vence por `sales.reservation_expires_at`.

## 4. Como o fluxo administrativo foi tratado

O fluxo administrativo foi mapeado no `NewSaleModal`:
- a venda manual/reserva nasce como `reservado`;
- os assentos são ocupados imediatamente via `tickets`;
- agora a venda também recebe `reservation_expires_at` na criação;
- o log de criação passou a registrar explicitamente a validade da reserva.

Também foi tratada a reversão operacional em `Sales.tsx`:
- ao voltar uma venda para `reservado`, a validade é renovada para mais 72h;
- ao marcar como `pago` ou cancelar manualmente, a validade é limpa.

## 5. Como o checkout público foi preservado

O fluxo público não foi alterado em sua fonte de verdade:
- continua criando `seat_locks` com TTL de 15 minutos;
- continua usando `pendente_pagamento`;
- continua sendo cancelado apenas pela lógica baseada em lock técnico.

A nova regra não usa heurística de `created_at` para o público e não mistura `reservado` do administrativo com `pendente_pagamento` do checkout.

## 6. Arquivos alterados

- `src/components/admin/NewSaleModal.tsx`
- `src/pages/admin/Sales.tsx`
- `supabase/functions/cleanup-expired-locks/index.ts`
- `supabase/migrations/20261026090000_add_manual_reservation_expiration.sql`
- `src/types/database.ts`
- `src/integrations/supabase/types.ts`

## 7. Migration criada (se houver)

### Migration criada
- `supabase/migrations/20261026090000_add_manual_reservation_expiration.sql`

### O que ela faz
- adiciona `sales.reservation_expires_at`;
- documenta semanticamente a coluna com `COMMENT`;
- faz backfill conservador para reservas administrativas antigas (`sale_origin = 'admin_manual'`), aplicando:
  - `created_at + 72h`, ou
  - pelo menos `now() + 24h`, o que for maior.

### Motivo do backfill conservador
Evita cancelar imediatamente reservas antigas já existentes no momento da aplicação da migration, reduzindo risco operacional cego logo após o deploy.

## 8. Comentários adicionados no código

Foram adicionados comentários fortes para explicar:
- por que reservas administrativas não podem herdar o TTL do checkout público;
- por que `reservation_expires_at` foi criada como fonte explícita da validade manual;
- por que o cleanup agora trata dois mundos separados;
- por que tickets de reservas manuais vencidas precisam ser removidos para liberar assentos;
- por que reabrir uma venda como `reservado` renova a validade operacional.

## 9. Logs/rastreabilidade implementados

### Na criação manual
O `sale_log` da criação agora inclui a validade da reserva em texto.

### No cleanup
Quando uma reserva manual vence, o cleanup grava:
- `action = manual_reservation_auto_cancelled`
- descrição explícita indicando cancelamento automático por vencimento da validade configurada.

### Em transições operacionais
Ao reverter para `reservado`, o log passa a registrar a nova validade da reserva.

## 10. Riscos e salvaguardas

### Riscos tratados
- reserva manual eterna;
- assento preso por tempo indefinido;
- mistura indevida entre fluxo humano e fluxo automático do checkout;
- falta de trilha do motivo do vencimento.

### Salvaguardas adotadas
- validade manual explícita na própria venda;
- checkout público preservado sem mudança de regra;
- backfill conservador para evitar cancelamento imediato de legado;
- limpeza de `tickets`, `seat_locks` e `sale_passengers` quando a reserva manual expira;
- logs específicos para suporte e auditoria.

## 11. Checklist de testes manuais

1. Criar uma venda manual no admin e confirmar no banco que nasce com:
   - `status = reservado`
   - `reservation_expires_at` preenchido
   - `sale_log` contendo a validade.
2. Criar uma reserva pelo modo “Reserva” no admin e validar o mesmo comportamento.
3. Confirmar que o checkout público continua criando:
   - `status = pendente_pagamento`
   - `seat_locks.expires_at`
   - sem depender de `reservation_expires_at`.
4. Simular reserva manual vencida e executar o cleanup:
   - a venda deve virar `cancelado`;
   - `cancel_reason` deve indicar vencimento da reserva manual;
   - `tickets` da venda devem ser removidos;
   - `sale_logs` deve registrar `manual_reservation_auto_cancelled`.
5. Reverter uma venda para `reservado` em `Sales.tsx` e validar que a validade foi renovada.
6. Marcar uma reserva como `pago` e validar que `reservation_expires_at` foi limpa.
7. Cancelar manualmente uma venda reservada e validar que `reservation_expires_at` foi limpa.

## 12. Conclusão final

A implementação adotada é conservadora, auditável e separa corretamente os dois mundos:
- checkout público continua com TTL técnico por lock;
- reserva administrativa passa a ter validade explícita na própria venda.

Com isso, `reservado` manual deixa de ser eterno sem quebrar o fluxo público nem cancelar cegamente vendas do checkout. A solução também melhora a rastreabilidade operacional e mantém a mudança localizada, reversível e compatível com o padrão atual do projeto.
