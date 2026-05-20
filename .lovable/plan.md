# Correção definitiva — mapa de assentos vs. ocupação real

## Causa raiz identificada (com evidência no banco)

Eu reproduzi a divergência consultando diretamente o banco de produção em eventos reais (PEDRO LEOPOLDO RODEIO SHOW – Dias 12 e 13, BUSÃO OFF OFF):

- Cada evento publicado tem **2 trips** (`ida` + `volta`) que compartilham o **mesmo `vehicle_id`** (e portanto a mesma tabela `seats`).
- Por regra de negócio, os `tickets` da `volta` são criados com `seat_id = NULL` (volta sem assento específico, somente `seat_label = 'VOLTA-N'`).
- A RPC `get_trip_seat_occupancy(_trip_id)` filtra `tickets.trip_id = _trip_id`. Logo:
  - Para o trip de **IDA**: retorna corretamente 24/46/etc. assentos ocupados.
  - Para o trip de **VOLTA** (mesmo veículo físico): retorna **0** porque os tickets da volta não têm `seat_id`.

Resultado: sempre que a tela de seleção (checkout público ou venda manual no admin) é aberta com o **trip_id da volta** — ou com qualquer trip auxiliar que compartilhe o veículo — a RPC devolve "0 ocupados" e o componente `SeatMap` pinta as 46 poltronas como livres, mesmo quando o totalizador correto mostra 24 vendidas.

Exemplo verificado (Pedro Leopoldo Dia 13, veículo `4f30ff18…`):

```text
trip ida   → 46 tickets com seat_id  → RPC = 46 ocupados → mapa correto
trip volta → 46 tickets seat_id NULL → RPC =  0 ocupados → mapa “tudo livre”  ← BUG
```

Outros itens auditados e descartados como causa:
- Permissão `EXECUTE` da RPC para `anon` e `authenticated`: **OK**.
- RLS de `seats` para anônimo em eventos `a_venda`: **OK** (46 linhas retornadas).
- Estado/cache do frontend, transformação de `seat_id` (UUID string): **OK** — o `getSeatState` do `SeatMap` faz `occupiedSeatIds.includes(seat.id)` e ambos são UUID string vindos do Postgres.
- `get_trip_available_capacity` (correção anterior): segue correto para a IDA; para a VOLTA, mesmo problema conceitual, mas hoje os cards somam por `sales.quantity` e não dependem dele.

A divergência entre "totais corretos" e "mapa errado" se explica porque os totais agregam `sales.quantity` (não dependem de `tickets.seat_id`), enquanto o mapa depende da RPC que olha `tickets.seat_id` por trip.

## Correção mínima proposta

Manter a mesma arquitetura (uma única RPC central, sem fluxos paralelos, sem mexer em frontend nem em pagamento/split). Apenas estender a RPC `get_trip_seat_occupancy` para refletir a ocupação **do veículo físico** no contexto do evento, e não apenas do `trip_id`:

1. **Migration única — atualizar `get_trip_seat_occupancy(_trip_id uuid)`**:
   - Resolver `(event_id, vehicle_id, company_id)` a partir do `_trip_id`.
   - Considerar ocupação a partir de `tickets` e `sale_passengers` **de qualquer trip do mesmo `event_id` que use o mesmo `vehicle_id`** (cobre IDA, VOLTA e trips auxiliares no mesmo ônibus).
   - Manter: filtro `seat_id IS NOT NULL`, exclusão de vendas `cancelado`, status operacionais já cobertos (`pendente_pagamento`, `reservado`, `pago`, `bloqueado`), isolamento por `company_id`, `SECURITY DEFINER`, `search_path = public`, `GRANT EXECUTE TO anon, authenticated`.
   - Mantém assinatura `RETURNS TABLE(seat_id uuid, is_blocked boolean)` — zero impacto em frontend.

2. **Sem mudanças no frontend.** `Checkout.tsx`, `NewSaleModal.tsx`, `SeatMap.tsx` e `SeatButton.tsx` continuam exatamente como estão. A correção é cirúrgica no SQL.

3. **Comentário inline na migration** explicando que a ocupação representa o veículo físico (compartilhado entre trips ida/volta do mesmo evento), evitando regressão futura.

## Por que isso é seguro

- Não cria fluxo paralelo nem nova RPC.
- Não altera regras de pagamento, taxa, split ou Asaas.
- Não muda padrão visual nem componentes.
- `UNIQUE(trip_id, seat_id)` em `tickets` e `seat_locks` continua bloqueando dupla venda no backend (proteção transacional preservada).
- Como tickets de VOLTA têm `seat_id = NULL`, eles não entram na união — não há risco de "contaminar" duas vezes a mesma poltrona.
- Ida e volta nunca misturam veículos diferentes: o filtro é `same event_id AND same vehicle_id`.

## Plano de validação (após aplicar migration)

Antes de declarar resolvido, vou validar em SQL e em tela:

1. SQL direto contra eventos reais:
   - `get_trip_seat_occupancy(<trip_volta_pedro_leopoldo_dia_13>)` deve passar de 0 → 46.
   - `get_trip_seat_occupancy(<trip_ida_pedro_leopoldo_dia_13>)` deve continuar 46.
   - Mesmo teste no BUSÃO OFF OFF (`0349249a…`) e em outro evento com IDA+VOLTA.
2. Visualmente, em aba anônima e em mobile:
   - Abrir o evento, escolher a viagem da volta → poltronas vendidas aparecem ocupadas.
   - Abrir a IDA → mesmas 24/46 poltronas continuam ocupadas (não regrediu).
   - Tentar selecionar uma poltrona ocupada → bloqueado.
3. Admin / venda manual:
   - `/admin/vendas` → "Nova venda" no mesmo evento → mapa reflete ocupação real em qualquer trip.
   - Bloqueio manual (`status = bloqueado`) continua pintando como bloqueado (ícone amarelo).
4. Concorrência:
   - Duas abas selecionando o mesmo assento → segunda aba recebe conflito (`UNIQUE`) e precisa reescolher.
5. Documentar em `docs/Analises/analise-ocupacao-assentos-venda-duplicada.md` o motivo da segunda iteração (escopo "trip" → "veículo do evento").

## Riscos e mitigação

- **Risco**: se um mesmo veículo for usado em dois eventos diferentes no mesmo dia, não há cruzamento — o filtro por `event_id` garante isolamento.
- **Risco**: se existir trip auxiliar (ex.: traslado) com `seat_id` próprio no mesmo veículo, a ocupação passa a aparecer também no mapa da IDA. Isso é o comportamento correto, já que o veículo é o mesmo. Não foram encontrados casos legados conflitantes.
- **Mitigação geral**: a migration é reversível — basta restaurar a versão anterior da função se algo inesperado aparecer.
