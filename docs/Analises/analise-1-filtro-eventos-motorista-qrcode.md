# Análise 1 — Filtro de eventos do motorista/QR Code (`/validador`)

## 1. Resumo executivo

A tela operacional do motorista/auxiliar fica na rota `/validador` e usa o componente `DriverHome` para carregar viagens/eventos, exibir o dropdown inicial, separar as fases **Ida**, **Desembarque** e **Reembarque**, mostrar o card ativo e encaminhar para scanner/lista de passageiros.

A investigação encontrou que a query principal **não filtrava eventos com `>= hoje` no banco**. O risco estava no filtro client-side centralizado em `src/lib/eventOperationalWindow.ts`: ele calculava o fim operacional com campos `DATE` (`events.date` ou `event_boarding_locations.departure_date`) e comparava o timestamp resultante com `new Date()`. Em servidores/navegadores fora do Brasil, especialmente perto da virada UTC, um evento ainda dentro do dia operacional brasileiro poderia ser escondido antes da hora.

A correção foi mínima e centralizada: a visibilidade operacional continua considerando o fim do dia do último embarque/data do evento + 2 dias, mas a comparação agora usa a string calendário `YYYY-MM-DD` no timezone operacional explícito `America/Sao_Paulo`, evitando dependência de UTC ou timezone do ambiente.

## 2. Arquivos investigados

- `src/App.tsx`
  - Define a rota atual `/validador` e redirects legados de `/motorista`.
- `src/pages/driver/DriverHome.tsx`
  - Tela principal do motorista/auxiliar, dropdown de viagens/eventos, fases e card ativo.
- `src/pages/driver/DriverBoarding.tsx`
  - Lista de passageiros e operação manual conforme viagem/fase persistidas.
- `src/pages/driver/DriverValidate.tsx`
  - Scanner QR Code e chamada RPC de validação por fase.
- `src/lib/eventOperationalWindow.ts`
  - Helper central de janela operacional/visibilidade de eventos.
- `src/lib/eventOperationalWindow.test.ts`
  - Testes automatizados da janela operacional.
- `src/lib/date.ts`
  - Helpers de data `DATE` e formatação.
- `src/lib/driverPhaseConfig.ts`
  - Configuração compartilhada de Ida, Desembarque e Reembarque.
- `src/lib/driverTripStorage.ts`
  - Persistência local de viagem/fase por usuário e empresa.
- `supabase/migrations/20260403000000_add_driver_qr_validation_flow.sql`
  - RPC `validate_ticket_scan`, validação de QR e isolamento multiempresa.

## 3. Rota/tela identificada

A rota exata da tela do motorista/QR Code é:

- `/validador` → `DriverHome`.
- `/validador/validar` → `DriverValidate`.
- `/validador/embarque` → `DriverBoarding`.
- `/validador/preferencias` → `DriverPreferences`.

As rotas antigas `/motorista`, `/motorista/validar`, `/motorista/embarque` e `/motorista/preferencias` apenas redirecionam para as rotas novas de `/validador`.

## 4. Queries ou hooks encontrados

### `DriverHome` — dropdown e card ativo

`fetchAllTrips()` busca viagens em `trips` com join obrigatório em `events` e `vehicles`:

- quando há `driver_id`, filtra por motorista/auxiliar (`driver_id` ou `assistant_driver_id`);
- sempre filtra por `trips.company_id = activeCompanyId`;
- sempre filtra por `events.status = 'a_venda'`;
- ordena por `events(date)`;
- em seguida busca `event_boarding_locations` por `event_id` e `company_id` para calcular a janela operacional.

O dropdown usa `phaseFilteredTrips`, derivado de `allTrips` já filtrado por `isOperationallyVisible()`.

### `DriverBoarding` — lista de passageiros

`fetchData()` tenta usar a viagem persistida. Se ela não estiver operacionalmente visível, busca a primeira viagem operacionalmente visível dentro da mesma empresa e, quando aplicável, atribuída ao motorista/auxiliar. Depois carrega:

- `tickets` por `trip_id` e `company_id`;
- `sales` pagas (`status = 'pago'`) para obter local de embarque.

### `DriverValidate` — scanner QR Code

O scanner não carrega lista/dropdown de eventos. Ele lê a fase persistida (`ida`, `desembarque`, `reembarque`) e chama a RPC `validate_ticket_scan` com a ação correspondente (`checkin`, `checkout`, `reboard`). A RPC resolve o ticket pelo token e valida multiempresa pelo `company_id` do ticket.

## 5. Regra atual de filtro de data

A regra existente já era uma janela operacional pós-evento:

- base principal: último `event_boarding_locations.departure_date/departure_time` do evento;
- fallback: `events.date` quando não há locais/embarques com data;
- fim operacional: fim do dia da base + 2 dias de folga;
- eventos futuros permanecem visíveis porque o fim operacional é maior que o dia atual.

Não foi encontrada query da tela `/validador` aplicando `.gte('events.date', hoje)` ou `toISOString()` para filtrar eventos a partir de hoje. A exclusão ocorria no filtro central `isOperationallyVisible()`.

## 6. Causa raiz ou risco encontrado

O risco real estava na comparação por timestamp:

```ts
return operationalEnd.getTime() >= now.getTime();
```

Embora os campos de data fossem tratados como `DATE`, a comparação final dependia de `new Date()` e do timezone do ambiente. Exemplo de risco: no instante `2026-06-09T01:30:00.000Z`, ainda é noite de `08/06/2026` no Brasil. Um evento de `06/06/2026` deve continuar visível até o fim de D+2 no calendário brasileiro (`08/06/2026`), mas uma comparação por timestamp em UTC poderia escondê-lo antecipadamente.

## 7. Correção aplicada

A correção foi feita no helper central `src/lib/eventOperationalWindow.ts`, sem alterar layout, fluxo de vendas, passageiros, assentos, pagamentos, RLS ou permissões.

Alterações:

1. Adicionado timezone operacional explícito `America/Sao_Paulo` em `src/lib/date.ts`.
2. Adicionado helper `getCalendarDateInTimeZone()` para retornar `YYYY-MM-DD` no timezone informado.
3. Adicionado helper `formatDateOnly()` para serializar um `Date` já normalizado sem converter para UTC.
4. Alterado `isOperationallyVisible()` para comparar:
   - data atual operacional no Brasil (`YYYY-MM-DD`);
   - data final operacional do evento (`YYYY-MM-DD`).
5. Adicionado comentário no código explicando a janela D-2/D+2 e o motivo operacional.
6. Adicionados testes cobrindo virada UTC/Brasil.

## 8. Validação da janela D-2 até eventos futuros

A janela efetiva permanece:

- evento de hoje: visível;
- evento de D-1: visível;
- evento de D-2: visível até o fim do dia operacional brasileiro;
- evento D-3 ou anterior: oculto quando a folga operacional já encerrou no calendário brasileiro;
- evento futuro: visível normalmente, pois a data final operacional é maior que a data atual operacional.

Exemplo validado por teste:

- Evento `2026-06-06` com fallback em `events.date`.
- `2026-06-09T01:30:00.000Z` ainda é `08/06/2026` no Brasil, então o evento segue visível.
- `2026-06-09T03:01:00.000Z` já é `09/06/2026` no Brasil, então o evento sai da janela D+2.

## 9. Validação de Ida, Desembarque e Reembarque

A tela usa a mesma origem `allTrips` e a mesma janela operacional para todas as fases:

- **Ida**: `trip_type = 'ida'`.
- **Desembarque**: também usa `trip_type = 'ida'`, conforme comentário existente para evitar mistura visual com a volta.
- **Reembarque**: `trip_type = 'volta'`.

Como o filtro de data ocorre antes da separação por fase, a regra corrigida vale para dropdown, card ativo, KPIs e navegação para lista/scanner.

## 10. Validação de multiempresa/company_id

A correção não removeu nem afrouxou filtros de empresa.

Validações no código:

- `DriverHome` consulta `user_roles` por `user_id` e `company_id`.
- `DriverHome` consulta `trips` por `company_id`.
- `DriverHome` consulta `event_boarding_locations` por `company_id`.
- `DriverBoarding` consulta `companies`, `trips`, `event_boarding_locations` e `tickets` por `activeCompanyId`.
- A RPC `validate_ticket_scan` usa o `company_id` do ticket e bloqueia quando o usuário não pertence à empresa do ticket.

A alteração foi apenas de comparação de calendário, sem ampliar acesso entre empresas.

## 11. Riscos remanescentes

- A query de viagens da tela `/validador` continua buscando todos os eventos `a_venda` da empresa e filtrando a janela no cliente. Isso preserva o comportamento atual e evita mudança de contrato, mas pode ser menos eficiente se uma empresa tiver muitos eventos ativos antigos.
- Não foi alterada a RPC `validate_ticket_scan`; ela não aplica filtro de data de evento e opera por QR/ticket. Qualquer regra futura de bloqueio por janela operacional no backend precisará repetir a mesma lógica calendário-Brasil para não reintroduzir o problema.
- A tela depende de `activeCompanyId` provido pelo contexto de autenticação; a correção não alterou esse fluxo.

## 12. Checklist de testes executados

- [x] Teste automatizado: evento de hoje permanece visível após o horário de embarque.
- [x] Teste automatizado: evento dentro de D+2 permanece visível.
- [x] Teste automatizado: virada UTC não esconde evento enquanto ainda é D+2 no Brasil.
- [x] Teste automatizado: evento sai da janela quando o calendário do Brasil já passou de D+2.
- [x] Inspeção manual de código: dropdown inicial usa `phaseFilteredTrips` derivado da janela operacional central.
- [x] Inspeção manual de código: Ida, Desembarque e Reembarque usam a mesma lista base filtrada.
- [x] Inspeção manual de código: filtros `company_id` foram preservados.
- [x] Inspeção manual de código: não há `.gte('events.date', hoje)` ou `toISOString()` na query da tela `/validador`.

## 13. Resultado final

A tela do motorista/QR Code ficou mais segura operacionalmente: eventos de hoje e até dois dias anteriores permanecem disponíveis conforme o calendário brasileiro, sem depender da timezone do servidor/navegador para decidir a virada do dia. Eventos futuros continuam aparecendo normalmente e o isolamento multiempresa por `company_id` foi mantido.
