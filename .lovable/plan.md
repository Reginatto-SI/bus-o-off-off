

# Plano: Completar Popup de Evento com Todas as Abas Operacionais

## Visao Geral

O popup de evento sera transformado de um cadastro simples para um **HUB operacional completo**, permitindo configurar em um unico lugar: dados basicos, viagens, embarques, regras de venda e publicacao.

---

## Parte 1: Alteracoes no Banco de Dados

### 1.1 Adicionar Campos na Tabela `trips`

Para suportar tipo de viagem e ajudante:

```sql
-- Adicionar tipo de viagem (ida/volta)
ALTER TABLE public.trips 
  ADD COLUMN IF NOT EXISTS trip_type text NOT NULL DEFAULT 'ida';

-- Adicionar ajudante (opcional)
ALTER TABLE public.trips 
  ADD COLUMN IF NOT EXISTS assistant_driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.trips.trip_type IS 'Tipo da viagem: ida ou volta';
COMMENT ON COLUMN public.trips.assistant_driver_id IS 'Ajudante/copiloto da viagem (opcional)';
```

### 1.2 Adicionar Campos na Tabela `event_boarding_locations`

Para suportar horario de embarque e vinculo com viagem:

```sql
-- Adicionar horario de embarque por local
ALTER TABLE public.event_boarding_locations 
  ADD COLUMN IF NOT EXISTS departure_time time;

-- Adicionar vinculo com viagem especifica (opcional - local pode ser global do evento)
ALTER TABLE public.event_boarding_locations 
  ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.event_boarding_locations.departure_time IS 'Horario de embarque neste local';
COMMENT ON COLUMN public.event_boarding_locations.trip_id IS 'Viagem especifica (null = disponivel para todas)';
```

### 1.3 Adicionar Campos de Configuracao de Venda na Tabela `events`

Para centralizar configuracoes de venda no evento:

```sql
-- Preco padrao da passagem
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0.00;

-- Limite de passagens por compra
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS max_tickets_per_purchase integer NOT NULL DEFAULT 5;

-- Permitir venda online
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS allow_online_sale boolean NOT NULL DEFAULT true;

-- Permitir venda por vendedor
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS allow_seller_sale boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.events.unit_price IS 'Preco padrao da passagem';
COMMENT ON COLUMN public.events.max_tickets_per_purchase IS 'Limite de passagens por compra';
COMMENT ON COLUMN public.events.allow_online_sale IS 'Permitir venda pelo portal publico';
COMMENT ON COLUMN public.events.allow_seller_sale IS 'Permitir venda por vendedores';
```

---

## Parte 2: Atualizacao de Tipos TypeScript

### Arquivo: src/types/database.ts

```typescript
// Adicionar tipo de viagem
export type TripType = 'ida' | 'volta';

// Atualizar interface Trip
export interface Trip {
  id: string;
  event_id: string;
  vehicle_id: string;
  driver_id: string;
  assistant_driver_id: string | null;  // NOVO
  trip_type: TripType;                  // NOVO
  departure_time: string;
  capacity: number;
  created_at: string;
  updated_at: string;
  vehicle?: Vehicle;
  driver?: Driver;
  assistant_driver?: Driver;           // NOVO
}

// Atualizar interface EventBoardingLocation
export interface EventBoardingLocation {
  id: string;
  event_id: string;
  boarding_location_id: string;
  trip_id: string | null;              // NOVO
  departure_time: string | null;       // NOVO
  company_id: string;
  boarding_location?: BoardingLocation;
  trip?: Trip;                         // NOVO
}

// Atualizar interface Event
export interface Event {
  id: string;
  name: string;
  date: string;
  city: string;
  description: string | null;
  status: EventStatus;
  unit_price: number;                  // NOVO
  max_tickets_per_purchase: number;    // NOVO
  allow_online_sale: boolean;          // NOVO
  allow_seller_sale: boolean;          // NOVO
  company_id: string;
  created_at: string;
  updated_at: string;
}
```

---

## Parte 3: Estrutura do Modal com 5 Abas

### Visao Geral das Abas

```text
+------------------------------------------------------------------+
| Novo Evento / Editar Evento                                [X]   |
+------------------------------------------------------------------+
| [Geral] [Viagens] [Embarques] [Passagens] [Publicacao]           |
+------------------------------------------------------------------+
| [Conteudo da aba ativa]                                          |
+------------------------------------------------------------------+
| [Cancelar]                                           [Salvar]    |
+------------------------------------------------------------------+
```

---

## Parte 4: Aba 1 - Geral (MANTER/MELHORAR)

### Campos Existentes (manter)

| Campo | Tipo | Obrigatorio |
|-------|------|-------------|
| Nome do evento | text | Sim |
| Data | date | Sim |
| Cidade | text | Sim |
| Descricao | textarea | Nao |

### Melhoria Visual

Adicionar area para banner/imagem (estrutura preparada para futuro):

```text
+--------------------------------------------------+
| [Icone Image]                                    |
| Arraste uma imagem ou clique para selecionar     |
| (Funcionalidade em desenvolvimento)              |
+--------------------------------------------------+
```

---

## Parte 5: Aba 2 - Viagens (MELHORAR)

### Campos por Viagem (atualizados)

| Campo | Tipo | Obrigatorio |
|-------|------|-------------|
| Tipo | select (ida/volta) | Sim |
| Veiculo | select | Sim |
| Motorista | select | Sim |
| Ajudante | select | Nao |
| Horario de Saida | time | Sim |
| Capacidade | number | Sim (auto-preenchido) |

### Interface Visual

```text
+--------------------------------------------------+
| Viagens do Evento                                |
+--------------------------------------------------+
| [ IDA ] 08:00  Onibus ABC-1234  46 lug.  [X]    |
|         Motorista: Joao  |  Ajudante: Pedro     |
|                                                  |
| [VOLTA] 22:00  Onibus ABC-1234  46 lug.  [X]    |
|         Motorista: Joao  |  Ajudante: Pedro     |
+--------------------------------------------------+
| [+ Adicionar Viagem]                             |
+--------------------------------------------------+
```

### Modal de Adicionar Viagem (Atualizado)

```text
+--------------------------------------------------+
| Adicionar Viagem                           [X]   |
+--------------------------------------------------+
| Tipo da Viagem *                                 |
| [O Ida] [O Volta]                                |
|                                                  |
| Veiculo *                 Capacidade             |
| [Select v]                [46] (auto)            |
|                                                  |
| Motorista *               Ajudante               |
| [Select v]                [Select v]             |
|                                                  |
| Horario de Saida *                               |
| [08:00]                                          |
+--------------------------------------------------+
| [Cancelar]                        [Adicionar]    |
+--------------------------------------------------+
```

---

## Parte 6: Aba 3 - Embarques (NOVA)

### Funcionalidades

1. Listar locais de embarque vinculados ao evento
2. Adicionar local de embarque com horario
3. Vincular local a uma viagem especifica (opcional)
4. Remover local de embarque

### Interface Visual

```text
+--------------------------------------------------+
| Locais de Embarque do Evento                     |
+--------------------------------------------------+
| [Icone MapPin] Terminal Rodoviario               |
|    Rua das Palmeiras, 100 - Centro               |
|    Horario: 07:30  |  Viagem: Ida                |
|                                          [X]     |
|                                                  |
| [Icone MapPin] Posto Shell - BR 101              |
|    Rod. BR 101, KM 45                            |
|    Horario: 07:45  |  Viagem: Todas              |
|                                          [X]     |
+--------------------------------------------------+
| [+ Adicionar Local de Embarque]                  |
+--------------------------------------------------+
```

### Modal de Adicionar Local

```text
+--------------------------------------------------+
| Adicionar Local de Embarque                [X]   |
+--------------------------------------------------+
| Local *                                          |
| [Select: Selecione um local cadastrado v]        |
|                                                  |
| Horario de Embarque *                            |
| [07:30]                                          |
|                                                  |
| Vincular a Viagem                                |
| [Select: Todas as viagens v]                     |
| (Opcional - deixe em branco para todas)          |
+--------------------------------------------------+
| [Cancelar]                        [Adicionar]    |
+--------------------------------------------------+
```

### Estado Vazio

```text
+--------------------------------------------------+
| [Icone MapPin grande]                            |
| Nenhum local de embarque definido                |
| Adicione locais onde os passageiros embarcarao   |
| [+ Adicionar Local de Embarque]                  |
+--------------------------------------------------+
```

---

## Parte 7: Aba 4 - Passagens / Venda (NOVA)

### Campos de Configuracao

| Campo | Tipo | Obrigatorio | Padrao |
|-------|------|-------------|--------|
| Preco da Passagem | currency | Sim | R$ 0,00 |
| Limite por Compra | number | Sim | 5 |
| Venda Online | switch | Sim | Ativo |
| Venda por Vendedor | switch | Sim | Ativo |

### Interface Visual

```text
+--------------------------------------------------+
| Configuracoes de Venda                           |
+--------------------------------------------------+
| Preco da Passagem *                              |
| [R$ ___,__]                                      |
|                                                  |
| Limite de Passagens por Compra *                 |
| [5] passagens                                    |
|                                                  |
| Canais de Venda                                  |
| +----------------------------------------------+ |
| | [Switch ON]  Venda Online                    | |
| | Passagens disponiveis no portal publico      | |
| +----------------------------------------------+ |
| | [Switch ON]  Venda por Vendedor              | |
| | Vendedores podem vender via link exclusivo   | |
| +----------------------------------------------+ |
+--------------------------------------------------+

+--------------------------------------------------+
| Resumo do Evento                                 |
+--------------------------------------------------+
| Viagens cadastradas: 2                           |
| Capacidade total: 92 lugares                     |
| Locais de embarque: 3                            |
+--------------------------------------------------+
```

### Card Informativo

```text
+--------------------------------------------------+
| [Icone Info] Informacao                          |
+--------------------------------------------------+
| O pagamento sera processado no momento da        |
| compra. Neste MVP, o pagamento e simulado.       |
| A integracao com gateway sera implementada       |
| em versao futura.                                |
+--------------------------------------------------+
```

---

## Parte 8: Aba 5 - Publicacao (MANTER/MELHORAR)

### Estrutura Existente (manter)

- Select de status (Rascunho / A Venda / Encerrado)
- Card informativo sobre cada status

### Adicionar Validacao Visual

Antes de permitir "A Venda", exibir checklist:

```text
+--------------------------------------------------+
| Checklist para Publicacao                        |
+--------------------------------------------------+
| [Check verde] Nome e data definidos              |
| [Check verde] Pelo menos 1 viagem cadastrada     |
| [X vermelho] Pelo menos 1 local de embarque      |
| [Check verde] Preco da passagem definido         |
+--------------------------------------------------+
| Atencao: Corrija os itens pendentes antes de     |
| publicar o evento para venda.                    |
+--------------------------------------------------+
```

### Regra de Bloqueio

Se evento esta "encerrado", exibir mensagem e desabilitar edicao:

```text
+--------------------------------------------------+
| [Icone Lock] Evento Encerrado                    |
+--------------------------------------------------+
| Este evento foi encerrado e nao pode mais ser    |
| editado. Os dados estao disponiveis apenas       |
| para consulta.                                   |
+--------------------------------------------------+
```

---

## Parte 9: Estrutura de Estados

### Estados do Modal

```typescript
// Form principal do evento
const [form, setForm] = useState({
  name: '',
  date: '',
  city: '',
  description: '',
  status: 'rascunho',
  unit_price: '',           // NOVO
  max_tickets_per_purchase: '5', // NOVO
  allow_online_sale: true,  // NOVO
  allow_seller_sale: true,  // NOVO
});

// Viagens do evento (melhorado)
const [eventTrips, setEventTrips] = useState<TripWithDetails[]>([]);

// Locais de embarque do evento (NOVO)
const [eventBoardingLocations, setEventBoardingLocations] = useState<EventBoardingLocationWithDetails[]>([]);
const [boardingLocations, setBoardingLocations] = useState<BoardingLocation[]>([]);

// Forms de modais secundarios
const [tripForm, setTripForm] = useState({
  trip_type: 'ida',         // NOVO
  vehicle_id: '',
  driver_id: '',
  assistant_driver_id: '',  // NOVO
  departure_time: '',
  capacity: '',
});

const [boardingForm, setBoardingForm] = useState({
  boarding_location_id: '',
  departure_time: '',
  trip_id: '',  // opcional
});
```

---

## Parte 10: Logica de Carregamento

### Dados a Buscar ao Abrir Modal

```typescript
const fetchEventData = async (eventId: string) => {
  // 1. Viagens com detalhes
  const { data: trips } = await supabase
    .from('trips')
    .select(`
      *,
      vehicle:vehicles(*),
      driver:drivers!trips_driver_id_fkey(*),
      assistant_driver:drivers!trips_assistant_driver_id_fkey(*)
    `)
    .eq('event_id', eventId)
    .order('departure_time');

  // 2. Locais de embarque do evento
  const { data: boardingLocs } = await supabase
    .from('event_boarding_locations')
    .select(`
      *,
      boarding_location:boarding_locations(*),
      trip:trips(*)
    `)
    .eq('event_id', eventId)
    .order('departure_time');

  // 3. Todos os locais disponiveis (para select)
  const { data: allLocations } = await supabase
    .from('boarding_locations')
    .select('*')
    .eq('status', 'ativo')
    .order('name');
};
```

---

## Parte 11: Validacoes de UX

### Validacao para Publicar (status = 'a_venda')

```typescript
const canPublish = useMemo(() => {
  const hasName = form.name.trim() !== '';
  const hasDate = form.date !== '';
  const hasTrips = eventTrips.length > 0;
  const hasBoardingLocations = eventBoardingLocations.length > 0;
  const hasPrice = parseFloat(form.unit_price) > 0;

  return {
    valid: hasName && hasDate && hasTrips && hasBoardingLocations && hasPrice,
    checks: {
      hasName,
      hasDate,
      hasTrips,
      hasBoardingLocations,
      hasPrice,
    },
  };
}, [form, eventTrips, eventBoardingLocations]);
```

### Bloqueio de Edicao (evento encerrado)

```typescript
const isReadOnly = form.status === 'encerrado';

// Desabilitar todos os campos se encerrado
<Input disabled={isReadOnly} ... />
```

---

## Parte 12: Icones das Abas

| Aba | Icone |
|-----|-------|
| Geral | FileText |
| Viagens | Bus |
| Embarques | MapPin |
| Passagens | Ticket ou DollarSign |
| Publicacao | Globe |

---

## Parte 13: Arquivos a Modificar/Criar

| Arquivo | Acao |
|---------|------|
| Migracao SQL | Adicionar campos em trips, event_boarding_locations, events |
| `src/types/database.ts` | Atualizar interfaces Trip, EventBoardingLocation, Event |
| `src/pages/admin/Events.tsx` | Refatorar modal com 5 abas completas |

---

## Parte 14: Fora do Escopo (Nao Implementar)

Conforme solicitado:
- Pagamento real (apenas configuracao)
- PDF / Excel
- Relatorios
- Mapa detalhado de assentos

Estas funcionalidades ficam **estruturalmente preparadas** para implementacao futura.

---

## Ordem de Implementacao

1. Executar migracao SQL (campos novos)
2. Atualizar tipos TypeScript
3. Adicionar estados para boarding locations
4. Implementar aba Embarques (nova)
5. Implementar aba Passagens/Venda (nova)
6. Melhorar aba Viagens (tipo, ajudante)
7. Melhorar aba Publicacao (checklist)
8. Implementar validacoes de UX
9. Testar fluxo completo

---

## Resultado Esperado

1. Modal com 5 abas funcionais
2. Evento como HUB operacional completo
3. Viagens com tipo (ida/volta) e ajudante
4. Locais de embarque com horario configuravel
5. Configuracoes de venda centralizadas
6. Validacao visual antes de publicar
7. Bloqueio de edicao para eventos encerrados
8. UX profissional e coerente

Caso fique alguma parte do plano sem implementar, você precisa me avisar!
