# Análise 5 — Validação ida/volta na ocupação de poltronas

## 1) Resumo executivo
- A validação real do evento `d8af7267-3560-495d-8b31-1590eeca36f3` mostrou divergência de regra por trecho.
- Antes do ajuste, a RPC `get_trip_seat_occupancy` agregava por `event_id + vehicle_id + company_id` e retornava a mesma ocupação para ida e volta quando o veículo era o mesmo.
- No evento analisado, todas as vendas do `sales` estavam no trip de ida; mesmo assim a volta do mesmo veículo retornava 24 assentos ocupados.
- Isso caracteriza risco de bloqueio indevido na volta para vendas somente ida.
- Foi aplicada correção mínima no banco para ocupar por `trip_id` (trecho), mantendo filtros de status e fallback por `seat_label` no mesmo trip.

## 2) Evento analisado
- `d8af7267-3560-495d-8b31-1590eeca36f3`.

## 3) Vendas somente ida
- As 25 vendas visíveis em `sales` do evento estão vinculadas a trip `trip_type='ida'`.

## 4) Vendas somente volta
- Não foram encontradas vendas com `sales.trip_id` em trip `trip_type='volta'` na coleta anon deste evento.

## 5) Vendas ida e volta
- O fluxo de ida+volta é modelado como **uma venda** com registros adicionais no trecho de volta (`tickets`/`sale_passengers` com `trip_id` de volta e `seat_id=null`, `seat_label='VOLTA-*'`).
- Portanto, classificação “ida e volta” depende de presença desses registros por passageiro (não apenas `sales.trip_id`).

## 6) Assentos esperados por trecho
- Somente ida: bloqueia somente no trip de ida em que o assento foi escolhido.
- Somente volta: bloqueia somente no trip de volta correspondente.
- Ida+volta: bloqueia em ambos somente quando houver assento válido em ambos os trechos.

## 7) Assentos retornados pela RPC por trecho (antes da correção)
- Trip ida `bee273ac-04cb-452b-b071-93453151630e`: 24 assentos.
- Trip volta mesmo veículo `8d0b7934-656e-4117-bf72-07c211f05778`: 24 assentos.
- Trip volta veículo diferente `295a4c2a-e1e9-4aa1-b7b4-6e1bc50dd08f`: 0 assentos.

## 8) Comparação entre esperado e retornado
- Esperado (pelas vendas visíveis): ocupação concentrada na ida.
- Retornado (antes): ida e volta do mesmo veículo idênticas.
- Divergência: ocupação da ida “vazava” para volta por agregação por veículo/evento.

## 9) Causa raiz
- A RPC usava `sibling_trips` por `event_id + vehicle_id + company_id`, ignorando o trecho requisitado como limite final.
- Os triggers de proteção final também validavam colisão por evento+veículo, não por `trip_id`.

## 10) Correção aplicada
- Migration: `supabase/migrations/20260520120000_fix_seat_occupancy_by_trip_segment.sql`.
- Ajustes:
  1. `get_trip_seat_occupancy`: removida agregação por viagens irmãs; agora ocupa por `trip_id`.
  2. `assert_physical_seat_available_for_ticket`: colisão por `trip_id + seat_id`.
  3. `assert_physical_seat_available_for_lock`: colisão por `trip_id + seat_id`.
- Mantidos:
  - filtros de status existentes;
  - fallback `seat_label -> seats.id` dentro do mesmo trip/veículo;
  - validação contra `seat_locks` ativos.

## 11) Validação do checkout público
- O checkout já passa `tripId` explícito para RPC e revalidação.
- Com RPC por trecho, o bloqueio visual e a validação passam a respeitar ida/volta.

## 12) Validação da venda manual
- `NewSaleModal` também passa `selectedTripId` para RPC e revalidação.
- Com RPC por trecho, a venda manual segue a mesma regra de ocupação por viagem selecionada.

## 13) Validação da proteção final contra overbooking por trecho
- A proteção final no banco foi alinhada ao trecho (`trip_id`) para evitar:
  - venda duplicada no mesmo trecho;
  - bloqueio cruzado indevido entre ida e volta.

## 14) Riscos restantes
- Reexecutar validação real pós-deploy no ambiente conectado (service-role/admin) para comprovar linha-a-linha em `tickets`, `sale_passengers` e `seat_locks`.
- Confirmar com produto se existe cenário de negócio que exige compartilhamento de assento entre ida e volta mesmo sem assento explícito na volta.

## 15) Conclusão objetiva
- O bug de “poltrona livre” havia sido parcialmente mitigado, mas existia risco de **bloqueio indevido por trecho**.
- A RPC anterior precisava ajuste para respeitar ida/volta.
- Após esta correção, a regra fica coerente com trecho: somente ida bloqueia ida; somente volta bloqueia volta; ida+volta bloqueia ambos apenas quando houver ocupação válida em ambos.
