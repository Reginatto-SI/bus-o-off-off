# Análise crítica e correção — ocupação de assentos (risco de venda duplicada)

## 1) Resumo executivo

Foi identificada divergência entre a fonte dos **totais** (cards/listagens) e a fonte do **mapa de assentos**. O total em `/admin/eventos` soma `sales.quantity` com status `reservado` e `pago`, enquanto o mapa dependia majoritariamente de `tickets` + `seat_locks`.

Causa raiz técnica encontrada: a função central usada no checkout público (`get_trip_seat_occupancy`) não cobria cenário legado/operacional em que há `sale_passengers` com assento definido e ainda sem `tickets` materializados; além disso, a venda administrativa estava usando cálculo paralelo via query direta de `tickets`.

Correção mínima aplicada:
- ampliar a função central `get_trip_seat_occupancy` para considerar **tickets + fallback de sale_passengers** (status operacionais válidos), com isolamento por `company_id` no contexto da viagem;
- fazer o modal de venda admin consumir a mesma fonte central (`get_trip_seat_occupancy`), removendo cálculo paralelo;
- reforçar filtro `company_id` nos `seat_locks` usados no admin.

Com isso, público e admin passam a usar a mesma regra base de ocupação por viagem e o mapa deixa de depender exclusivamente da materialização imediata de `tickets`.

## 2) Telas analisadas

- `/admin/eventos`
- `/admin/vendas` (fluxo de nova venda no modal)
- checkout público/mobile (`/checkout/:id`)

## 3) Arquivos investigados

- `src/pages/admin/Events.tsx`
- `src/components/admin/NewSaleModal.tsx`
- `src/pages/public/Checkout.tsx`
- `supabase/migrations/20260513143142_8e5be658-c5ca-4b2f-863a-6f57b89df486.sql`
- `docs/PRD/Telas/prd-public-checkout.md`
- `docs/PRD/Telas/prd-admin-vendas.md`

## 4) Tabelas/funções consultadas

- `sales`
- `tickets`
- `seat_locks`
- `sale_passengers`
- RPC `get_trip_seat_occupancy`
- RPC `get_trip_available_capacity`

## 5) Fonte atual dos totais de ocupação

### `/admin/eventos`
- “vendidos”/ocupação macro estava vindo de `sales` (`quantity`) com status `reservado` + `pago`.
- capacidade vem de `trips.capacity` (soma por veículo único para não duplicar ida/volta).

**Conclusão:** total agregado pode estar correto no nível comercial, mas não garantia coerência 1:1 com mapa se a ocupação de assento ainda não estivesse em `tickets`.

## 6) Fonte atual do mapa de assentos

### Checkout público
- usa RPC `get_trip_seat_occupancy` + `seat_locks` ativos.

### Venda manual/admin (antes da correção)
- carregava `tickets` diretamente por `trip_id`, classificando bloqueio via status da venda; em paralelo, somava `seat_locks`.

### Venda manual/admin (após correção)
- passa a usar a mesma RPC central `get_trip_seat_occupancy` + `seat_locks` ativos por `company_id`.

## 7) Causa raiz encontrada

1. **Divergência de fontes**: totais em `sales.quantity` vs mapa principalmente em `tickets`.
2. **Cobertura incompleta da RPC central**: `get_trip_seat_occupancy` não considerava fallback de `sale_passengers` (quando ainda não há ticket materializado para aquele assento).
3. **Fluxo paralelo no admin**: lógica local de ocupação em vez da fonte única usada no checkout.

## 8) Risco de venda duplicada

Risco real quando:
- mapa visual marca poltrona como disponível por ausência momentânea em `tickets`;
- usuário/admin tenta selecionar assento já comprometido em `sale_passengers` ou lock concorrente.

Mitigação aplicada:
- unificação da leitura de ocupação por RPC central em público e admin;
- revalidação no admin também baseada nessa RPC + lock ativo.

## 9) Correção mínima aplicada

### Banco (fonte central)
- Atualizada a função `get_trip_seat_occupancy` para retornar ocupação a partir de:
  - `tickets` não cancelados;
  - `sale_passengers` com status de venda em `pendente_pagamento`, `reservado`, `pago`, `bloqueado`, apenas quando ainda não existe ticket equivalente.
- Escopo da viagem com isolamento por `company_id` via contexto `trips -> events`.

### Frontend admin
- `NewSaleModal` passou a carregar ocupação por `get_trip_seat_occupancy` (mesma regra do checkout);
- revalidação pré-confirmação também usa a RPC;
- `seat_locks` no admin agora inclui filtro explícito por `company_id`.

## 10) Precisou migration SQL?

**Sim.** Foi necessária uma migration de ajuste da função RPC central para corrigir a causa raiz e eliminar divergência entre fluxos.

## 11) Existem dados legados a corrigir?

- Potencialmente sim, se houver vendas históricas com assento apenas em `sale_passengers` e nunca materializadas em `tickets`.
- A correção aplicada já evita invisibilidade desses assentos no mapa (fallback).
- Neste escopo não foi criada migration de saneamento massivo, pois a mudança funcional já cobre leitura segura sem sobrescrever dados.

## 12) Checklist de validação

1. [ ] Evento com 46 lugares e 24 vendidas mostra 22 disponíveis.
2. [ ] As 24 poltronas comprometidas ficam indisponíveis no admin.
3. [ ] As 24 poltronas comprometidas ficam indisponíveis no checkout público/mobile.
4. [ ] Checkout público impede seleção de poltrona já ocupada.
5. [ ] Admin impede venda manual em poltrona já ocupada.
6. [ ] Reserva ativa bloqueia seleção.
7. [ ] Bloqueio manual bloqueia seleção.
8. [ ] Venda cancelada libera assento (conforme regra atual).
9. [ ] Pendente de pagamento segue regra documentada no fluxo (ocupação via sale_passengers/lock).
10. [ ] Validado em mais de uma empresa (`company_id` distinto).

## 13) Pontos que ainda exigem atenção

- Rodar validação com dados reais multiempresa em homologação (especialmente cenários ida/volta).
- Confirmar política final de ocupação para `pendente_pagamento` após expiração de `seat_locks` em todos os canais.
- Avaliar, em tarefa separada, saneamento histórico opcional para converter integralmente registros legados em `tickets` quando aplicável.



## Validação antes do commit

Status: **SEGURO COMMITAR COM RESSALVAS DE TESTE E2E EM HOMOLOGAÇÃO**.

1. **RPC única para admin e checkout público:** **Confirmado.**
   - Checkout público usa `get_trip_seat_occupancy` para carregar e revalidar ocupação.
   - Admin (`NewSaleModal`) agora também usa a mesma RPC para carregar e revalidar.

2. **Cobertura de tickets, sale_passengers, seat_locks, reservas e bloqueios manuais:** **Confirmado no código.**
   - RPC considera `tickets` + fallback de `sale_passengers` quando ainda não há `ticket`.
   - `seat_locks` ativos continuam sendo considerados no checkout e no admin.
   - Status `bloqueado` é mapeado para estado visual de bloqueio.

3. **Vendas canceladas não bloqueiam assento:** **Confirmado.**
   - A RPC exclui canceladas no ramo de `tickets` e só inclui `sale_passengers` com status operacionais ativos.

4. **Pagas, reservadas e pendentes bloqueiam conforme regra atual:** **Confirmado.**
   - Em `sale_passengers`, status `pendente_pagamento`, `reservado`, `pago` e `bloqueado` entram como ocupação/bloqueio.
   - Em `tickets`, qualquer venda não cancelada permanece ocupando assento (inclui os mesmos estados operacionais).

5. **Ida e volta sem mistura indevida:** **Confirmado.**
   - A ocupação é sempre por `trip_id`; volta sem assento (`seat_id null`) não contamina mapa da ida.

6. **Filtros de company_id/event_id/trip_id/assento:** **Parcialmente confirmado com evidência forte.**
   - `trip_id` e `seat_id` são chaves primárias da ocupação em todos os fluxos.
   - `company_id` foi reforçado na RPC (joins com contexto da viagem/evento) e em `seat_locks` do admin.
   - `event_id` não é filtro direto na RPC, mas é inferido pelo `trip_id -> trips.event_id`; funcionalmente correto para este fluxo.

7. **Backend bloqueia venda duplicada mesmo com frontend errado:** **Confirmado.**
   - Existe `UNIQUE(trip_id, seat_id)` em `tickets` e em `seat_locks`.
   - Portanto, corrida concorrente no backend gera erro de unicidade e impede dupla ocupação persistida.

8. **Cenário de duas abas no mesmo assento:** **Validado por regra de concorrência (estático) e proteção transacional, pendente execução E2E real.**
   - Primeira aba que grava lock/ticket vence; segunda recebe conflito de unicidade (`23505`) e precisa reselecionar assento.
   - Recomendado executar teste manual em homologação com dois navegadores para evidência operacional final.

Conclusão objetiva: a correção está tecnicamente consistente e segura para commit; a única pendência é a execução de teste concorrente E2E em ambiente integrado para registro operacional final.
