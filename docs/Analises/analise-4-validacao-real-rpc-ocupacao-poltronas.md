# Análise 4 — Validação real da RPC de ocupação (evento d8af7267-3560-495d-8b31-1590eeca36f3)

## 1) Resumo executivo
- Foi executada validação real contra o Supabase do projeto (`cdrcyjrvurrphnceromd`) usando `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` do ambiente.
- Resultado: a RPC `get_trip_seat_occupancy` **retorna ocupação** para os trips do par ida/volta que compartilham o mesmo veículo, e retorna vazio para um trip de volta com veículo diferente e sem ocupação.
- O padrão encontrado está consistente com a regra da RPC (agregação por `event_id + vehicle_id + company_id`).
- Ainda existe limitação de auditoria completa com chave anon: RLS não expõe `tickets` no mesmo nível do `sales`/RPC; portanto a confirmação linha-a-linha de origem (`tickets` vs `sale_passengers` vs `seat_locks`) depende de execução com credencial administrativa/service-role no ambiente operacional.

## 2) Evento analisado
- `d8af7267-3560-495d-8b31-1590eeca36f3`.

## 3) Trips encontradas
Consultado via REST (`/rest/v1/trips?event_id=eq...`):

1. `295a4c2a-e1e9-4aa1-b7b4-6e1bc50dd08f` — `trip_type=volta` — `vehicle_id=95f8051f-71a4-4c36-a653-4ad068fb6c26`
2. `bee273ac-04cb-452b-b071-93453151630e` — `trip_type=ida` — `vehicle_id=e6709c90-14e5-47fc-aac7-cee4c84d71bc`
3. `8d0b7934-656e-4117-bf72-07c211f05778` — `trip_type=volta` — `vehicle_id=e6709c90-14e5-47fc-aac7-cee4c84d71bc`

## 4) Vendas encontradas
Consultado via REST (`/rest/v1/sales?event_id=eq...`):
- Total: **25** vendas.
- Status:
  - `pago`: **23**
  - `cancelado`: **2**

## 5) Passageiros/passagens encontradas
- `sale_passengers` por `trip_id in (...)`: **0 registros** (retorno anon).
- Observação: isso não prova ausência real no banco; prova ausência de linhas visíveis para esse papel/consulta.

## 6) Tickets encontrados
- Consulta anon em `tickets` por `trip_id in (...)` retornou **0 linhas visíveis**.
- Foi detectado também que o campo `tickets.status` não existe (erro de coluna), então a validação foi repetida sem esse campo.
- Conclusão: com chave anon neste ambiente, não foi possível auditar o detalhe linha-a-linha dos tickets do evento.

## 7) Seat locks encontrados
- `seat_locks` por `trip_id in (...)`: **0 linhas visíveis** (ativos e expirados).
- Conclusão igual ao item 5/6: com papel anon, não há visibilidade completa para auditoria operacional do lock store.

## 8) Resultado da RPC por trip
Chamadas reais (`POST /rest/v1/rpc/get_trip_seat_occupancy`):

- Trip `295a4c2a-e1e9-4aa1-b7b4-6e1bc50dd08f` (volta, veículo isolado):
  - retorno: **0 assentos**.
- Trip `bee273ac-04cb-452b-b071-93453151630e` (ida, veículo compartilhado com volta):
  - retorno: **24 assentos** (`is_blocked=false` em todos os retornos).
- Trip `8d0b7934-656e-4117-bf72-07c211f05778` (volta, mesmo veículo da ida):
  - retorno: **24 assentos** (`is_blocked=false` em todos os retornos).

## 9) Comparação esperado vs RPC vs frontend
### Esperado pelos dados reais disponíveis
- Há 23 vendas pagas no evento.
- Dois trips (`ida` + `volta`) compartilham o mesmo veículo e ambos retornam 24 assentos ocupados na RPC.
- Um trip de volta separado retorna vazio.

### RPC
- Coerente com agregação por veículo físico compartilhado (ida/volta retornam mesma ocupação quando mesmo veículo).

### Frontend
- Checkout público e venda manual usam a mesma RPC para pintar e revalidar assentos (mudança da análise 3), então tendem a exibir o mesmo resultado retornado acima.

## 10) Causa raiz confirmada
- A correção anterior (remover leitura paralela no frontend) foi apropriada.
- Para este evento, a RPC não se mostrou vazia nos trips críticos (ida/volta com mesmo veículo), então **não há evidência de falha da RPC nesse caso** com os dados acessíveis.

## 11) Correção aplicada nesta tarefa
- **Nenhuma alteração de lógica** nesta rodada.
- Escopo desta tarefa foi validação real do evento e documentação de evidências.

## 12) Houve migration?
- **Não**.

## 13) Validação da tela pública
- Pelo código atual, o checkout chama `get_trip_seat_occupancy` para carregar e revalidar assentos.
- Com a RPC retornando 24 assentos nos trips relevantes, a tendência é o checkout já bloquear esses assentos.

## 14) Validação da venda manual
- Pelo código atual, `NewSaleModal` também usa a mesma RPC para mapa e revalidação pré-confirm.
- Portanto a ocupação deve espelhar o checkout.

## 15) Validação da proteção final contra overbooking
- A proteção final no banco permanece nas validações transacionais/trigger de disponibilidade física por evento+veículo+assento.
- Mesmo se frontend falhar visualmente, a criação concorrente deve ser barrada no banco quando houver colisão de assento ocupado/lock ativo.

## 16) Riscos restantes
- Para responder 100% das perguntas de origem por linha (`tickets` x `sale_passengers` x `seat_locks`, ativos/expirados, e casos individuais), é necessário repetir esta auditoria com credencial administrativa/service-role no ambiente operacional.
- Com chave anon, parte da resposta fica limitada por RLS (não por ausência de dados).

## 17) Respostas objetivas às 20 perguntas obrigatórias
1. Trips do evento: 3 (IDs listados no item 3).
2. Ida: `bee273ac-04cb-452b-b071-93453151630e`.
3. Volta: `295a4c2a-e1e9-4aa1-b7b4-6e1bc50dd08f` e `8d0b7934-656e-4117-bf72-07c211f05778`.
4. Checkout ida: usa o `trip_id` vindo da rota/query (`tripId`) — para este evento, o trip de ida é o ID acima.
5. Checkout volta: idem, `tripId` da rota; para este evento existem dois possíveis IDs de volta.
6. Admin ida: usa `selectedTripId` escolhido no modal; trip de ida identificado acima.
7. Admin volta: usa `selectedTripId`; para este evento, um dos dois trips de volta.
8. RPC por trip: 0 (volta isolada), 24 (ida compartilhada), 24 (volta compartilhada).
9. RPC retorna assentos de tickets? Pela implementação, sim; por dados anon, não foi possível decompor origem linha-a-linha.
10. RPC retorna assentos de sale_passengers? Pela implementação, sim; por dados anon, não foi possível decompor origem linha-a-linha.
11. RPC retorna assentos de seat_locks ativos? Pela implementação, sim; por dados anon, não foi possível decompor origem linha-a-linha.
12. RPC ignora seat_locks expirados? Sim, regra `expires_at > now()`.
13. RPC ignora vendas canceladas? Sim, tickets com venda cancelada são filtrados e sale_passengers só conta statuses específicos.
14. RPC considera vendas pagas? Sim (`sale_passengers` inclui `pago`; tickets de venda não cancelada também entram).
15. RPC considera reservadas/pendentes que devem bloquear? Sim (`pendente_pagamento`, `reservado`).
16. Houve venda/passagem que deveria bloquear e não apareceu? Não foi identificado no nível agregado observado (24/24 nos trips compartilhados).
17. Poltrona livre no checkout mas ocupada em dados? Não evidenciado nesta coleta (precisa validação UI online + perfil admin para prova por assento).
18. Existe validação final anti-duplicidade? Sim, há validação no backend/banco para disputa de assento físico.
19. Validação final usa mesma regra da RPC? Usa regra equivalente por contexto físico (evento+veículo+assento), com caminho transacional próprio no banco.
20. Bug pode afetar todos os eventos ou só ida/volta? Pode afetar qualquer evento com divergência de fonte; impacto é mais crítico em ida/volta com veículo compartilhado.

## Conclusão objetiva
- Com dados reais acessíveis nesta execução, a RPC se comportou corretamente no evento informado (retornando ocupação consistente nos trips compartilhados).
- A correção anterior de frontend (fonte única RPC) permanece válida.
- Não houve nova correção de código nesta rodada; a pendência para “prova forense completa por assento/origem” é rodar a mesma auditoria com credencial administrativa/service-role para vencer restrições de RLS do papel anon.
