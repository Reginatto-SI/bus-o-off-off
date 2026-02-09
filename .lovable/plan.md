
# Plano: Refatoracao do Fluxo de Compra - Etapa 1 (Escolha de Transporte e Embarque)

## Analise da Situacao Atual

### Problemas Identificados (conforme imagem de referencia)

1. **Terminologia confusa**: "Horario da Viagem" nao faz sentido para o passageiro
2. **Dropdowns genericos**: Uso de Select padrao em vez de cards clicaveis
3. **Hierarquia invertida**: O usuario escolhe primeiro o horario, nao o veiculo
4. **Quantidade basica**: Apenas input numerico sem botoes +/-
5. **CTA generico**: "Continuar" em vez de "Escolher assentos"
6. **Informacoes ausentes**: Nao mostra capacidade total do veiculo
7. **Descricao desnecessaria**: Exibe descricao longa do evento nesta etapa

### Estrutura de Dados Atual

```text
Event
  └── Trip (veiculo + motorista + horario base)
        └── EventBoardingLocation (local + horario especifico)
```

- Um evento pode ter multiplos veiculos (trips)
- Cada trip esta vinculada a um veiculo com tipo e capacidade
- Os locais de embarque estao vinculados a trip_id (por veiculo)
- Cada local de embarque tem seu proprio horario de saida

---

## Arquitetura de Componentes Reutilizaveis

Criar componentes em `src/components/public/` para reuso:

| Componente | Descricao |
|------------|-----------|
| `VehicleCard.tsx` | Card de selecao de veiculo |
| `BoardingLocationCard.tsx` | Card de selecao de embarque |
| `QuantitySelector.tsx` | Seletor de quantidade com +/- |
| `EventSummaryCard.tsx` | Card resumo do evento (topo) |

---

## Novo Fluxo de Selecao

```text
1. Exibir card de contexto do evento (nome, data, cidade)
   ↓
2. Escolher veiculo (cards clicaveis)
   - Tipo (Onibus, Van, Micro-onibus)
   - Vagas disponiveis / Capacidade total
   - Auto-selecionar se houver apenas 1 veiculo
   ↓
3. Escolher local de embarque (aparece apos selecionar veiculo)
   - Nome do local
   - Endereco/referencia
   - Horario de saida
   - Cidade/UF do embarque
   ↓
4. Escolher quantidade (aparece apos selecionar embarque)
   - Botoes +/- grandes
   - Limite automatico por vagas disponiveis
   ↓
5. CTA: "Escolher assentos" (habilitado quando tudo selecionado)
```

---

## Detalhamento Tecnico

### 1. Criar Componente VehicleCard

Arquivo: `src/components/public/VehicleCard.tsx`

```typescript
interface VehicleCardProps {
  trip: Trip;
  availableSeats: number;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}
```

Visual:
```text
+--------------------------------------------+
| [Icone Onibus]                             |
|                                            |
| Onibus                                     |
| 45 lugares                                 |
|                                            |
| [Badge] 32 vagas disponiveis               |
+--------------------------------------------+
```

Regras:
- Borda destacada quando selecionado (`ring-2 ring-primary`)
- Desabilitado se 0 vagas disponiveis
- Icone diferente por tipo (Bus, Car, Truck)
- Card inteiro clicavel

### 2. Criar Componente BoardingLocationCard

Arquivo: `src/components/public/BoardingLocationCard.tsx`

```typescript
interface BoardingLocationCardProps {
  location: EventBoardingLocation;
  isSelected: boolean;
  onSelect: () => void;
}
```

Visual:
```text
+--------------------------------------------+
| [Radio] Shoping China                      |
|         Av. Minas Gerais, 316              |
|         Patos de Minas - MG                |
|                                            |
|         [Relogio] Saida as 19:50           |
+--------------------------------------------+
```

Regras:
- Radio grande e visivel
- Horario em destaque
- Endereco como texto secundario
- Cidade/UF do local de embarque

### 3. Criar Componente QuantitySelector

Arquivo: `src/components/public/QuantitySelector.tsx`

```typescript
interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  disabled?: boolean;
}
```

Visual:
```text
+--------------------------------------------+
| [ - ]       2 passagens       [ + ]        |
+--------------------------------------------+
| Maximo de 15 passagens disponiveis         |
+--------------------------------------------+
```

Regras:
- Botoes grandes (min 44px) para touch
- Texto centralizado com quantidade
- Desabilitar - se min, desabilitar + se max
- Nunca permitir valor acima de vagas disponiveis
- Nunca permitir valor acima de max_tickets_per_purchase do evento

### 4. Criar Componente EventSummaryCard

Arquivo: `src/components/public/EventSummaryCard.tsx`

```typescript
interface EventSummaryCardProps {
  event: Event;
  compact?: boolean;
}
```

Visual:
```text
+--------------------------------------------+
| [Faixa laranja]                            |
| Evento de Teste 001                        |
| [Calendario] quinta-feira, 19 de fevereiro |
| [MapPin] Sorriso - MT                      |
+--------------------------------------------+
```

Regras:
- SEM descricao nesta tela
- Compacto e focado
- Faixa colorida no topo (primary)

### 5. Refatorar PublicEventDetail.tsx

Estrutura final:

```typescript
<PublicLayout>
  <div className="max-w-lg mx-auto px-4 py-6">
    {/* Botao Voltar */}
    <Button variant="ghost" onClick={() => navigate(-1)}>
      <ArrowLeft /> Voltar
    </Button>

    {/* Card de Contexto */}
    <EventSummaryCard event={event} compact />

    {/* Secao: Escolha do Veiculo */}
    <section className="mt-6 space-y-3">
      <h2 className="text-lg font-semibold">Escolha o veiculo disponivel</h2>
      <div className="space-y-3">
        {trips.map(trip => (
          <VehicleCard
            key={trip.id}
            trip={trip}
            availableSeats={availableSeatsMap[trip.id]}
            isSelected={selectedTrip === trip.id}
            onSelect={() => handleSelectTrip(trip.id)}
          />
        ))}
      </div>
    </section>

    {/* Secao: Local de Embarque (condicional) */}
    {selectedTrip && (
      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold">Escolha onde e quando embarcar</h2>
        <div className="space-y-3">
          {filteredLocations.map(loc => (
            <BoardingLocationCard
              key={loc.id}
              location={loc}
              isSelected={selectedLocation === loc.boarding_location_id}
              onSelect={() => setSelectedLocation(loc.boarding_location_id)}
            />
          ))}
        </div>
      </section>
    )}

    {/* Secao: Quantidade (condicional) */}
    {selectedTrip && selectedLocation && (
      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-semibold">Quantas passagens?</h2>
        <QuantitySelector
          value={quantity}
          onChange={setQuantity}
          min={1}
          max={Math.min(availableSeats, event.max_tickets_per_purchase)}
        />
      </section>
    )}

    {/* CTA Principal */}
    <div className="mt-8">
      <Button
        className="w-full h-14 text-lg font-medium"
        disabled={!selectedTrip || !selectedLocation || quantity < 1}
        onClick={handleContinue}
      >
        Escolher assentos
      </Button>
    </div>
  </div>
</PublicLayout>
```

---

## Query Atualizada

A query atual ja carrega trips com veiculo. Precisamos:

1. Buscar vagas disponiveis para TODOS os veiculos de uma vez
2. Filtrar locais de embarque pelo trip_id selecionado

```typescript
// Buscar vagas disponiveis para todas as trips
const fetchAvailableSeats = async (tripIds: string[]) => {
  const results: Record<string, number> = {};
  
  await Promise.all(
    tripIds.map(async (tripId) => {
      const { data } = await supabase.rpc('get_trip_available_capacity', {
        trip_uuid: tripId,
      });
      results[tripId] = data ?? 0;
    })
  );
  
  return results;
};
```

---

## Icones por Tipo de Veiculo

```typescript
const vehicleIcons: Record<VehicleType, LucideIcon> = {
  onibus: Bus,
  micro_onibus: Bus, // ou Truck
  van: Car,
};
```

---

## Estados da Interface

### Loading
- Skeleton para cards de veiculo
- Spinner para busca de vagas

### Sem Veiculos/Embarques
```typescript
<EmptyState
  icon={<Bus />}
  title="Transporte nao disponivel"
  description="Os transportes para este evento ainda nao foram configurados"
/>
```

### Veiculo Esgotado
- Card visivel mas desabilitado
- Badge "Esgotado" no canto

---

## Arquivos a Criar/Modificar

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `src/components/public/VehicleCard.tsx` | Novo | Card de selecao de veiculo |
| `src/components/public/BoardingLocationCard.tsx` | Novo | Card de selecao de embarque |
| `src/components/public/QuantitySelector.tsx` | Novo | Seletor de quantidade +/- |
| `src/components/public/EventSummaryCard.tsx` | Novo | Card resumo do evento |
| `src/components/public/index.ts` | Editar | Adicionar exports |
| `src/pages/public/PublicEventDetail.tsx` | Editar | Refatorar completamente |

---

## Estilos Mobile-First

### Layout
- `max-w-lg` (512px max) para foco
- `px-4` padding horizontal
- `py-6` padding vertical
- `space-y-3` entre cards

### Cards de Selecao
- Padding: `p-4`
- Arredondamento: `rounded-xl`
- Sombra: `shadow-sm`
- Selecionado: `ring-2 ring-primary bg-primary/5`
- Hover: `hover:bg-muted/50`
- Area clicavel: card inteiro
- Cursor: `cursor-pointer`

### Botao CTA
- Altura: `h-14` (56px)
- Fonte: `text-lg font-medium`
- Largura: `w-full`
- Fixo no final da tela? (opcional, mobile)

### Tipografia
- Titulo de secao: `text-lg font-semibold`
- Nome do veiculo: `font-medium`
- Vagas: `text-sm text-muted-foreground`
- Horario: `font-semibold text-primary`

---

## Validacoes

1. Quantidade nao pode exceder vagas disponiveis
2. Quantidade nao pode exceder `max_tickets_per_purchase` do evento
3. Nao permitir avancar sem veiculo selecionado
4. Nao permitir avancar sem local de embarque
5. Revalidar vagas ao clicar em "Escolher assentos"

---

## Criterios de Sucesso

1. Usuario entende que esta escolhendo um veiculo (nao uma "viagem")
2. Locais de embarque aparecem APOS selecionar veiculo
3. Horario de saida esta vinculado ao local, nao ao veiculo
4. Quantidade limitada automaticamente por vagas
5. CTA claro: "Escolher assentos"
6. Layout mobile-first com cards grandes e clicaveis
7. Componentes reutilizaveis para outras telas
8. Nao parece formulario administrativo
