
# Plano: Ajuste Final da Logica de Viagens, Embarques e Edicao

## Visao Geral

Refatorar a tela de Eventos para implementar a logica definitiva onde:
- O "Horario Base" da viagem e calculado automaticamente a partir do primeiro embarque (stop_order=1)
- Viagens e embarques podem ser editados (nao apenas excluidos)
- Exclusoes sao protegidas por validacoes de integridade
- Labels sao completos e inequivocos em toda a interface

---

## Parte 1: Remover Campo de Horario do Modal de Viagem

### Problema Atual
O modal de viagem atual (linhas 1719-1768) possui campos de horario:
- "Horario da Ida *"
- "Horario da Volta" com switch "A definir"

### Solucao
Remover completamente esses campos. O horario sera derivado automaticamente do primeiro embarque.

**Campos a manter no modal de viagem:**
- Tipo (Ida / Volta / Ida e Volta)
- Veiculo
- Motorista
- Ajudante (opcional)

**Campos a REMOVER:**
- ida_departure_time
- volta_departure_time
- volta_time_tbd

### Alteracao no TripFormState

```typescript
// ANTES
interface TripFormState {
  trip_creation_type: TripCreationType;
  vehicle_id: string;
  driver_id: string;
  assistant_driver_id: string;
  ida_departure_time: string;      // REMOVER
  volta_departure_time: string;    // REMOVER
  volta_time_tbd: boolean;         // REMOVER
  capacity: string;
}

// DEPOIS
interface TripFormState {
  trip_creation_type: TripCreationType;
  vehicle_id: string;
  driver_id: string;
  assistant_driver_id: string;
  capacity: string;
}
```

### Alteracao no handleAddTrip

Ao criar viagem, `departure_time` sera sempre `null`:

```typescript
const tripData = {
  event_id: editingId,
  trip_type: tripForm.trip_creation_type,
  vehicle_id: tripForm.vehicle_id,
  driver_id: tripForm.driver_id,
  assistant_driver_id: assistantDriverId,
  departure_time: null,  // Sempre null - calculado dos embarques
  capacity,
  company_id: activeCompanyId,
};
```

---

## Parte 2: Calcular Horario da Viagem a Partir dos Embarques

### Nova Funcao Helper

```typescript
// Retorna o horario do primeiro embarque (stop_order=1) da viagem
const getTripDepartureTime = (tripId: string): string | null => {
  const tripBoardings = eventBoardingLocations
    .filter(ebl => ebl.trip_id === tripId)
    .sort((a, b) => (a.stop_order || 1) - (b.stop_order || 1));
  
  if (tripBoardings.length === 0) return null;
  return tripBoardings[0].departure_time;
};
```

### Atualizar getTripLabel

```typescript
const getTripLabel = (trip: TripWithDetails) => {
  const type = trip.trip_type === 'ida' ? 'Ida' : 'Volta';
  
  // Calcular horario do primeiro embarque
  const computedTime = getTripDepartureTime(trip.id);
  const time = computedTime ? computedTime.slice(0, 5) : 'A definir';
  
  const vehicleType = trip.vehicle 
    ? vehicleTypeLabels[trip.vehicle.type] 
    : 'Veiculo';
  const plate = trip.vehicle?.plate ?? '???';
  const capacity = trip.capacity;
  const driver = trip.driver?.name ?? 'Motorista nao definido';
  
  return `${type} - ${time} - ${vehicleType} ${plate} - ${capacity} lug. - ${driver}`;
};
```

### Atualizar Exibicao do Card de Viagem

Na aba Viagens, o card mostrara o horario calculado:

```typescript
// Calcular horario baseado nos embarques
const computedTime = getTripDepartureTime(trip.id);
const isDepartureTimeTbd = !computedTime;

// Exibir
{isDepartureTimeTbd ? (
  <span className="font-medium text-amber-600 flex items-center gap-1">
    <AlertTriangle className="h-3 w-3" />
    A definir
  </span>
) : (
  <span className="font-medium">{computedTime.slice(0, 5)}</span>
)}
```

---

## Parte 3: Adicionar Funcionalidade de Edicao de Viagem

### Novos Estados

```typescript
const [editingTripId, setEditingTripId] = useState<string | null>(null);
```

### Funcao para Abrir Modal de Edicao

```typescript
const handleEditTrip = (trip: TripWithDetails) => {
  setEditingTripId(trip.id);
  setTripForm({
    trip_creation_type: trip.trip_type, // Travado na edicao
    vehicle_id: trip.vehicle_id,
    driver_id: trip.driver_id,
    assistant_driver_id: trip.assistant_driver_id ?? '',
    capacity: trip.capacity.toString(),
  });
  setTripDialogOpen(true);
};
```

### Funcao de Salvar Edicao

```typescript
const handleSaveTrip = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!editingId || !activeCompanyId) return;
  
  setSavingTrip(true);
  
  const assistantDriverId = tripForm.assistant_driver_id && tripForm.assistant_driver_id !== '__none__' 
    ? tripForm.assistant_driver_id 
    : null;

  if (editingTripId) {
    // EDICAO
    const updateData = {
      vehicle_id: tripForm.vehicle_id,
      driver_id: tripForm.driver_id,
      assistant_driver_id: assistantDriverId,
    };

    const { error } = await supabase
      .from('trips')
      .update(updateData)
      .eq('id', editingTripId);

    if (error) {
      toast.error('Erro ao atualizar viagem');
    } else {
      toast.success('Viagem atualizada');
    }
    setEditingTripId(null);
  } else {
    // CRIACAO (logica existente simplificada sem horarios)
    // ... criar viagens sem departure_time
  }

  setTripDialogOpen(false);
  resetTripForm();
  fetchEventTrips(editingId);
  setSavingTrip(false);
};
```

### UI do Card de Viagem com Botao Editar

```typescript
<div className="flex items-center gap-1">
  {!isReadOnly && (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => handleEditTrip(trip)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={() => confirmDeleteTrip(trip)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  )}
</div>
```

### Modal Adaptado para Criacao/Edicao

```typescript
<DialogTitle>
  {editingTripId ? 'Editar Viagem' : 'Adicionar Viagem'}
</DialogTitle>

// Na edicao, travar o tipo da viagem
{!editingTripId && (
  <RadioGroup ...> // Tipo de viagem </RadioGroup>
)}

{editingTripId && (
  <div className="text-sm text-muted-foreground">
    Tipo: {tripForm.trip_creation_type === 'ida' ? 'Ida' : 'Volta'}
    (nao pode ser alterado)
  </div>
)}
```

---

## Parte 4: Adicionar Funcionalidade de Edicao de Embarque

### Novos Estados

```typescript
const [editingBoardingId, setEditingBoardingId] = useState<string | null>(null);
```

### Funcao para Abrir Modal de Edicao

```typescript
const handleEditBoarding = (boarding: EventBoardingLocationWithDetails) => {
  setEditingBoardingId(boarding.id);
  setBoardingForm({
    boarding_location_id: boarding.boarding_location_id,
    departure_time: boarding.departure_time ?? '',
    trip_id: boarding.trip_id ?? '__none__',
    stop_order: boarding.stop_order?.toString() ?? '',
  });
  setBoardingDialogOpen(true);
};
```

### Funcao de Salvar Edicao

```typescript
const handleSaveBoarding = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!editingId || !activeCompanyId) return;
  
  setSavingBoarding(true);

  const tripId = boardingForm.trip_id && boardingForm.trip_id !== '__none__' 
    ? boardingForm.trip_id 
    : null;

  if (editingBoardingId) {
    // EDICAO
    const updateData = {
      boarding_location_id: boardingForm.boarding_location_id,
      departure_time: boardingForm.departure_time || null,
      trip_id: tripId,
      stop_order: parseInt(boardingForm.stop_order, 10) || 1,
    };

    const { error } = await supabase
      .from('event_boarding_locations')
      .update(updateData)
      .eq('id', editingBoardingId);

    if (error) {
      toast.error('Erro ao atualizar local de embarque');
    } else {
      toast.success('Local de embarque atualizado');
    }
    setEditingBoardingId(null);
  } else {
    // CRIACAO (logica existente)
    // ...
  }

  setBoardingDialogOpen(false);
  resetBoardingForm();
  fetchEventBoardingLocations(editingId);
  setSavingBoarding(false);
};
```

### UI do Card de Embarque com Botao Editar

```typescript
<div className="flex items-center gap-1 shrink-0">
  {!isReadOnly && (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => handleEditBoarding(ebl)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={() => confirmDeleteBoarding(ebl)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  )}
</div>
```

---

## Parte 5: Validacoes de Exclusao

### Exclusao de Viagem - Verificar Embarques

```typescript
const [deleteTripDialogOpen, setDeleteTripDialogOpen] = useState(false);
const [tripToDelete, setTripToDelete] = useState<TripWithDetails | null>(null);
const [tripDeleteBlockReason, setTripDeleteBlockReason] = useState<string | null>(null);

const confirmDeleteTrip = async (trip: TripWithDetails) => {
  // Verificar se tem embarques vinculados
  const tripBoardings = eventBoardingLocations.filter(
    ebl => ebl.trip_id === trip.id
  );
  
  if (tripBoardings.length > 0) {
    setTripDeleteBlockReason(
      `Esta viagem possui ${tripBoardings.length} embarque(s) vinculado(s). ` +
      `Remova ou realoque os embarques antes de excluir.`
    );
    setTripToDelete(trip);
    setDeleteTripDialogOpen(true);
    return;
  }

  // Verificar se tem vendas vinculadas
  const { data: sales } = await supabase
    .from('sales')
    .select('id')
    .eq('trip_id', trip.id)
    .limit(1);

  if (sales && sales.length > 0) {
    setTripDeleteBlockReason(
      `Esta viagem possui passagens vendidas ou reservadas. ` +
      `Nao e possivel excluir. Considere marcar o evento como encerrado.`
    );
    setTripToDelete(trip);
    setDeleteTripDialogOpen(true);
    return;
  }

  // Sem bloqueios - confirmar exclusao
  setTripDeleteBlockReason(null);
  setTripToDelete(trip);
  setDeleteTripDialogOpen(true);
};

const handleDeleteTripConfirmed = async () => {
  if (!tripToDelete || tripDeleteBlockReason) return;
  
  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', tripToDelete.id);

  if (error) {
    toast.error('Erro ao excluir viagem');
  } else {
    toast.success('Viagem excluida');
    fetchEventTrips(editingId!);
    fetchEvents();
  }
  setDeleteTripDialogOpen(false);
  setTripToDelete(null);
};
```

### Exclusao de Embarque - Verificar Passageiros

```typescript
const [deleteBoardingDialogOpen, setDeleteBoardingDialogOpen] = useState(false);
const [boardingToDelete, setBoardingToDelete] = useState<EventBoardingLocationWithDetails | null>(null);
const [boardingDeleteBlockReason, setBoardingDeleteBlockReason] = useState<string | null>(null);

const confirmDeleteBoarding = async (boarding: EventBoardingLocationWithDetails) => {
  // Verificar se tem vendas vinculadas a este local
  const { data: sales } = await supabase
    .from('sales')
    .select('id')
    .eq('boarding_location_id', boarding.boarding_location_id)
    .eq('trip_id', boarding.trip_id)
    .limit(1);

  if (sales && sales.length > 0) {
    setBoardingDeleteBlockReason(
      `Este local de embarque possui passageiros vinculados. ` +
      `Nao e possivel excluir.`
    );
    setBoardingToDelete(boarding);
    setDeleteBoardingDialogOpen(true);
    return;
  }

  // Sem bloqueios
  setBoardingDeleteBlockReason(null);
  setBoardingToDelete(boarding);
  setDeleteBoardingDialogOpen(true);
};
```

### Dialogs de Confirmacao com Bloqueio

```typescript
{/* Delete Trip Dialog */}
<AlertDialog open={deleteTripDialogOpen} onOpenChange={setDeleteTripDialogOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>
        {tripDeleteBlockReason ? 'Exclusao Bloqueada' : 'Excluir Viagem'}
      </AlertDialogTitle>
      <AlertDialogDescription>
        {tripDeleteBlockReason || (
          `Tem certeza que deseja excluir esta viagem (${tripToDelete?.trip_type})?`
        )}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>
        {tripDeleteBlockReason ? 'Entendi' : 'Cancelar'}
      </AlertDialogCancel>
      {!tripDeleteBlockReason && (
        <AlertDialogAction
          onClick={handleDeleteTripConfirmed}
          className="bg-destructive text-destructive-foreground"
        >
          Excluir
        </AlertDialogAction>
      )}
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Parte 6: Labels Consistentes no Modal de Embarque

### Problema Atual

O select de viagem no modal de embarque usa label simplificado:
```typescript
{trip.trip_type === 'ida' ? 'Ida' : 'Volta'} - {trip.departure_time?.slice(0, 5)}
```

### Solucao

Usar a funcao `getTripLabel` para manter consistencia:

```typescript
{/* Link to Trip - usando label completo */}
<div className="space-y-2">
  <Label>Vincular a Viagem</Label>
  <Select
    value={boardingForm.trip_id || '__none__'}
    onValueChange={(value) => setBoardingForm({ ...boardingForm, trip_id: value })}
  >
    <SelectTrigger>
      <SelectValue placeholder="Selecione uma viagem" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="__none__">Selecione uma viagem</SelectItem>
      {eventTrips.map((trip) => (
        <SelectItem key={trip.id} value={trip.id}>
          {getTripLabel(trip)}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

### Pre-selecionar Viagem

Quando o usuario adiciona embarque com uma viagem ja selecionada na aba:

```typescript
const handleOpenBoardingDialog = () => {
  setBoardingForm({
    boarding_location_id: '',
    departure_time: '',
    trip_id: selectedTripIdForBoardings || '',
    stop_order: '',
  });
  setBoardingDialogOpen(true);
};

// No botao "Adicionar Local":
onClick={handleOpenBoardingDialog}
```

---

## Parte 7: Remover Opcao "Todas as Viagens" do Modal de Embarque

### Problema
A opcao "Todas as viagens" nao faz sentido no modelo operacional, pois cada embarque deve pertencer a uma viagem especifica.

### Solucao
Tornar a selecao de viagem obrigatoria:

```typescript
<Select
  value={boardingForm.trip_id}
  onValueChange={(value) => setBoardingForm({ ...boardingForm, trip_id: value })}
  required
>
  <SelectTrigger>
    <SelectValue placeholder="Selecione uma viagem *" />
  </SelectTrigger>
  <SelectContent>
    {eventTrips.map((trip) => (
      <SelectItem key={trip.id} value={trip.id}>
        {getTripLabel(trip)}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

---

## Parte 8: Ordenacao de Embarques

Garantir que embarques sejam ordenados por `stop_order` em todas as queries:

```typescript
const fetchEventBoardingLocations = async (eventId: string) => {
  const { data, error } = await supabase
    .from('event_boarding_locations')
    .select(`...`)
    .eq('event_id', eventId)
    .order('stop_order', { ascending: true });  // Ordenar por ordem de parada
};
```

---

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/admin/Events.tsx` | Remover campos de horario do modal de viagem |
| `src/pages/admin/Events.tsx` | Adicionar funcao getTripDepartureTime |
| `src/pages/admin/Events.tsx` | Atualizar getTripLabel para usar horario calculado |
| `src/pages/admin/Events.tsx` | Adicionar estados e handlers para edicao de viagem |
| `src/pages/admin/Events.tsx` | Adicionar estados e handlers para edicao de embarque |
| `src/pages/admin/Events.tsx` | Adicionar validacoes de exclusao (embarques/vendas) |
| `src/pages/admin/Events.tsx` | Adicionar dialogs de confirmacao com bloqueio |
| `src/pages/admin/Events.tsx` | Usar getTripLabel no modal de embarque |
| `src/pages/admin/Events.tsx` | Tornar selecao de viagem obrigatoria no embarque |
| `src/pages/admin/Events.tsx` | Pre-selecionar viagem ao abrir modal de embarque |

---

## Criterios de Sucesso

1. Usuario cria viagem SEM informar horario
2. Horario aparece automaticamente apos cadastrar primeiro embarque (ordem 1)
3. Usuario consegue EDITAR viagem (veiculo, motorista, ajudante)
4. Usuario consegue EDITAR embarque (local, horario, ordem)
5. Exclusao de viagem com embarques e BLOQUEADA com mensagem clara
6. Exclusao de viagem com vendas e BLOQUEADA definitivamente
7. Exclusao de embarque com passageiros e BLOQUEADA
8. Labels de viagem sao completos e inequivocos em TODOS os dropdowns
9. Fluxo intuitivo para eventos noturnos (shows, festas, excursoes)

---

## Fora do Escopo

- PDF / Excel
- Pagamento real
- Mapa de assentos
- Campo "status" na viagem (ativa/cancelada) - pode ser implementado futuramente

