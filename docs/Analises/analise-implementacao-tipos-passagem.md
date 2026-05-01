# Análise da implementação — Tipos de Passagem por Evento

## O que foi alterado

1. **Base de dados**
   - Mantida a migration já criada para `event_ticket_types`.
   - Mantidos campos de snapshot em `sale_passengers` e `tickets`:
     - `ticket_type_id`
     - `ticket_type_name`
     - `ticket_type_price`

2. **Checkout público**
   - Carrega tipos ativos de passagem por evento (`event_ticket_types`).
   - Se não houver tipos ativos, cria fallback em memória para tipo único “Adulto” com `event.unit_price`.
   - Ao iniciar passageiros, cada passageiro recebe tipo padrão.
   - Se existir mais de um tipo ativo, exibe seletor de tipo por passageiro.
   - Snapshot do tipo é salvo em `sale_passengers` no momento da compra.

3. **Geração de tickets após pagamento**
   - Ao copiar `sale_passengers` para `tickets`, agora também copia os campos de snapshot de tipo.

4. **Admin `/admin/eventos` (save do evento)**
   - Após salvar evento, garante criação automática de tipo padrão “Adulto” quando o evento ainda não possui tipos.
   - Guia **Passagens** agora exibe lista compacta de tipos e permite:
     - adicionar tipo,
     - editar nome/preço,
     - ativar/desativar,
     - excluir (mantendo pelo menos 1 tipo).
   - Regra de proteção no save: não permite evento sem pelo menos 1 tipo ativo.

5. **Venda manual/admin (`/admin/vendas` > Nova venda)**
   - Agora permite selecionar tipo de passagem por passageiro na etapa de dados.
   - Snapshot de tipo também é persistido nos tickets da venda manual.
   - Regra aplicada: tipo define preço-base do passageiro; categoria de assento só atua como fallback quando não há tipo.

---

## Arquivos impactados

- `src/pages/public/Checkout.tsx`
- `supabase/functions/_shared/payment-finalization.ts`
- `src/pages/admin/Events.tsx`
- `docs/Analises/analise-implementacao-tipos-passagem.md`

---

## Como funciona o fallback para eventos antigos

- Evento sem registros em `event_ticket_types`:
  - checkout usa tipo único em memória (`Adulto`) com preço = `events.unit_price`;
  - fluxo de assentos, quantidade e pagamento continua igual ao anterior.
- No admin, ao salvar evento, é criado o tipo padrão quando não existir nenhum tipo.

---

## Como o checkout calcula o total

- O cálculo permanece no fluxo existente por snapshots de passageiros.
- O `original_price` de cada passageiro passa a considerar `ticket_type_price` (quando informado).
- Benefícios e taxas continuam sendo aplicados sobre o snapshot (sem alterar webhook/verify/finalização principal).

## Regra final: tipo x categoria de assento

- **Prioridade 1:** tipo de passagem selecionado (`ticket_type_price`).
- **Prioridade 2:** preço por categoria de assento (quando existir e nenhum tipo estiver selecionado).
- **Prioridade 3:** preço base do evento (`events.unit_price`).

Isso elimina ambiguidade quando `use_category_pricing` está ativo.

---

## Como o snapshot é salvo

Em `sale_passengers`:
- `ticket_type_id`
- `ticket_type_name`
- `ticket_type_price`

Em `tickets` (na finalização):
- os mesmos três campos são copiados do staging `sale_passengers`.

---

## Testes manuais recomendados

1. **Evento legado sem tipos**
   - Abrir checkout e concluir compra.
   - Validar que total e pagamento permanecem iguais ao comportamento antigo.

2. **Evento com 1 tipo ativo**
   - Garantir fluxo normal sem complexidade adicional na UI.

3. **Evento com 2+ tipos ativos**
   - Selecionar tipos diferentes por passageiro.
   - Validar resumo e total da venda.

4. **Persistência de snapshot**
   - Confirmar em `sale_passengers` que `ticket_type_*` foi salvo.
   - Confirmar em `tickets` pós-pagamento que `ticket_type_*` foi copiado.

5. **Compatibilidade de pagamento**
   - Confirmar criação de cobrança Asaas sem alteração de webhook/verify.

6. **Admin — guia Passagens**
   - Abrir `/admin/eventos`, editar evento e entrar em Passagens.
   - Validar lista compacta dos tipos.
   - Adicionar tipo, editar nome/preço e alternar ativo/inativo.
   - Tentar desativar o último tipo ativo (deve bloquear com mensagem).
   - Salvar evento com pelo menos 1 tipo ativo (deve permitir).

7. **Venda manual/admin**
   - Abrir Nova venda, selecionar evento/assentos.
   - Na etapa de passageiros, escolher tipos diferentes por passageiro.
   - Confirmar venda e validar em `tickets` os campos `ticket_type_id`, `ticket_type_name`, `ticket_type_price`.
   - Validar que `original_price/final_price` respeitam o tipo escolhido.

## Onde o tipo aparece hoje

- **Admin / Nova venda:** seleção por passageiro.
- **Persistência:** `sale_passengers` e `tickets` guardam o snapshot.
- **Checkout público:** seleção por passageiro quando há múltiplos tipos.

## Pendências restantes (não bloqueantes para esta fase)

- Exibição textual explícita de `ticket_type_name` em todos os layouts de comprovante/listagens ainda pode ser expandida em tarefa dedicada.
- Relatórios que mostram apenas preço unitário continuam com risco de interpretação quando houver mix de tipos na mesma venda.
