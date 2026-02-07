

# Plano: Cidade do Evento vs Cidade do Embarque + Autocomplete

## Resumo da Situação Atual

### Problema Identificado
1. **Evento**: Campo `city` é input livre sem estrutura (ex: "Barretos - SP" digitado manualmente)
2. **Local de Embarque**: Tabela `boarding_locations` NÃO possui campos `city` e `state` - apenas `name`, `address`, `maps_url`, `notes`
3. **Confusão conceitual**: Cidade do evento (destino) não está separada da cidade do embarque (origem)
4. **UX inconsistente**: Não há autocomplete de cidade/UF em nenhum ponto do sistema

### Impacto
- Passageiros podem confundir a cidade do evento com a cidade onde vão embarcar
- Filtros futuros na página pública não funcionarão corretamente
- Dados inconsistentes (ex: "Barretos SP" vs "Barretos - SP" vs "barretos/SP")

---

## Alterações Necessárias

### Parte 1: Migração SQL — Adicionar city e state na tabela boarding_locations

```sql
ALTER TABLE public.boarding_locations 
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state character(2);

COMMENT ON COLUMN public.boarding_locations.city IS 'Cidade do local de embarque';
COMMENT ON COLUMN public.boarding_locations.state IS 'UF do local de embarque (2 caracteres)';
```

### Parte 2: Atualizar Types

**Arquivo**: `src/types/database.ts`

```typescript
export interface BoardingLocation {
  id: string;
  name: string;
  address: string;
  city: string | null;      // NOVO
  state: string | null;     // NOVO (UF - 2 chars)
  maps_url: string | null;
  notes: string | null;
  status: BoardingLocationStatus;
  company_id: string;
  created_at: string;
  updated_at: string;
}
```

### Parte 3: Criar Lista de Cidades Brasileiras

**Arquivo novo**: `src/data/brazilian-cities.ts`

Criar um arquivo com uma lista curada das principais cidades brasileiras para o autocomplete. A lista será organizada por estado e conterá as maiores cidades de cada UF (aproximadamente 500-1000 cidades mais relevantes).

Estrutura:
```typescript
export interface BrazilianCity {
  name: string;
  state: string;
  label: string; // "Nome — UF"
}

export const brazilianCities: BrazilianCity[] = [
  { name: 'Sorriso', state: 'MT', label: 'Sorriso — MT' },
  { name: 'Cuiabá', state: 'MT', label: 'Cuiabá — MT' },
  { name: 'Barretos', state: 'SP', label: 'Barretos — SP' },
  // ... etc
];
```

### Parte 4: Criar Componente de Autocomplete de Cidade

**Arquivo novo**: `src/components/ui/city-autocomplete.tsx`

Componente reutilizável baseado no Command/Combobox do shadcn que:
- Filtra cidades enquanto o usuário digita
- Mostra formato "Cidade — UF"
- Permite digitação livre caso a cidade não esteja na lista
- Salva city e state separadamente

```typescript
interface CityAutocompleteProps {
  value: { city: string; state: string };
  onChange: (value: { city: string; state: string }) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}
```

### Parte 5: Atualizar Formulário do Evento (aba Geral)

**Arquivo**: `src/pages/admin/Events.tsx`

Alterar o campo "Cidade" para "Cidade do Evento (Destino)" com autocomplete:

```typescript
// ANTES
<div className="space-y-2">
  <Label htmlFor="city">Cidade *</Label>
  <Input
    id="city"
    value={form.city}
    onChange={(e) => setForm({ ...form, city: e.target.value })}
    placeholder="Ex: Barretos - SP"
    required
    disabled={isReadOnly}
  />
</div>

// DEPOIS
<div className="space-y-2">
  <Label htmlFor="city">Cidade do Evento (Destino) *</Label>
  <CityAutocomplete
    value={{ city: getCityName(form.city), state: getStateFromCity(form.city) }}
    onChange={({ city, state }) => setForm({ ...form, city: `${city} — ${state}` })}
    placeholder="Ex: Barretos — SP"
    disabled={isReadOnly}
  />
  <p className="text-xs text-muted-foreground">
    Local onde o evento acontece (destino final da viagem)
  </p>
</div>
```

### Parte 6: Atualizar Cadastro de Local de Embarque

**Arquivo**: `src/pages/admin/BoardingLocations.tsx`

Adicionar campos Cidade e UF ao modal de criação/edição:

```typescript
// Novo estado do form
const [form, setForm] = useState({
  name: '',
  address: '',
  city: '',      // NOVO
  state: '',     // NOVO
  maps_url: '',
  notes: '',
});

// No modal, adicionar após campo de endereço:
<div className="grid gap-4 sm:grid-cols-2">
  <div className="space-y-2">
    <Label htmlFor="city">Cidade *</Label>
    <CityAutocomplete
      value={{ city: form.city, state: form.state }}
      onChange={({ city, state }) => setForm({ ...form, city, state })}
      placeholder="Selecione a cidade"
    />
  </div>
</div>
```

### Parte 7: Exibir Cidade/UF nos Cards de Embarque (aba Embarques do Evento)

**Arquivo**: `src/pages/admin/Events.tsx` (linhas 1956-1982)

Adicionar cidade/UF ao exibir o card de embarque:

```typescript
// ANTES
<p className="font-medium">{ebl.boarding_location?.name}</p>
<p className="text-sm text-muted-foreground">{ebl.boarding_location?.address}</p>

// DEPOIS
<p className="font-medium">{ebl.boarding_location?.name}</p>
<p className="text-sm text-muted-foreground">{ebl.boarding_location?.address}</p>
{ebl.boarding_location?.city && ebl.boarding_location?.state && (
  <p className="text-xs text-muted-foreground">
    {ebl.boarding_location.city} — {ebl.boarding_location.state}
  </p>
)}
```

### Parte 8: Autofill Inteligente — Última Cidade Usada

**Arquivo**: `src/pages/admin/BoardingLocations.tsx`

Implementar memória da última cidade selecionada:

```typescript
// Estado para última cidade usada
const [lastUsedCity, setLastUsedCity] = useState<{ city: string; state: string } | null>(null);

// Ao abrir modal para novo local, preencher automaticamente
const handleOpenNewLocation = () => {
  setForm({
    ...initialForm,
    city: lastUsedCity?.city ?? '',
    state: lastUsedCity?.state ?? '',
  });
  setDialogOpen(true);
};

// Ao salvar, guardar a cidade usada
const handleSubmit = async (e) => {
  // ... save logic
  if (!error) {
    setLastUsedCity({ city: form.city, state: form.state });
    // ...
  }
};
```

### Parte 9: Atualizar Tabela de Locais de Embarque

**Arquivo**: `src/pages/admin/BoardingLocations.tsx`

Adicionar coluna Cidade/UF na listagem:

```typescript
// Na tabela
<TableHead>Cidade/UF</TableHead>

// Na linha
<TableCell>
  {location.city && location.state 
    ? `${location.city} — ${location.state}` 
    : <span className="text-muted-foreground">—</span>
  }
</TableCell>
```

---

## Resumo dos Arquivos a Modificar/Criar

| Arquivo | Tipo | Alteração |
|---------|------|-----------|
| Migração SQL | Novo | Adicionar `city` e `state` em `boarding_locations` |
| `src/types/database.ts` | Editar | Adicionar `city` e `state` na interface BoardingLocation |
| `src/data/brazilian-cities.ts` | Novo | Lista de cidades brasileiras para autocomplete |
| `src/components/ui/city-autocomplete.tsx` | Novo | Componente de autocomplete de cidade/UF |
| `src/pages/admin/Events.tsx` | Editar | Renomear label, usar autocomplete, exibir cidade no card |
| `src/pages/admin/BoardingLocations.tsx` | Editar | Adicionar campos cidade/UF, tabela, autofill |

---

## Critérios de Sucesso

1. Campo "Cidade do Evento (Destino)" com autocomplete no cadastro de eventos
2. Campos "Cidade" e "UF" no cadastro de locais de embarque (estruturados)
3. Autocomplete sugere "Cidade — UF" enquanto digita
4. Cards de embarque exibem a cidade/UF do local cadastrado
5. Ao criar vários locais em sequência, a última cidade é pré-selecionada
6. Tabela de locais de embarque mostra coluna Cidade/UF
7. Dados consistentes para filtros futuros na página pública

---

## Considerações Técnicas

### Lista de Cidades
- Usar lista estática (não API externa) para evitar dependência e latência
- Incluir aproximadamente 500-1000 cidades mais populosas do Brasil
- Permitir digitação livre para cidades não listadas (evitar bloqueio)

### Migração de Dados Existentes
- Campos novos serão `null` para locais já cadastrados
- Usuário pode editar e preencher a cidade posteriormente
- Sistema continua funcionando mesmo sem cidade preenchida

### Autocomplete
- Usar componente Command/Combobox do shadcn (já disponível no projeto)
- Filtro case-insensitive com debounce para performance
- Limitar a 10-15 sugestões visíveis por vez

