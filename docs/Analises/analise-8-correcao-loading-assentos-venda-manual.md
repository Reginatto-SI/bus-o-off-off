# Análise 8 — Correção de loading de assentos na venda manual

## 1) Resumo executivo
- O loading infinito na etapa **Assentos** da **Nova Venda** era causado por ausência de tratamento de erro e ausência de `finally` na carga de assentos/ocupação.
- A chamada RPC `get_trip_seat_occupancy` já está sendo feita por `trip_id` no frontend (manual e público), mas quando a RPC (ou query de assentos) falhava, o estado `loadingSeats` não era finalizado no fluxo administrativo.
- Foi aplicada correção **fail-closed** no modal administrativo: em erro, o loading encerra, mensagem clara é exibida e o avanço para pagamento fica bloqueado.
- A migration `supabase/migrations/20260520120000_fix_seat_occupancy_by_trip_segment.sql` foi validada **no repositório**; não foi possível comprovar aqui se está aplicada no banco real (Lovable Cloud).

## 2) Causa do loading infinito
- Na etapa de assentos em `src/components/admin/NewSaleModal.tsx`, o efeito `fetchSeatsAndOccupied` fazia `setLoadingSeats(true)` e só executava `setLoadingSeats(false)` no caminho de sucesso.
- Se `supabase.rpc('get_trip_seat_occupancy', ...)` retornasse erro, ocorria `throw` sem `catch/finally`, deixando `loadingSeats = true` indefinidamente.

## 3) Componente/arquivo onde ocorre o problema
- Componente: `NewSaleModal`.
- Arquivo: `src/components/admin/NewSaleModal.tsx`.

## 4) Como a ocupação é carregada
- Na etapa 2, o modal busca em paralelo:
  - assentos (`from('seats')`) por `vehicle_id` e `company_id`;
  - ocupação via RPC `get_trip_seat_occupancy` com `_trip_id`.
- Depois separa retorno em:
  - `blockedSeatIds` quando `is_blocked = true`;
  - `occupiedSeatIds` quando `is_blocked = false`.

## 5) Como a RPC é chamada
- Venda manual (admin): `supabase.rpc('get_trip_seat_occupancy', { _trip_id: selectedTripId })`.
- Checkout público: `supabase.rpc('get_trip_seat_occupancy', { _trip_id: tripUuid })` e `tripId`.
- Ambos usam `trip_id`, não `event_id/vehicle_id`.

## 6) Validação da migration (repositório x banco)
- Validada no repositório: `supabase/migrations/20260520120000_fix_seat_occupancy_by_trip_segment.sql`.
- **Sem acesso ao banco real nesta execução**: não há evidência de aplicação em produção/Lovable Cloud.

## 7) Se a RPC esperada usa `trip_id`
- Sim. A função `get_trip_seat_occupancy(_trip_id uuid)` usa contexto do trecho via `trips.id = _trip_id` e joins por `trip_id` nas fontes de ocupação (`tickets`, `sale_passengers`, `seat_locks`).

## 8) Correção aplicada
- Em `NewSaleModal`:
  1. Adicionado estado explícito `seatOccupancyError`.
  2. Adicionado `seatReloadToken` para recarregar manualmente via botão “Tentar novamente”.
  3. Envolvida a carga em `try/catch/finally` para sempre encerrar `loadingSeats`.
  4. Em erro, mensagem clara exibida: 
     - “Não foi possível carregar a ocupação das poltronas. Tente novamente. Se persistir, acione o suporte.”
  5. Bloqueio de avanço para pagamento em fail-closed:
     - `canGoStep3 = !loadingSeats && !seatOccupancyError && selectedSeats.length > 0`.

## 9) Arquivos alterados
- `src/components/admin/NewSaleModal.tsx`
- `docs/Analises/analise-8-correcao-loading-assentos-venda-manual.md`

## 10) Se houve migration nova
- Não.

## 11) Validação da venda manual
- Estruturalmente validado no código:
  - loading encerra em sucesso e erro (`finally`);
  - erro de ocupação é mostrado na UI;
  - ação de retry disponível;
  - botão “Ir para pagamento” não avança sem ocupação carregada com segurança.

## 12) Validação do checkout público
- Checkout público já possuía tratamento defensivo com `try/catch/finally` e `seatStatusError` no fluxo de ocupação.
- Não foi alterado nesta correção.

## 13) Validação do bloqueio do botão “Ir para pagamento”
- Agora o avanço da etapa 2 depende de:
  - não estar carregando;
  - não haver erro de ocupação;
  - existir seleção de assentos.
- Isso impede avanço quando a ocupação falha.

## 14) Validação de fail-closed
- Implementado fail-closed na venda manual:
  - em erro de ocupação, não há fallback para assentos livres;
  - avanço é bloqueado até recarregar com sucesso.

## 15) Riscos restantes
- Se a migration de maio/2026 não estiver aplicada no ambiente real, ainda pode haver divergência funcional entre frontend e backend.
- Não foi possível executar teste E2E real no `/admin/eventos` sem ambiente Lovable Cloud e dados reais.

## 16) Pendências dependentes do ambiente Lovable Cloud
1. Confirmar aplicação da migration `20260520120000_fix_seat_occupancy_by_trip_segment.sql` no banco do ambiente.
2. Executar checklist manual completo no fluxo real:
   - abrir `/admin/eventos` > Nova Venda > etapa Assentos;
   - validar carregamento normal;
   - simular falha da RPC e confirmar erro + bloqueio do botão;
   - validar separação ida/volta por `trip_id` usando os IDs de referência informados.

## Observação sobre proteção final contra overbooking
- A migration já traz proteção backend com verificações por `trip_id + seat_id` via funções de assert para ticket e lock, com lock transacional (`pg_advisory_xact_lock`), reduzindo risco de concorrência.
- O modal admin também revalida ocupação imediatamente antes de confirmar venda usando a mesma RPC.
