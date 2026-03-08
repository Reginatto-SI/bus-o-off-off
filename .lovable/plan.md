

## Plano: Filtrar trips por janela de embarque + melhorar label do dropdown

### 1. Filtrar trips por janela de embarque (5 dias)

A tabela `event_boarding_locations` possui o campo `departure_date` (data do embarque). Esse é o campo correto para filtrar — não a data do evento.

**Lógica:**
- Após buscar as trips, fazer uma sub-query em `event_boarding_locations` para obter a **menor `departure_date`** (primeiro embarque) de cada trip
- Filtrar apenas trips cuja menor `departure_date` esteja dentro da janela: `hoje - 1 dia` até `hoje + 5 dias`
  - O `-1 dia` garante que embarques que começaram ontem (viagem ainda em andamento) continuem visíveis
  - O `+5 dias` cobre o cenário de embarque dia 10 → evento dia 12 → retorno dia 15

**Implementação:** Na função `fetchAllTrips` do `DriverHome.tsx`, após buscar as trips, buscar as `departure_date` mínimas por trip_id e filtrar o array `mapped` antes de setar no state.

### 2. Melhorar label do dropdown

Formato atual: `Meu Primeiro Evento · AJY-7E61`

Novo formato: `08/03/2026 · Meu Primeiro Evento · AJY-7E61`

**Implementação:** Usar `formatDateOnlyBR(t.eventDate)` no `SelectItem` e no `SelectValue`. A data do evento já está disponível em `TripInfo.eventDate`.

### Arquivos alterados

- `src/pages/driver/DriverHome.tsx` — filtro por janela de embarque + novo label no dropdown

