

# Padronizar Mapa de Assentos no Admin — Plano

## Problema

No `NewSaleModal.tsx` (linhas 356-386), o fetch de tickets traz apenas `seat_id` sem distinguir bloqueios operacionais de ocupação real. Tudo é tratado como `occupiedSeatIds`. O `SeatMap` não recebe `blockedSeatIds`, então bloqueios aparecem como "ocupado" (cinza/usuário) em vez de "bloqueado" (âmbar/ban).

## Correção (único arquivo: `NewSaleModal.tsx`)

### 1. Estado novo
Adicionar `const [blockedSeatIds, setBlockedSeatIds] = useState<string[]>([]);` ao lado de `occupiedSeatIds` (linha ~148).

### 2. Ajustar fetch (linhas 364-385)
Alterar a query de tickets para incluir `sale_id`:
```ts
supabase.from('tickets').select('seat_id, sale_id').eq('trip_id', selectedTripId)
```

Adicionar ordenação explícita ao fetch de seats:
```ts
supabase.from('seats').select('*')
  .eq('vehicle_id', selectedVehicle.id)
  .eq('company_id', activeCompanyId!)
  .order('floor').order('row_number').order('column_number')
```

Após obter tickets, buscar as sales correspondentes para separar bloqueios:
```ts
const saleIds = [...new Set(ticketsData.map(t => t.sale_id).filter(Boolean))];
// Buscar sales para identificar bloqueios operacionais
const { data: salesData } = await supabase
  .from('sales')
  .select('id, customer_name, status')
  .in('id', saleIds);

// Bloqueio operacional: customer_name = 'BLOQUEIO' e status != 'cancelado'
const blockSaleIds = new Set(
  (salesData ?? [])
    .filter(s => s.customer_name === 'BLOQUEIO' && s.status !== 'cancelado')
    .map(s => s.id)
);

const blocked: string[] = [];
const occupied: string[] = [];
ticketsData.forEach(t => {
  if (!t.seat_id) return;
  if (blockSaleIds.has(t.sale_id)) blocked.push(t.seat_id);
  else occupied.push(t.seat_id);
});

setOccupiedSeatIds(occupied);
setBlockedSeatIds(blocked);
```

### 3. Passar `blockedSeatIds` ao SeatMap (linha ~898-907)
```tsx
<SeatMap
  seats={seats}
  occupiedSeatIds={occupiedSeatIds}
  blockedSeatIds={blockedSeatIds}
  ...
/>
```

### 4. Filtrar _legacy_/_tmp_ (defesa, como no público)
Ao setar seats, filtrar labels técnicos:
```ts
const validSeats = (seatsRes.data ?? []).filter(
  (s: any) => !s.label.startsWith('_legacy_') && !s.label.startsWith('_tmp_')
);
setSeats(validSeats as Seat[]);
```

### 5. Reset blockedSeatIds nos pontos de limpeza
No reset do useEffect quando `!selectedTripId` (linha 359) e no reset geral ao abrir o modal.

## Resultado
Admin e Público usam o mesmo componente `SeatMap` com os mesmos dados de entrada (`occupiedSeatIds` + `blockedSeatIds`), gerando render idêntico.

