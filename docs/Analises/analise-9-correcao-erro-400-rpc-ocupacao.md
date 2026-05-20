# Análise 9 — Correção do erro 400 na RPC de ocupação

## 1) Resumo executivo
A correção foi refinada para remover a tentativa automática com múltiplos nomes de parâmetro na RPC. O frontend agora usa somente a assinatura oficial `get_trip_seat_occupancy(_trip_id uuid)`, com falha explícita e bloqueio do fluxo (fail-closed) quando houver erro.

## 2) Causa do erro 400
O erro 400 ocorre quando há desalinhamento entre payload enviado e assinatura ativa da função no ambiente (binding nominal do PostgREST/Supabase RPC).

## 3) Payload anterior enviado para RPC
Antes do refinamento, o helper tentava:
1. `_trip_id`
2. `trip_id`
3. `p_trip_id`

## 4) Assinatura oficial da RPC
Assinatura oficial adotada:
- `get_trip_seat_occupancy(_trip_id uuid)`

Payload oficial no frontend:
- `{ _trip_id: tripId }`

## 5) Divergência encontrada
A estratégia de múltiplas tentativas mascarava a causa raiz de ambiente/migration e reduzia previsibilidade/auditabilidade.

## 6) Correção aplicada
- Removida a lógica de tentativa por variações de nome.
- Mantida chamada única oficial com `_trip_id`.
- Mantido log detalhado de erro (`context`, `tripId`, `message`, `code`, `details`, `hint`).
- Mantido fail-closed: em erro, helper lança exceção e os fluxos ficam bloqueados.

## 7) Onde o frontend chama a RPC
- Venda manual: via `getTripSeatOccupancyRpc` em `src/components/admin/NewSaleModal.tsx`.
- Checkout público: via `getTripSeatOccupancyRpc` em `src/pages/public/Checkout.tsx`.

## 8) Arquivos alterados
- `src/lib/tripSeatOccupancyRpc.ts`
- `docs/Analises/analise-9-correcao-erro-400-rpc-ocupacao.md`

## 9) Validação da migration
Arquivo validado:
- `supabase/migrations/20260520120000_fix_seat_occupancy_by_trip_segment.sql`

Resultado:
- A migration define `create or replace function public.get_trip_seat_occupancy(_trip_id uuid)`.

## 10) Houve nova migration?
Não. Não foi necessária nova migration no repositório para este refinamento.

## 11) Validação da venda manual
- Continua bloqueando avanço para pagamento se `loadingSeats` ou `seatOccupancyError` estiver ativo.
- Sem fallback que trate assentos como livres quando RPC falha.

## 12) Validação do checkout público
- Continua bloqueando avanço se a revalidação de ocupação falhar.
- Sem fallback liberando assentos em falha.

## 13) Validação de fail-closed
Confirmado: erro na RPC mantém bloqueio do fluxo e não libera venda insegura.

## 14) Pendência de ambiente
Se o ambiente real continuar retornando 400 com `_trip_id`, a pendência é de aplicação/correção de migration/função ativa no banco, e não do frontend.

## 15) Conclusão
A correção agora é previsível e auditável: assinatura única oficial, chamada única no frontend, fail-closed preservado e sem fallback de adivinhação de parâmetro.

## 16) Referências de validação funcional
Evento de referência:
- `d8af7267-3560-495d-8b31-1590eeca36f3`

Trips de referência:
- Ida: `bee273ac-04cb-452b-b071-93453151630e`
- Volta mesmo veículo: `8d0b7934-656e-4117-bf72-07c211f05778`
- Volta veículo diferente: `295a4c2a-e1e9-4aa1-b7b4-6e1bc50dd08f`


## 17) Refinamento de segurança na revalidação final (checkout público)
- A revalidação final agora considera indisponível qualquer assento em `occupied + blocked`.
- Implementação: `unavailableSeatIds = new Set([...currentOccupied, ...currentBlocked])`.
- O conflito e a limpeza da seleção passaram a usar `unavailableSeatIds`.
- Resultado: assento bloqueado/reservado (`is_blocked = true`) também impede avanço/conclusão.

## 18) Validação da venda manual nesse ponto
- A venda manual já estava segura: na revalidação final ela considera todos os `seat_id` retornados pela RPC como indisponíveis (sem filtrar por `is_blocked`).
- Portanto, não foi necessário ajuste adicional na venda manual para este critério.

## 19) Migration e assinatura RPC
- Não houve nova migration.
- Assinatura oficial `_trip_id` foi mantida sem alteração.
