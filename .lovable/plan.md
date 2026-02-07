
# Plano: Padronização de Imagem/Banner e Melhoria Visual da Tela /admin/eventos

## Visão Geral

Este plano padroniza o uso de imagem/banner de eventos com proporção 3:2 (600x400) e melhora a experiência visual dos cards na listagem, incluindo placeholder para eventos sem imagem.

---

## Parte 1: Atualizar Especificações de Imagem (aba Geral)

### Situação Atual
- Imagem configurada para 1080x1350 (proporção 4:5)
- Texto de ajuda menciona "formato vertical"

### Alterações

#### 1.1 Atualizar textos de orientação no upload

```typescript
// ANTES (linhas 1266-1272)
<p className="text-xs text-muted-foreground/70 mt-2">
  Imagem recomendada: formato vertical (4:5)
</p>
<p className="text-xs text-muted-foreground/70">
  Tamanho sugerido: 1080 x 1350 pixels
</p>

// DEPOIS
<p className="text-xs text-muted-foreground/70 mt-2">
  Imagem do Evento (600 × 400)
</p>
<p className="text-xs text-muted-foreground/70">
  Formato horizontal, proporção 3:2
</p>
```

#### 1.2 Ajustar área de upload para proporção 3:2

```typescript
// Adicionar aspect-ratio ao container
<label 
  className={`border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors aspect-[3/2] flex flex-col items-center justify-center ${...}`}
>
```

#### 1.3 Ajustar preview da imagem para 3:2

```typescript
// ANTES (linha 1174-1178)
<img 
  src={form.image_url} 
  alt="Banner do evento" 
  className="w-full max-h-64 object-cover rounded-lg border"
/>

// DEPOIS - usar aspect-ratio fixo
<div className="relative aspect-[3/2] w-full">
  <img 
    src={form.image_url} 
    alt="Banner do evento" 
    className="w-full h-full object-cover rounded-lg border"
  />
  {/* Botão remover permanece */}
</div>
```

---

## Parte 2: Criar Componente de Placeholder para Eventos Sem Imagem

### Novo Componente

Criar um placeholder visual consistente que será usado em:
- Cards da listagem /admin/eventos
- App mobile
- Portal público

```typescript
// Componente inline ou extraído
const EventImagePlaceholder = ({ eventName }: { eventName: string }) => (
  <div className="aspect-[3/2] w-full bg-gradient-to-br from-muted/50 to-muted rounded-t-lg flex items-center justify-center">
    <div className="text-center">
      <Calendar className="h-12 w-12 mx-auto text-muted-foreground/30" />
      <span className="text-2xl font-bold text-muted-foreground/20 mt-2 block">
        {eventName.charAt(0).toUpperCase()}
      </span>
    </div>
  </div>
);
```

### Características do Placeholder
- Proporção fixa 3:2 (600x400)
- Fundo com gradiente sutil (muted tones)
- Ícone de calendário centralizado
- Primeira letra do nome do evento (opcional, para diferenciação)
- Visualmente neutro e profissional

---

## Parte 3: Adicionar Imagem aos Cards da Listagem

### Situação Atual (linhas 1058-1093)
Cards mostram apenas texto, sem imagem no topo.

### Nova Estrutura do Card

```typescript
<Card key={event.id} className="card-corporate h-full overflow-hidden">
  {/* Imagem ou Placeholder */}
  {event.image_url ? (
    <div className="aspect-[3/2] w-full">
      <img 
        src={event.image_url} 
        alt={event.name}
        className="w-full h-full object-cover"
      />
    </div>
  ) : (
    <div className="aspect-[3/2] w-full bg-gradient-to-br from-muted/50 to-muted flex items-center justify-center">
      <div className="text-center">
        <Calendar className="h-10 w-10 mx-auto text-muted-foreground/30" />
        <span className="text-xl font-bold text-muted-foreground/20 mt-1 block">
          {event.name.charAt(0).toUpperCase()}
        </span>
      </div>
    </div>
  )}
  
  <CardContent className="p-4">
    {/* Conteúdo existente com ajustes */}
    <div className="flex items-start justify-between gap-2 mb-3">
      <h3 className="font-semibold text-foreground line-clamp-2">{event.name}</h3>
      <ActionsDropdown actions={getEventActions(event)} />
    </div>
    
    <div className="mb-3">
      <StatusBadge status={event.status} />
    </div>
    
    <div className="space-y-2 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 shrink-0" />
        <span>
          {format(new Date(event.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 shrink-0" />
        <span>{event.city}</span>
      </div>
    </div>
    
    {/* Transporte - CORRIGIDO */}
    <div className="mt-4 pt-3 border-t border-border flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Bus className="h-4 w-4" />
        <span>{getFleetCount(event)} transporte(s)</span>
      </div>
    </div>
  </CardContent>
</Card>
```

---

## Parte 4: Corrigir Contagem de Transportes (Frotas)

### Problema Atual
A função `getTripCount` retorna o número total de trips (ida + volta = 2).

### Solução

#### 4.1 Atualizar query para buscar vehicle_ids únicos

A query atual já retorna `trips(count)`, mas precisamos contar veículos únicos.

Opção 1: Ajustar a query para retornar dados que permitam calcular frotas:

```typescript
// Nova query com dados para calcular frotas
const { data, error } = await supabase
  .from('events')
  .select(`
    *,
    trips:trips(vehicle_id)
  `)
  .order('date', { ascending: false });
```

#### 4.2 Criar função para calcular frotas

```typescript
// Função que conta veículos únicos (frotas)
const getFleetCount = (event: EventWithTrips) => {
  if (!event.trips || !Array.isArray(event.trips)) return 0;
  const uniqueVehicles = new Set(
    event.trips
      .filter((t: any) => t.vehicle_id)
      .map((t: any) => t.vehicle_id)
  );
  return uniqueVehicles.size;
};
```

#### 4.3 Atualizar tipo EventWithTrips

```typescript
// ANTES
interface EventWithTrips extends Event {
  trips: { count: number }[];
}

// DEPOIS - trips agora retorna vehicle_id
interface EventWithTrips extends Event {
  trips: { vehicle_id: string }[];
}
```

#### 4.4 Atualizar exibição no card

```typescript
// ANTES (linha 1088)
<span>{getTripCount(event)} viagem(ns)</span>

// DEPOIS
<span>{getFleetCount(event)} transporte(s)</span>
```

---

## Parte 5: Garantir Consistência Mobile/Carrossel

### Aspectos Críticos

1. **Proporção fixa 3:2**: Todos os cards terão a mesma altura de imagem
2. **Placeholder consistente**: Eventos sem imagem ocupam o mesmo espaço
3. **Grid responsivo**: Cards se adaptam bem em diferentes tamanhos

### CSS Adicional (se necessário)

```css
/* Garantir que todos os cards tenham altura uniforme de imagem */
.event-card-image {
  aspect-ratio: 3/2;
  width: 100%;
  object-fit: cover;
}
```

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/admin/Events.tsx` | Atualizar textos de orientação de imagem (600x400, 3:2) |
| `src/pages/admin/Events.tsx` | Ajustar aspect-ratio da área de upload para 3:2 |
| `src/pages/admin/Events.tsx` | Ajustar preview da imagem para 3:2 |
| `src/pages/admin/Events.tsx` | Criar placeholder visual para eventos sem imagem |
| `src/pages/admin/Events.tsx` | Adicionar imagem/placeholder no topo dos cards |
| `src/pages/admin/Events.tsx` | Atualizar query para retornar vehicle_id nas trips |
| `src/pages/admin/Events.tsx` | Criar função getFleetCount para contar veículos únicos |
| `src/pages/admin/Events.tsx` | Substituir "X viagem(ns)" por "X transporte(s)" |
| `src/pages/admin/Events.tsx` | Atualizar interface EventWithTrips |

---

## Critérios de Sucesso

1. Upload de imagem funciona e orienta para 600x400 (3:2)
2. Preview mostra imagem em proporção 3:2 correta
3. Cards na listagem exibem imagem no topo
4. Eventos sem imagem usam placeholder visual padronizado (mesmo tamanho)
5. Todos os cards têm altura uniforme
6. Contador mostra "X transporte(s)" baseado em veículos únicos
7. Ida+volta do mesmo veículo conta como 1 transporte
8. Layout funciona bem em grid e em visualização mobile

---

## Fora do Escopo

- Ajuste de imagem no portal público (será feito separadamente)
- Resize/crop automático de imagem no upload
- Compressão de imagem
