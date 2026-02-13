

# Evolucao de Status e Energia Visual dos Eventos

## Visao Geral

Quatro grandes melhorias na tela `/admin/eventos`:
1. Modal de decisao estrategica apos primeiro salvamento
2. Alteracao rapida de status no menu "..." do card
3. Visual diferenciado por status (dopamina para "A Venda")
4. Indicadores de performance e pendencias nos cards

---

## Parte 1: Confirmacao Inteligente no Primeiro Salvamento

### Arquivo: `src/pages/admin/Events.tsx`

Adicionar estado para controlar o modal pos-criacao:

```typescript
const [postCreateDialogOpen, setPostCreateDialogOpen] = useState(false);
const [newlyCreatedEventId, setNewlyCreatedEventId] = useState<string | null>(null);
```

No `handleSubmit`, apos criar evento com sucesso (bloco `if (!editingId && newEventId)`), ao inves de apenas redirecionar para aba "viagens", tambem abrir o modal de decisao:

```typescript
if (!editingId && newEventId) {
  setEditingId(newEventId);
  loadEventData(newEventId);
  setActiveTab('viagens');
  setNewlyCreatedEventId(newEventId);
  setPostCreateDialogOpen(true);
}
```

Novo AlertDialog com duas opcoes:
- **"Ativar para Venda"**: verifica `publishChecklist.valid`. Se valido, atualiza status para `a_venda` e exibe toast animado. Se invalido, exibe aviso com itens pendentes e permite apenas Rascunho.
- **"Manter como Rascunho"**: fecha o dialog e mantem status atual.

---

## Parte 2: Alteracao Rapida de Status no Card

### Arquivo: `src/pages/admin/Events.tsx`

Modificar a funcao `getEventActions` (linha 1270) para adicionar opcoes de troca de status:

**Regras de transicao:**
- Rascunho -> "Colocar a Venda" (verifica publicChecklist antes; se falhar, exibe toast com pendencias)
- A Venda -> "Voltar para Rascunho" e "Encerrar Evento"
- Encerrado -> nenhuma opcao de status (apenas visualizar)

Para validar publicacao diretamente do card (sem abrir modal), sera necessario fazer uma query rapida para verificar os requisitos minimos do evento: viagens existentes, embarques de ida existentes, e preco > 0. Isso porque o `publishChecklist` atual depende de dados carregados apenas dentro do modal de edicao.

Implementacao:
```typescript
// No getEventActions, apos as acoes existentes:
if (event.status === 'rascunho') {
  actions.push({
    label: 'Colocar a Venda',
    icon: ShoppingBag,
    onClick: () => handleQuickStatusChange(event, 'a_venda'),
  });
}
if (event.status === 'a_venda') {
  actions.push({
    label: 'Voltar para Rascunho',
    icon: FileEdit,
    onClick: () => handleQuickStatusChange(event, 'rascunho'),
  });
  actions.push({
    label: 'Encerrar Evento',
    icon: CheckCircle,
    onClick: () => handleQuickStatusChange(event, 'encerrado'),
  });
}
```

Nova funcao `handleQuickStatusChange`:
- Para `a_venda`: query para validar requisitos (nome, data, cidade ja estao no objeto; precisa verificar trips, boardings, preco). Se invalido, toast com lista do que falta. Se valido, update + toast de sucesso animado.
- Para `rascunho`: update direto.
- Para `encerrado`: AlertDialog de confirmacao antes de encerrar.

---

## Parte 3: Visual Diferenciado por Status nos Cards

### Arquivo: `src/pages/admin/Events.tsx`

No card de evento (linha 1562), adicionar classes condicionais baseadas no status:

```typescript
<Card 
  key={event.id} 
  className={cn(
    'card-corporate h-full overflow-hidden transition-all duration-300',
    event.status === 'a_venda' && 'ring-1 ring-success/30 shadow-[0_0_15px_-3px_hsl(var(--success)/0.15)]',
    event.status === 'encerrado' && 'opacity-70',
    event.status === 'rascunho' && 'border-dashed',
  )}
>
```

### Arquivo: `src/index.css`

Adicionar animacao sutil de entrada para cards ativos:

```css
@keyframes card-glow-pulse {
  0%, 100% { box-shadow: 0 0 15px -3px hsl(var(--success) / 0.1); }
  50% { box-shadow: 0 0 20px -3px hsl(var(--success) / 0.2); }
}

.card-active-glow {
  animation: card-glow-pulse 3s ease-in-out infinite;
}
```

### StatusBadge Visual Upgrade

Para o status `a_venda`, adicionar um pequeno indicador pulsante (dot) ao lado do badge para reforcar que esta "ao vivo":

```typescript
// Dentro do card, ao lado do StatusBadge quando a_venda:
{event.status === 'a_venda' && (
  <span className="relative flex h-2 w-2 ml-1">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
    <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
  </span>
)}
```

---

## Parte 4: Indicadores de Performance e Pendencias

### 4.1 Indicador de % Vendido

Para exibir "X% vendido" no card, precisamos consultar vendas por evento. Duas abordagens:

**Abordagem escolhida**: Fazer uma query agregada ao carregar eventos para obter contagem de tickets vendidos por evento. Isso evita N+1 queries.

```typescript
// Apos fetchEvents, buscar contagem de tickets por evento:
const { data: salesData } = await supabase
  .from('sales')
  .select('event_id, quantity')
  .in('status', ['reservado', 'pago']);

// Agrupar por event_id
const salesByEvent = new Map<string, number>();
salesData?.forEach(sale => {
  const current = salesByEvent.get(sale.event_id) || 0;
  salesByEvent.set(sale.event_id, current + sale.quantity);
});
```

No card, exibir barra de progresso discreta:

```typescript
// Calcular capacidade total do evento (soma de veiculos unicos)
const totalSold = salesByEvent.get(event.id) || 0;
const totalCapacity = /* soma capacidades dos veiculos */;
const percentSold = totalCapacity > 0 ? Math.round((totalSold / totalCapacity) * 100) : 0;

// No card footer:
{event.status === 'a_venda' && totalCapacity > 0 && (
  <div className="mt-2">
    <div className="flex justify-between text-xs text-muted-foreground mb-1">
      <span>{totalSold} vendido(s)</span>
      <span>{percentSold}%</span>
    </div>
    <Progress value={percentSold} className="h-1.5" />
  </div>
)}
```

Para obter capacidade por evento, usamos os dados de `trips` ja presentes em `EventWithTrips`. Precisamos adicionar `capacity` ao select dos trips:

```typescript
// Alterar fetchEvents para incluir capacity:
.select(`*, trips:trips(vehicle_id, driver_id, assistant_driver_id, capacity)`)
```

### 4.2 Indicador de Pendencias (Rascunho)

Para rascunhos, verificar se faltam itens para publicar. Os dados basicos (nome, data, cidade, preco) ja estao no evento. Faltam verificar trips e boardings.

Usando os dados ja carregados:
- `event.trips.length === 0` -> falta frota
- `event.unit_price <= 0` -> falta preco

No card, exibir alerta sutil:

```typescript
{event.status === 'rascunho' && (
  (() => {
    const pendencias: string[] = [];
    if (!event.trips?.length) pendencias.push('frota');
    if (event.unit_price <= 0) pendencias.push('preco');
    if (pendencias.length === 0) return null;
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-warning">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Faltam: {pendencias.join(', ')}</span>
      </div>
    );
  })()
)}
```

### 4.3 Microfeedback ao Ativar Evento

Ao mudar status para `a_venda` com sucesso (tanto pelo modal de primeiro salvamento quanto pela troca rapida):

```typescript
toast.success('Evento publicado com sucesso! O evento ja esta visivel no portal.', {
  duration: 4000,
  icon: '🚀',
});
```

---

## Parte 5: Resumo dos Arquivos Alterados

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/pages/admin/Events.tsx` | Editar | Modal pos-criacao, acoes rapidas de status no card, visual condicional, indicadores |
| `src/index.css` | Editar | Animacao glow sutil para cards ativos |

Nenhuma alteracao de banco de dados necessaria. Todas as mudancas sao no frontend.

---

## Regras de Seguranca

- Alteracao de status usa mesma query `supabase.from('events').update(...)` ja protegida por RLS
- Validacao de publicacao (checklist) mantida identica
- Encerramento protegido por confirmacao via AlertDialog
- Nenhum dado financeiro exposto adicionalmente

---

## Resultado Esperado

- Primeiro salvamento: decisao imediata sobre publicacao
- Menu "...": troca de status sem abrir modal de edicao
- Cards "A Venda": glow sutil verde, dot pulsante, barra de progresso de vendas
- Cards "Rascunho": borda tracejada, alerta de pendencias
- Cards "Encerrado": opacidade reduzida, sem animacoes
- Toast animado ao publicar evento

