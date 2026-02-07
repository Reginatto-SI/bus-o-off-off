
# Plano: Logica Profissional de Viagens, Embarques e Volta "A Definir"

## Visao Geral

Refatorar a logica de viagens e embarques para refletir a operacao real de transporte, com suporte a horarios "A definir" na volta, atalho "Ida e Volta", ordem de embarques, e labels inequivocos.

---

## Parte 1: Alteracoes no Banco de Dados

### 1.1 Alterar tabela `trips` - Horario Opcional para Volta

```sql
-- Tornar departure_time nullable para suportar "A definir"
ALTER TABLE public.trips 
  ALTER COLUMN departure_time DROP NOT NULL;

-- Adicionar campo para vinculo de par (ida/volta)
ALTER TABLE public.trips 
  ADD COLUMN IF NOT EXISTS paired_trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.trips.departure_time IS 'Horario base da viagem. NULL = A definir (comum na volta)';
COMMENT ON COLUMN public.trips.paired_trip_id IS 'ID da viagem par (ida vinculada a volta e vice-versa)';
```

### 1.2 Adicionar ordem nos embarques

```sql
-- Adicionar campo de ordem no embarque
ALTER TABLE public.event_boarding_locations 
  ADD COLUMN IF NOT EXISTS stop_order integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.event_boarding_locations.stop_order IS 'Ordem da parada na rota (1 = primeira)';
```

---

## Parte 2: Atualizacao de Tipos TypeScript

### src/types/database.ts

```typescript
// Adicionar tipo expandido para tipo de viagem
export type TripType = 'ida' | 'volta';
export type TripCreationType = 'ida' | 'volta' | 'ida_volta'; // Atalho de criacao

// Atualizar interface Trip
export interface Trip {
  id: string;
  event_id: string;
  vehicle_id: string;
  driver_id: string;
  assistant_driver_id: string | null;
  paired_trip_id: string | null;        // NOVO
  trip_type: TripType;
  departure_time: string | null;        // ALTERADO: agora nullable
  capacity: number;
  company_id: string;
  created_at: string;
  updated_at: string;
  vehicle?: Vehicle;
  driver?: Driver;
  assistant_driver?: Driver;
}

// Atualizar interface EventBoardingLocation
export interface EventBoardingLocation {
  id: string;
  event_id: string;
  boarding_location_id: string;
  trip_id: string | null;
  departure_time: string | null;
  stop_order: number;                   // NOVO
  company_id: string;
  boarding_location?: BoardingLocation;
  trip?: Trip;
}
```

---

## Parte 3: Novo Fluxo do Modal de Viagem

### 3.1 Tipo de Viagem com Atalho

```text
+--------------------------------------------------+
| Adicionar Viagem                           [X]   |
+--------------------------------------------------+
| Tipo da Viagem *                                 |
| [O Ida]  [O Volta]  [O Ida e Volta]              |
+--------------------------------------------------+
```

**Comportamento do atalho "Ida e Volta":**
1. Criar duas viagens simultaneamente
2. Mesmos dados (veiculo, motorista, ajudante)
3. Ida: horario obrigatorio
4. Volta: horario opcional (pode ser "A definir")
5. Vincular as duas viagens (paired_trip_id)
6. Apos criar, oferecer acao "Copiar embarques da Ida para a Volta"

### 3.2 Campo de Horario Condicional

Para viagem de IDA:
- Campo de horario obrigatorio
- Label: "Horario Base *"

Para viagem de VOLTA:
- Campo de horario opcional com checkbox
- Checkbox: "Horario a definir"
- Se marcado, campo de horario desabilitado e valor NULL

```text
+--------------------------------------------------+
| Horario Base                                     |
| [X] Horario a definir                            |
| [08:00]  <-- desabilitado se checkbox marcado    |
|                                                  |
| Nota: O horario sera definido posteriormente     |
+--------------------------------------------------+
```

### 3.3 Formulario Completo

```text
+--------------------------------------------------+
| Adicionar Viagem                           [X]   |
+--------------------------------------------------+
| Tipo da Viagem *                                 |
| [O Ida]  [O Volta]  [O Ida e Volta]              |
|                                                  |
| Veiculo *                 Capacidade             |
| [Select v]                [49] (auto)            |
|                                                  |
| Motorista *               Ajudante               |
| [Select v]                [Select v]             |
|                                                  |
| --- Se IDA ou IDA E VOLTA: ---                   |
| Horario da Ida *                                 |
| [19:00]                                          |
|                                                  |
| --- Se VOLTA ou IDA E VOLTA: ---                 |
| Horario da Volta                                 |
| [X] A definir  OU  [__:__]                       |
+--------------------------------------------------+
| [Cancelar]                        [Adicionar]    |
+--------------------------------------------------+
```

---

## Parte 4: Aba Viagens - Exibicao Melhorada

### 4.1 Card de Viagem com Informacao Completa

```text
+----------------------------------------------------------+
| [ IDA ]  19:00  Onibus ABC-1D23  49 lug.            [X]  |
|          Motorista: Joao  |  Ajudante: Pedro             |
|          [Par: Volta #2]                                  |
+----------------------------------------------------------+
| [VOLTA]  A definir  Onibus ABC-1D23  49 lug.        [X]  |
|          Motorista: Joao  |  Ajudante: Pedro             |
|          [Par: Ida #1]                                    |
+----------------------------------------------------------+
```

### 4.2 Indicador Visual de Horario "A Definir"

- Fundo amarelo claro
- Texto "A definir" em vez do horario
- Icone de alerta sutil
- Tooltip explicativo

---

## Parte 5: Aba Embarques - Logica por Viagem

### 5.1 Seletor de Viagem no Topo

```text
+----------------------------------------------------------+
| Viagem Selecionada:                                       |
| [Select: Ida - 19:00 - Onibus ABC-1D23 - 49 lug. - Joao v]|
+----------------------------------------------------------+
```

**Label completo e inequivoco:**
- Tipo (Ida/Volta)
- Horario (ou "A definir")
- Tipo + Placa do veiculo
- Capacidade
- Nome do motorista

Exemplo: `Ida - 19:00 - Onibus ABC-1D23 - 49 lug. - Motorista: Joao`
Exemplo: `Volta - A definir - Onibus ABC-1D23 - 49 lug. - Motorista: Joao`

### 5.2 Listagem de Embarques com Ordem

```text
+----------------------------------------------------------+
| Embarques da viagem selecionada                          |
+----------------------------------------------------------+
| 1. [MapPin] Terminal Rodoviario                          |
|    Rua das Palmeiras, 100 - Centro                       |
|    Horario: 18:30                                    [X]  |
|                                                          |
| 2. [MapPin] Posto Shell BR-101                           |
|    Rod. BR-101, KM 45                                    |
|    Horario: 18:45                                    [X]  |
|                                                          |
| 3. [MapPin] Shopping Center                              |
|    Av. Central, 500                                      |
|    Horario: 19:00                                    [X]  |
+----------------------------------------------------------+
| [+ Adicionar Local]    [Copiar da Ida]                   |
+----------------------------------------------------------+
```

### 5.3 Botao "Copiar da Ida" (apenas para Volta)

Disponivel apenas quando:
- Viagem selecionada e do tipo "volta"
- Existe viagem "ida" com embarques cadastrados

Comportamento:
1. Copia todos os embarques da ida vinculada (ou primeira ida)
2. Abre modal de confirmacao
3. Oferece opcao de inverter ordem
4. Horarios ficam editaveis apos copia

```text
+--------------------------------------------------+
| Copiar Embarques da Ida                    [X]   |
+--------------------------------------------------+
| Serao copiados 3 locais de embarque da Ida.      |
|                                                  |
| [X] Inverter ordem das paradas                   |
|     (Recomendado para viagem de volta)           |
|                                                  |
| Nota: Os horarios serao mantidos e voce podera   |
| ajusta-los depois.                               |
+--------------------------------------------------+
| [Cancelar]                        [Copiar]       |
+--------------------------------------------------+
```

### 5.4 Modal de Adicionar Embarque

```text
+--------------------------------------------------+
| Adicionar Local de Embarque                [X]   |
+--------------------------------------------------+
| Viagem: Ida - 19:00 - Onibus ABC-1D23            |
| (travado - ja selecionado)                       |
|                                                  |
| Local *                                          |
| [Select: Terminal Rodoviario v]                  |
|                                                  |
| Horario do Embarque *                            |
| [18:30]                                          |
|                                                  |
| Ordem da Parada                                  |
| [3] (proximo automatico)                         |
+--------------------------------------------------+
| [Cancelar]                        [Adicionar]    |
+--------------------------------------------------+
```

---

## Parte 6: Regras de Validacao Atualizadas

### 6.1 Publicacao (status = 'a_venda')

Checklist atualizado:
- Nome e data definidos
- Pelo menos 1 viagem cadastrada
- **CADA viagem deve ter pelo menos 1 embarque**
- Preco da passagem definido

A Volta pode ter horario "A definir", mas isso e visivel para o cliente.

### 6.2 Nova Verificacao no Checklist

```typescript
const publishChecklist = useMemo(() => {
  const hasName = form.name.trim() !== '';
  const hasDate = form.date !== '';
  const hasCity = form.city.trim() !== '';
  const hasTrips = eventTrips.length > 0;
  const hasPrice = parseFloat(form.unit_price || '0') > 0;
  
  // NOVA validacao: cada viagem tem embarque
  const tripsWithoutBoardings = eventTrips.filter(trip => {
    const tripBoardings = eventBoardingLocations.filter(
      ebl => ebl.trip_id === trip.id
    );
    return tripBoardings.length === 0;
  });
  const allTripsHaveBoardings = tripsWithoutBoardings.length === 0;

  return {
    valid: hasName && hasDate && hasCity && hasTrips && allTripsHaveBoardings && hasPrice,
    checks: {
      hasName,
      hasDate,
      hasCity,
      hasTrips,
      allTripsHaveBoardings,
      hasPrice,
      tripsWithoutBoardings, // Para exibir quais viagens faltam embarque
    },
  };
}, [form, eventTrips, eventBoardingLocations]);
```

---

## Parte 7: Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| Migracao SQL | Tornar departure_time nullable, adicionar paired_trip_id, adicionar stop_order |
| `src/types/database.ts` | Atualizar interfaces Trip e EventBoardingLocation |
| `src/pages/admin/Events.tsx` | Refatorar modal de viagem, aba embarques, e validacoes |

---

## Parte 8: Estados e Interfaces Novas

```typescript
// Form de viagem expandido
const [tripForm, setTripForm] = useState({
  trip_creation_type: 'ida' as 'ida' | 'volta' | 'ida_volta',
  vehicle_id: '',
  driver_id: '',
  assistant_driver_id: '',
  ida_departure_time: '',
  volta_departure_time: '',
  volta_time_tbd: false, // "A definir"
  capacity: '',
});

// Viagem selecionada para embarques
const [selectedTripIdForBoardings, setSelectedTripIdForBoardings] = useState<string | null>(null);

// Dialog de copiar embarques
const [copyBoardingsDialogOpen, setCopyBoardingsDialogOpen] = useState(false);
const [invertBoardingsOrder, setInvertBoardingsOrder] = useState(true);
```

---

## Parte 9: Funcao de Copiar Embarques

```typescript
const handleCopyBoardingsFromIda = async () => {
  if (!selectedTripIdForBoardings) return;
  
  // Encontrar viagem de ida (par ou primeira ida)
  const selectedTrip = eventTrips.find(t => t.id === selectedTripIdForBoardings);
  let idaTrip = selectedTrip?.paired_trip_id 
    ? eventTrips.find(t => t.id === selectedTrip.paired_trip_id)
    : eventTrips.find(t => t.trip_type === 'ida');
  
  if (!idaTrip) {
    toast.error('Nenhuma viagem de ida encontrada');
    return;
  }
  
  // Buscar embarques da ida
  const idaBoardings = eventBoardingLocations.filter(
    ebl => ebl.trip_id === idaTrip.id
  ).sort((a, b) => a.stop_order - b.stop_order);
  
  if (idaBoardings.length === 0) {
    toast.error('A viagem de ida nao possui embarques');
    return;
  }
  
  // Preparar novos embarques (inverter ordem se solicitado)
  const newBoardings = idaBoardings.map((ebl, index) => ({
    event_id: editingId,
    boarding_location_id: ebl.boarding_location_id,
    trip_id: selectedTripIdForBoardings,
    departure_time: ebl.departure_time, // Manter horario para edicao posterior
    stop_order: invertBoardingsOrder 
      ? idaBoardings.length - index 
      : index + 1,
    company_id: activeCompanyId,
  }));
  
  // Inserir
  const { error } = await supabase
    .from('event_boarding_locations')
    .insert(newBoardings);
  
  if (error) {
    toast.error('Erro ao copiar embarques');
  } else {
    toast.success(`${newBoardings.length} embarques copiados`);
    setCopyBoardingsDialogOpen(false);
    fetchEventBoardingLocations(editingId!);
  }
};
```

---

## Parte 10: Label Completo para Viagem

```typescript
const getTripLabel = (trip: TripWithDetails) => {
  const type = trip.trip_type === 'ida' ? 'Ida' : 'Volta';
  const time = trip.departure_time 
    ? trip.departure_time.slice(0, 5) 
    : 'A definir';
  const vehicleType = trip.vehicle 
    ? vehicleTypeLabels[trip.vehicle.type] 
    : 'Veiculo';
  const plate = trip.vehicle?.plate ?? '???';
  const capacity = trip.capacity;
  const driver = trip.driver?.name ?? 'Motorista nao definido';
  
  return `${type} - ${time} - ${vehicleType} ${plate} - ${capacity} lug. - ${driver}`;
};

// Exemplo de saida:
// "Ida - 19:00 - Onibus ABC-1D23 - 49 lug. - Joao"
// "Volta - A definir - Onibus ABC-1D23 - 49 lug. - Joao"
```

---

## Parte 11: Ordenacao de Queries

```typescript
// Embarques ordenados por stop_order
const { data, error } = await supabase
  .from('event_boarding_locations')
  .select(`
    *,
    boarding_location:boarding_locations(*),
    trip:trips(*)
  `)
  .eq('event_id', eventId)
  .order('stop_order', { ascending: true });
```

---

## Parte 12: Fora do Escopo

Conforme solicitado:
- PDF / Excel - nao implementar
- Pagamento real - nao implementar
- Mapa de assentos - nao implementar

---

## Ordem de Implementacao

1. Executar migracao SQL (departure_time nullable, paired_trip_id, stop_order)
2. Atualizar tipos TypeScript
3. Refatorar modal de adicionar viagem (tipo ida/volta/ida_volta, horario opcional)
4. Adicionar estado de viagem selecionada na aba Embarques
5. Implementar seletor de viagem com label completo
6. Filtrar embarques pela viagem selecionada
7. Adicionar campo stop_order no modal de embarque
8. Implementar funcao de copiar embarques com inversao
9. Atualizar checklist de publicacao
10. Testar fluxo completo

---

## Resultado Esperado

1. Criar evento com Ida (19:00) e Volta (A definir) em um clique
2. Cadastrar embarques na Ida com ordem
3. Copiar embarques para Volta com ordem invertida
4. Labels claros mesmo com multiplas viagens/veiculos
5. Fluxo intuitivo para eventos noturnos (shows, festas)
6. Validacao impede publicacao de viagem sem embarques

