## Causa raiz real

O índice único `idx_template_layout_items_unique_seat_number` é `(template_layout_id, seat_number) WHERE seat_number IS NOT NULL` — **escopo do template inteiro**, não por pavimento.

O frontend valida corretamente o **estado final** (sem duplicidade), mas o `handleSave` faz um único `upsert` em lote dos itens. Quando o usuário renumera/move/troca assentos dentro do mesmo template (ex.: trocar assento 5 ↔ 6, deslocar numeração, renumerar em lote sobrepondo números antigos), o Postgres avalia o índice único linha a linha durante o batch e detecta **duplicidade transitória** entre o valor antigo (ainda presente em outra linha) e o novo valor da linha atual.

Resultado: erro `23505 idx_template_layout_items_unique_seat_number` mesmo com payload válido. A mensagem "número de assento duplicado" é real do banco — não é bug de validação no frontend.

Isso explica por que ajustes anteriores em `validateItems`/`validateDraft` não resolveram: a validação local já estava correta; o problema é a ordem de persistência.

Também explica por que aparece em "criar novo template" às vezes: se houve qualquer save parcial anterior (template criado, primeiro upsert falhou), os itens antigos persistem e o save seguinte cai no mesmo caso de conflito transitório.

## Correção (mínima, só no `handleSave`)

Persistência em duas fases dentro de `src/pages/admin/TemplatesLayout.tsx`:

1. Após o `delete` dos itens removidos, identificar quais itens existentes terão `seat_number` alterado (comparando `existingItemsByCoord` com `sanitizedItems`).
2. Fase 1 — `UPDATE template_layout_items SET seat_number = NULL WHERE id IN (...)` para esses itens. Como o índice único é parcial (`WHERE seat_number IS NOT NULL`), o NULL libera todos os números em conflito potencial.
3. Fase 2 — manter o `upsert` atual com os valores finais. Sem conflito transitório possível.
4. Se a fase 1 falhar, abortar com mensagem operacional clara antes de tocar no upsert.

Nenhuma mudança em:
- schema/índices do banco
- validação local (`validateItems`, `validateDraft`)
- ocupação real, vendas, checkout, Asaas, webhook, tickets, seat_locks
- regras de acesso à tela (helper `canAccessTemplatesLayoutByUserId` + RLS existente são preservados)

## Refinos pequenos no mesmo arquivo

- Garantir que a mensagem ao usuário diferencie claramente os dois tipos de duplicidade real (já existe em `buildFriendlyTemplateError`, mantida).
- Adicionar comentário no bloco da fase 1 explicando o motivo (estado intermediário do upsert vs índice único de `seat_number`).

## Validação manual pós-correção

1. Criar template novo, assentos 1–10 sequenciais → salva.
2. Editar template existente, **trocar números** de dois assentos → salva sem 23505.
3. Editar template, **renumerar lote** sobrepondo números antigos no mesmo template → salva.
4. Editar template, **remover** assentos e salvar → sem registros órfãos.
5. Editar template, **adicionar** novos assentos → salva.
6. Forçar duplicidade real de `seat_number` no mesmo template via UI → bloqueado em `validateItems` antes de chamar o banco.
7. Forçar duplicidade de posição no grid → bloqueado em `validateItems`.
8. Criar segundo template com os mesmos números → permitido (escopo do índice é por template).
9. Acesso: admin autorizado e usuário de exceção (`f1ba5ea7-...`) abrem e salvam; usuário comum continua bloqueado.
10. Conferir que checkout público e venda manual continuam pintando assentos vendidos/bloqueados/disponíveis (sem mudança no fluxo de ocupação).

## Arquivos a alterar

- `src/pages/admin/TemplatesLayout.tsx` — apenas o bloco `handleSave` entre o `delete` de removidos e o `upsert` final.
