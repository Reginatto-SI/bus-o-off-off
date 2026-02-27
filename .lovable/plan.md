

# Inclusão de Dados Operacionais na Passagem

## Resumo

Adicionar tipo do veículo, placa e nome do motorista ao modelo único de passagem (virtual, imagem, PDF), propagando para todos os consumers.

---

## Mudanças

### 1. TicketCardData — 3 novos campos opcionais

Arquivo: `src/components/public/TicketCard.tsx` (interface)

```ts
vehicleType?: string | null;    // 'onibus' | 'van' | 'micro_onibus'
vehiclePlate?: string | null;
driverName?: string | null;
```

### 2. TicketCard.tsx — nova seção "Informações do Veículo"

Após o bloco de evento/embarque (após `</div>` do `border-t pt-2`), antes do fee breakdown:

- Ícone `Bus` + tipo traduzido (Ônibus/Van/Micro-ônibus)
- Ícone `Hash` + placa
- Ícone `User` + nome do motorista (ou "A definir")
- Seção com `border-t pt-2 mt-2`

### 3. ticketVisualRenderer.ts — mesma seção no canvas

Após o bloco de detalhes do evento, antes dos fees:
- Linha separadora + 3 linhas de texto (tipo, placa, motorista)
- Ajustar cálculo dinâmico de altura do canvas (+3 linhas × 34px)

### 4. Confirmation.tsx — popular novos campos

A query já faz `trip:trips(*, vehicle:vehicles(*))`. Falta o driver.
- Alterar select para incluir `driver:drivers(name)` no join de trips
- Mapear `vehicleType`, `vehiclePlate`, `driverName` no ticketCards

### 5. Sales.tsx — popular novos campos

- A query de sales já inclui trip + vehicle. Adicionar join com driver
- Mapear os 3 campos no `buildTicketCardData`

### 6. NewSaleModal.tsx — popular novos campos

- Já tem acesso a trips/vehicles. Adicionar fetch de driver name
- Mapear no `buildTicketCardData`

### 7. ticket-lookup edge function — retornar dados do veículo/motorista

- A query já faz `trip:trips(*)`. Alterar para `trip:trips(*, vehicle:vehicles(type, plate), driver:drivers(name))`
- Adicionar `vehicleType`, `vehiclePlate`, `driverName` no resultado

### 8. TicketLookup.tsx — mapear novos campos

- Mapear `t.vehicleType`, `t.vehiclePlate`, `t.driverName` do resultado da edge function

---

## Arquivos afetados

| Arquivo | Ação |
|---------|------|
| `src/components/public/TicketCard.tsx` | +3 campos na interface + seção visual |
| `src/lib/ticketVisualRenderer.ts` | +seção canvas + altura dinâmica |
| `src/pages/public/Confirmation.tsx` | Join driver + mapear campos |
| `src/pages/admin/Sales.tsx` | Join driver + mapear campos |
| `src/components/admin/NewSaleModal.tsx` | Mapear campos |
| `src/pages/public/TicketLookup.tsx` | Mapear campos da edge function |
| `supabase/functions/ticket-lookup/index.ts` | Join vehicle+driver + retornar dados |

Nenhuma migração de banco necessária — os dados já existem nas tabelas `vehicles` e `drivers`.

