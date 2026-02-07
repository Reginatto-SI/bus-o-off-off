
# Plano: Ajustes de UX, Consistência e Regras de Negócio na Tela de Evento

## Visão Geral

Este plano aborda 6 ajustes identificados na tela de criação/edição de Eventos, todos focados em melhorar a experiência do usuário e corrigir inconsistências de dados.

---

## Parte 1: Upload de Imagem/Banner do Evento

### Situação Atual
- O banco de dados NÃO possui campo `image_url` na tabela `events`
- Existe um placeholder visual na aba Geral mas não é funcional
- Texto atual: "(Funcionalidade em desenvolvimento)"

### Alterações Necessárias

#### 1.1 Migração SQL - Adicionar coluna image_url

```sql
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.events.image_url IS 'URL da imagem/banner do evento para exibição no mobile e portal público';
```

#### 1.2 Criar bucket no Supabase Storage

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS para permitir upload por admins e visualização pública
CREATE POLICY "Public can view event images"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-images');

CREATE POLICY "Admins can upload event images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'event-images' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Admins can delete event images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'event-images' 
  AND auth.role() = 'authenticated'
);
```

#### 1.3 Atualizar Types (src/types/database.ts)

```typescript
export interface Event {
  // ... existing fields
  image_url: string | null;  // NOVO
}
```

#### 1.4 Implementar componente de upload na aba Geral

```typescript
// Novo estado para upload
const [uploadingImage, setUploadingImage] = useState(false);

// Handler para upload de imagem
const handleImageUpload = async (file: File) => {
  if (!editingId || !file) return;
  
  setUploadingImage(true);
  const fileExt = file.name.split('.').pop();
  const fileName = `${editingId}-${Date.now()}.${fileExt}`;
  
  const { error: uploadError } = await supabase.storage
    .from('event-images')
    .upload(fileName, file);
    
  if (uploadError) {
    toast.error('Erro ao fazer upload da imagem');
    setUploadingImage(false);
    return;
  }
  
  const { data: { publicUrl } } = supabase.storage
    .from('event-images')
    .getPublicUrl(fileName);
    
  // Atualizar evento com URL
  await supabase
    .from('events')
    .update({ image_url: publicUrl })
    .eq('id', editingId);
    
  setForm({ ...form, image_url: publicUrl });
  toast.success('Imagem enviada com sucesso');
  setUploadingImage(false);
};
```

#### 1.5 UI do componente de upload

```text
+----------------------------------------------------------+
| [Preview da imagem se existir]                            |
|                                                           |
| OU                                                        |
|                                                           |
| +------------------------------------------------------+ |
| |         [ícone imagem]                               | |
| |  Arraste uma imagem ou clique para selecionar        | |
| |                                                       | |
| |  Imagem recomendada: formato horizontal (4:5)        | |
| |  Tamanho sugerido: 1080 x 1350 pixels               | |
| |  Exibida no aplicativo mobile e portal público       | |
| +------------------------------------------------------+ |
+----------------------------------------------------------+
```

---

## Parte 2: Corrigir Conceito de "Viagens" para "Frotas/Transportes"

### Problema
- Usuário vê "Viagens: 2" quando existe apenas 1 veículo fazendo ida + volta
- Ida e Volta são trechos internos, não devem contar como viagens separadas para o usuário

### Solução

#### 2.1 Criar função para contar veículos únicos (frotas)

```typescript
// Conta quantos veículos únicos estão sendo usados (não ida+volta separados)
const uniqueFleets = useMemo(() => {
  const uniqueVehicleIds = new Set(eventTrips.map(t => t.vehicle_id));
  return uniqueVehicleIds.size;
}, [eventTrips]);

// Capacidade correta: soma apenas uma vez por veículo
const correctTotalCapacity = useMemo(() => {
  const vehicleCapacities = new Map<string, number>();
  eventTrips.forEach(trip => {
    if (trip.vehicle_id && !vehicleCapacities.has(trip.vehicle_id)) {
      vehicleCapacities.set(trip.vehicle_id, trip.capacity || 0);
    }
  });
  return Array.from(vehicleCapacities.values()).reduce((sum, cap) => sum + cap, 0);
}, [eventTrips]);
```

#### 2.2 Atualizar aba "Viagens" no TabsList

```typescript
// ANTES (linha 1124)
{editingId && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{eventTrips.length}</span>}

// DEPOIS - renomear aba e mostrar frotas
<TabsTrigger value="viagens" ...>
  <Bus className="h-4 w-4 shrink-0" />
  <span className="min-w-0 truncate">Frotas</span>
  {editingId && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{uniqueFleets}</span>}
</TabsTrigger>
```

#### 2.3 Atualizar card "Resumo do Evento"

```typescript
// ANTES (linhas 1627-1639)
<div>
  <p className="text-muted-foreground">Viagens</p>
  <p className="font-medium">{eventTrips.length}</p>
</div>
<div>
  <p className="text-muted-foreground">Capacidade Total</p>
  <p className="font-medium">{totalCapacity} lugares</p>
</div>

// DEPOIS
<div>
  <p className="text-muted-foreground">Transportes</p>
  <p className="font-medium">{uniqueFleets}</p>
</div>
<div>
  <p className="text-muted-foreground">Capacidade Total</p>
  <p className="font-medium">{correctTotalCapacity} lugares</p>
</div>
```

---

## Parte 3: Padronizar TODOS os Dropdowns de Viagem (Sem Horário)

### Problema
O seletor "Viagem Selecionada" na aba Embarques ainda usa `getTripLabel(trip)` que inclui horário.

### Solução

#### 3.1 Atualizar seletor na aba Embarques (linhas 1378-1393)

```typescript
// ANTES
{eventTrips.map((trip) => (
  <SelectItem key={trip.id} value={trip.id}>
    {getTripLabel(trip)}  // Inclui horário
  </SelectItem>
))}

// DEPOIS
{eventTrips.map((trip) => (
  <SelectItem key={trip.id} value={trip.id}>
    {getTripLabelWithoutTime(trip)}  // Sem horário
  </SelectItem>
))}
```

#### 3.2 Verificar consistência
Todos os locais que listam viagens devem usar `getTripLabelWithoutTime()`:
- Seletor "Viagem Selecionada" ✓ (será corrigido)
- Modal "Adicionar/Editar Local de Embarque" ✓ (já usa)

---

## Parte 4: Ajustar Campo de Preço e Limite de Passagens

### 4.1 Formato moeda com 2 casas decimais

```typescript
// Handler para formatar preço ao perder foco
const handlePriceBlur = () => {
  if (form.unit_price) {
    const value = parseFloat(form.unit_price);
    if (!isNaN(value)) {
      setForm({ ...form, unit_price: value.toFixed(2) });
    }
  }
};

// Na UI do input
<Input
  id="unit_price"
  type="number"
  step="0.01"
  min="0"
  className="pl-10"
  value={form.unit_price}
  onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
  onBlur={handlePriceBlur}  // NOVO
  placeholder="0,00"
  disabled={isReadOnly}
/>
```

### 4.2 Limite de passagens com valor padrão 0

```typescript
// ANTES (linha 184)
max_tickets_per_purchase: '5',

// DEPOIS
max_tickets_per_purchase: '0',

// ANTES (linha 1575)
min="1"

// DEPOIS
min="0"

// Adicionar texto auxiliar
<div className="space-y-2">
  <Label htmlFor="max_tickets">Limite de Passagens por Compra</Label>
  <Input
    id="max_tickets"
    type="number"
    min="0"
    max="20"
    value={form.max_tickets_per_purchase}
    onChange={(e) => setForm({ ...form, max_tickets_per_purchase: e.target.value })}
    disabled={isReadOnly}
  />
  <p className="text-xs text-muted-foreground">
    Use 0 para permitir compras sem limite por pedido
  </p>
</div>
```

---

## Parte 5: Corrigir Resumo do Evento

Já coberto na Parte 2 com os valores corretos de `uniqueFleets` e `correctTotalCapacity`.

---

## Parte 6: Corrigir Checklist de Publicação

### Problema Atual
O checklist atual (linhas 197-205) exige que TODAS as viagens tenham embarques:

```typescript
const allTripsHaveBoardings = tripsWithoutBoardings.length === 0;
const hasBoardingLocations = eventBoardingLocations.length > 0 && allTripsHaveBoardings;
```

### Solução - Exigir apenas IDA com embarque

```typescript
// NOVA lógica: pelo menos uma viagem de IDA deve ter embarque
const hasIdaWithBoarding = eventTrips.some(trip => 
  trip.trip_type === 'ida' && 
  eventBoardingLocations.some(ebl => ebl.trip_id === trip.id)
);

// Se não houver viagens de ida, aceitar qualquer embarque
const hasBoardingForPublish = eventTrips.some(t => t.trip_type === 'ida')
  ? hasIdaWithBoarding
  : eventBoardingLocations.length > 0;

return {
  valid: hasName && hasDate && hasCity && hasTrips && hasBoardingForPublish && hasPrice,
  checks: {
    hasName,
    hasDate,
    hasCity,
    hasTrips,
    hasBoardingLocations: hasBoardingForPublish,  // Renomear para clareza
    hasPrice,
  },
};
```

### Atualizar texto do checklist

```typescript
// ANTES
<span>Pelo menos 1 local de embarque</span>

// DEPOIS
<span>Pelo menos 1 local de embarque na Ida</span>
```

---

## Resumo das Alterações

| Item | Arquivo | Tipo de Alteração |
|------|---------|-------------------|
| 1.1 | Migração SQL | Adicionar `image_url` na tabela `events` |
| 1.2 | Migração SQL | Criar bucket `event-images` no Storage |
| 1.3 | `src/types/database.ts` | Adicionar `image_url` na interface |
| 1.4-1.5 | `src/pages/admin/Events.tsx` | Implementar upload de imagem |
| 2.1-2.3 | `src/pages/admin/Events.tsx` | Criar `uniqueFleets`, atualizar contadores |
| 3.1 | `src/pages/admin/Events.tsx` | Usar `getTripLabelWithoutTime` no seletor |
| 4.1-4.2 | `src/pages/admin/Events.tsx` | Formatar preço, ajustar limite para min=0 |
| 6 | `src/pages/admin/Events.tsx` | Corrigir checklist para exigir apenas Ida |

---

## Ordem de Implementação

1. Migração SQL (image_url + bucket)
2. Atualizar tipos TypeScript
3. Implementar upload de imagem
4. Criar helpers `uniqueFleets` e `correctTotalCapacity`
5. Atualizar tab "Viagens" para "Frotas"
6. Atualizar card Resumo com valores corretos
7. Padronizar dropdown na aba Embarques
8. Ajustar campo de preço e limite
9. Corrigir lógica do checklist de publicação

---

## Critérios de Sucesso

1. Usuário consegue fazer upload de imagem com orientação clara
2. Tab e resumo mostram "Frotas/Transportes" em vez de "Viagens"
3. Capacidade total reflete apenas 1x por veículo (não duplica ida+volta)
4. Todos os dropdowns de viagem usam padrão sem horário
5. Preço sempre formatado com 2 casas decimais
6. Limite 0 funciona como ilimitado com texto explicativo
7. Evento pode ser publicado tendo apenas embarque na Ida
