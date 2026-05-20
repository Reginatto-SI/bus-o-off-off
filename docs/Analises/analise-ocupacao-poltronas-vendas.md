# Análise de Ocupação de Poltronas — SmartBus BR

## 1. Resumo executivo

O fluxo atual usa **fonte única de leitura** para ocupação (`get_trip_seat_occupancy`), mas a escrita de estados vem de caminhos diferentes (checkout público com `seat_locks` + `sale_passengers`; admin manual com `tickets` diretos; confirmação financeira via `finalizeConfirmedPayment`).

Conclusão preliminar: o risco mais provável para “passagem vendida e poltrona livre” é **divergência temporal/fluxo entre status da venda e materialização em `tickets`/limpeza de `seat_locks`**, especialmente quando a confirmação depende de webhook/verify e quando há variação entre venda manual com taxa vs sem taxa.

Risco operacional identificado:
- **Risco real de dupla venda** existe, mas hoje há mitigação em banco por trigger/transação advisory lock em `tickets` e `seat_locks` por `trip_id + seat_id`.
- Ainda há risco residual em cenários de corrida entre fluxos paralelos (principalmente pré-confirmação e inconsistências de sincronização).

## 2. Fluxo atual encontrado

### 2.1 Checkout público
1. Checkout carrega mapa via RPC `get_trip_seat_occupancy` (`src/pages/public/Checkout.tsx`, `src/lib/tripSeatOccupancyRpc.ts`).
2. Seleção de assentos é revalidada via mesma RPC antes de avançar e antes de submissão.
3. Fluxo cria venda pendente + `seat_locks` (documentado no PRD e código com uso de `seat_locks`).
4. `create-asaas-payment` cria cobrança e vincula `asaas_payment_id`.
5. Confirmação financeira vem prioritariamente do webhook (`asaas-webhook`) e fallback `verify-payment-status`.
6. Ambos convergem em `finalizeConfirmedPayment` (`supabase/functions/_shared/payment-finalization.ts`), que:
   - atualiza `sales.status` para `pago`;
   - cria `tickets` a partir de `sale_passengers` (idempotente);
   - remove `seat_locks` da venda.
7. Mapa continua sendo atualizado por realtime em `tickets` e `seat_locks`.

### 2.2 Venda manual administrativa com taxa
1. `NewSaleModal` cria `sales` com status inicial `reservado`.
2. Cria `tickets` imediatamente (inclusive assento/seat_id quando disponível).
3. Se houver taxa de plataforma, `platform_fee_status = pending` e checkout de taxa é aberto (`create-platform-fee-checkout` / `startPlatformFeeCheckout`).
4. Pagamento da taxa converge por Asaas/verify/webhook para atualização financeira.
5. Ocupação de assento já nasce em `tickets` (não depende de `seat_locks`).

### 2.3 Venda manual administrativa sem taxa / empresa piloto
1. Mesmo fluxo base do admin: cria `sales` (`reservado`) + cria `tickets` imediatamente.
2. Como não há taxa aplicável, `platform_fee_status = not_applicable`.
3. Assento deveria ficar ocupado pelo `ticket` já criado, sem depender de webhook.

### 2.4 Empresa piloto
- O código indica caminho por configuração de taxa/integração, não por “tipo piloto” explícito no mapa.
- Onde não há cobrança, o gatilho de ocupação é criação de `tickets`, não confirmação Asaas.

### 2.5 Ida / ida e volta / volta opcional
- RPC atual é por **`trip_id`** (migration `20260520120000_fix_seat_occupancy_by_trip_segment.sql`), com comentário explícito que ocupação deve respeitar trecho.
- Em manual com volta, são criados tickets de volta com `trip_id` da volta e `seat_id = null`, `seat_label` sintético (`VOLTA-X`) em certos cenários.
- Risco: volta sem `seat_id` depende de matching por label/contexto e pode não bloquear poltrona física igual à ida.

### 2.6 Ônibus / van / layouts diferentes
- Mapa visual é único (`SeatMap`) para qualquer veículo; diferenças vêm de `seats` (floor/row/col/category).
- RPC tenta resolver ocupação por `seat_id` e fallback por `seat_label` no mesmo veículo.

## 3. Fonte de verdade atual da ocupação

Fonte de leitura usada no frontend (admin e público):
- `public.get_trip_seat_occupancy(_trip_id)`

Composição da RPC:
1. `tickets` (ocupado; com `sales.status <> cancelado`)
2. `sale_passengers` sem ticket ainda, com `sales.status in ('pendente_pagamento','reservado','pago','bloqueado')`
3. `seat_locks` ativos (`expires_at > now()`)

Estados no mapa:
- **Disponível:** não aparece em nenhuma fonte da RPC e não está bloqueado no layout.
- **Reservada temporária:** presença em `seat_locks` ativo ou em `sale_passengers` elegível sem ticket.
- **Vendida/ocupada:** `tickets` válidos (venda não cancelada).
- **Bloqueada:** linha na RPC com `is_blocked = true` (derivada de `sales.status='bloqueado'`) ou `seat.status='bloqueado'` no layout.
- **Cancelada/liberada:** `sales.status='cancelado'` é explicitamente excluída no braço de `tickets`.

## 4. Pontos de atualização da ocupação

- Criação de lock temporário: checkout público (`seat_locks`).
- Criação antecipada de ocupação: admin manual cria `tickets` direto.
- Confirmação de pagamento: `finalizeConfirmedPayment` muda `sales.status` para `pago`, gera `tickets` de `sale_passengers`, remove `seat_locks`.
- Expiração/liberação automática: `cleanup-expired-locks` remove locks expirados e trata vendas pendentes/reservas expiradas.
- Cancelamento/reversão webhook: `asaas-webhook` remove `seat_locks` e ajusta estados em cenários de reversão.

## 5. Pontos de leitura da ocupação

- Público: `src/pages/public/Checkout.tsx` chama RPC (`fetchOccupiedSeats`, `revalidateSeats`) + realtime em `tickets` e `seat_locks`.
- Admin: `src/components/admin/NewSaleModal.tsx` chama RPC para carregar e revalidar antes de salvar.
- Render visual: `src/components/public/SeatMap.tsx` decide entre `blocked/occupied/selected/available`.

## 6. Integração Asaas

Participantes principais:
- `create-asaas-payment`
- `asaas-webhook`
- `verify-payment-status`
- `_shared/payment-finalization`
- `create-platform-fee-checkout`

Regras observadas:
- Webhook é fonte prioritária de confirmação (PRD 03); verify é fallback.
- Eventos confirmatórios do webhook alimentam finalização unificada.
- Finalização financeira e geração de ticket estão acopladas no `finalizeConfirmedPayment`.
- Split/comissão roda após confirmação (não deveria ser pré-condição para ocupação; falhas são logadas, fluxo segue).

Possível interferência:
- Se webhook/verify não convergir para `finalizeConfirmedPayment` no checkout público, pode manter venda sem ticket/sem ocupação final.
- Em fluxos manuais sem taxa, ocupação não deveria depender do Asaas porque `tickets` já existem.

## 7. Empresas sem taxa

- No admin sem taxa: venda nasce `reservado` e `tickets` são inseridos no ato.
- Portanto o gatilho de ocupação é a criação do ticket, não webhook.
- Se mesmo assim não pinta, provável causa está em:
  - mismatch de `trip_id/seat_id/seat_label` entre ticket e layout;
  - filtro da RPC não reconhecendo aquele ticket (escopo/empresa/status);
  - problema de dados de retorno (ex.: volta com `seat_id null`).

## 8. Eventos ida/volta

- A versão vigente da RPC é segmentada por `trip_id`.
- Isso corrige vazamento entre trechos, mas exige que os tickets estejam corretamente atribuídos ao `trip_id` de cada trecho.
- Eventos com volta opcional e labels sintéticos na volta podem gerar divergência de bloqueio visual se não houver `seat_id` mapeável.

## 9. Layouts de ônibus e van

- Comparação principal é por `seat_id`.
- Há fallback por `seat_label` dentro do veículo/empresa.
- Se layout foi alterado e mudou IDs/labels, vendas históricas podem perder correspondência visual.
- Assentos `_legacy_`/`_tmp_` são filtrados no frontend e também tratados defensivamente no SQL.

## 10. Multiempresa e permissões

- RPC usa `security definer` e foi concedida a `anon, authenticated`, reduzindo risco de RLS bloquear leitura pública do mapa.
- Ainda há filtro por `company_id` em joins internos (`trips`, `tickets`, `sale_passengers`, `seats`, `seat_locks`).
- Risco residual: dados de venda/ticket gravados com company/trip inconsistentes podem não aparecer no mapa.

## 11. Risco de dupla venda

**Classificação: ALTO**

Justificativa:
- Há proteção em banco com trigger + `pg_advisory_xact_lock` para `tickets` e `seat_locks` no par `trip_id + seat_id`.
- Há revalidação no frontend antes de confirmar.
- Porém ainda existem caminhos com `seat_id null`, dependência de sincronização assíncrona (webhook/verify), expiração de lock e possíveis inconsistências entre staging (`sale_passengers`) e ticket final.
- Isso reduz bastante, mas não elimina completamente cenários de race/inconsistência operacional.

## 12. Divergências encontradas

1. Fluxos diferentes de escrita:
   - público depende muito de lock + confirmação assíncrona;
   - admin manual ocupa por ticket imediato.
2. Status de venda não é sozinho a verdade do mapa; mapa depende de ticket/lock/passenger staging.
3. Volta em alguns caminhos pode ficar sem `seat_id` real.
4. Dependência de convergência webhook/verify para finalizar checkout público pode atrasar ocupação definitiva.

## 13. Fluxo correto recomendado

1. Toda seleção deve criar bloqueio temporário atômico por `trip_id + seat_id`.
2. Toda confirmação válida deve passar por um único finalizador idempotente.
3. A ocupação visual deve depender de uma única semântica consistente (idealmente ticket confirmado + reserva ativa explícita).
4. Manual com e sem taxa deve compartilhar o mesmo “estado final de ocupação” (independente de split).
5. Ida/volta sempre com identificador de trecho e assento físico coerentes.

## 14. Correção mínima recomendada

1. Auditar e padronizar obrigatoriedade de `seat_id` (evitar `null`) em tickets de ida/volta quando houver assento físico.
2. Garantir que todo caminho de venda manual (com e sem taxa) atualize os mesmos campos-chave de ocupação (`trip_id`, `seat_id`, `company_id`, status elegível).
3. Instrumentar alerta para venda paga sem refletir em RPC de ocupação (detecção automática de inconsistência).
4. Revisar filtros da RPC para estados `reservado/pendente_pagamento` conforme regra operacional desejada.

## 15. Correção estrutural recomendada, se necessária

- Consolidar “fonte canônica de ocupação” em estrutura/materialização única (ex.: visão ou tabela de ocupação por trecho/assento) alimentada por eventos transacionais idempotentes.
- Separar claramente:
  - reserva temporária;
  - bloqueio operacional;
  - venda confirmada;
  com TTL e transição de estado explícitos no banco.

## 16. Checklist para validação futura

- [ ] venda pública Pix
- [ ] venda pública cartão
- [ ] venda manual com taxa
- [ ] venda manual sem taxa
- [ ] empresa piloto
- [ ] evento ida
- [ ] evento ida e volta
- [ ] volta opcional
- [ ] ônibus
- [ ] van
- [ ] assento bloqueado
- [ ] assento cancelado
- [ ] tentativa de comprar assento já vendido
- [ ] tentativa simultânea de compra do mesmo assento
- [ ] webhook Asaas confirmado
- [ ] webhook Asaas atrasado
- [ ] pagamento pendente
- [ ] pagamento cancelado

---

## Evidências (arquivos/funções/tabelas)

### Arquivos analisados
- `docs/PRD/Asaas/00-asaas-indice-geral.md`
- `docs/PRD/Asaas/01-asaas-visao-geral.md`
- `docs/PRD/Asaas/02-asaas-fluxo-checkout-e-venda.md`
- `docs/PRD/Asaas/03-asaas-webhook-e-confirmacao.md`
- `src/pages/public/Checkout.tsx`
- `src/components/admin/NewSaleModal.tsx`
- `src/components/public/SeatMap.tsx`
- `src/lib/tripSeatOccupancyRpc.ts`
- `supabase/functions/_shared/payment-finalization.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/migrations/20260520120000_fix_seat_occupancy_by_trip_segment.sql`
- `supabase/migrations/20260311010520_fc7a27bc-058e-418c-b4c9-289ec167e201.sql`

### Funções analisadas
- `get_trip_seat_occupancy`
- `assert_physical_seat_available_for_ticket`
- `assert_physical_seat_available_for_lock`
- `finalizeConfirmedPayment`
- `createTicketsFromPassengersShared`

### Tabelas/campos relevantes
- `sales`: `status`, `trip_id`, `company_id`, `asaas_payment_status`, `platform_fee_status`, `reservation_expires_at`
- `tickets`: `sale_id`, `trip_id`, `seat_id`, `seat_label`, `company_id`
- `sale_passengers`: `sale_id`, `trip_id`, `seat_id`, `seat_label`, `company_id`
- `seat_locks`: `sale_id`, `trip_id`, `seat_id`, `company_id`, `expires_at`
- `seats`: `id`, `label`, `vehicle_id`, `company_id`, `status`

## 17. Questionário interno (respostas objetivas)

1. Fonte de verdade hoje: **RPC `get_trip_seat_occupancy`**.
2. Mesma no público e admin: **sim, na leitura do mapa**.
3. Reserva antes do pagamento: **sim (checkout com `seat_locks`)**; admin manual ocupa por ticket imediato.
4. Impede dupla venda no banco ou visual: **ambos (há proteção no banco)**.
5. Webhook necessário para pintar: **no checkout público, normalmente sim (ou verify fallback); no manual sem taxa, não deveria ser**.
6. Sem taxa passa pelo mesmo finalizador: **não necessariamente para ocupação, pois admin cria ticket direto**.
7. Manual com taxa vs sem taxa mesmo caminho final: **não totalmente; divergem no financeiro, ocupação deveria convergir por ticket**.
8. Split/comissão pode bloquear conclusão: **em tese não deveria bloquear ocupação; falhas são tratadas como log/pendência**.
9. Ida/volta usa identificador separado: **sim (`trip_id`)**.
10. Ônibus/van mesmo modelo de identificação: **sim (seat_id/seat_label no mesmo componente e RPC)**.
11. Risco de paga aparecer disponível: **sim, existe**.
12. Risco de vender duas vezes: **sim, risco residual existe apesar de mitigação**.
13. Causa mais provável: **inconsistência de materialização de ocupação entre caminhos (status x ticket/lock x segmentação por trip/seat_id)**.
14. Correção mínima recomendada: **padronizar e validar `seat_id/trip_id/company_id` em todos os caminhos + monitorar “pago sem ocupação na RPC”**.
15. Correção estrutural ideal: **modelo canônico transacional de ocupação por trecho/assento com estados explícitos e idempotência total**.
