

# Equalização Crítica: Templates → Frota → Eventos → Checkout

## Correções imediatas (build errors)

Dois erros de build em `TemplatesLayout.tsx` (linhas 504 e 597): `.endswith()` deve ser `.endsWith()` (case-sensitive JavaScript).

---

## P0 — Mudanças Críticas

### 1) Remover fallback `generateSeatLayout` do Checkout

**Arquivo:** `src/pages/public/Checkout.tsx`

- Remover a função `generateSeatLayout` (linhas 68-124) e todo o bloco `else` (linhas 314-359) que cria assentos localmente quando não existem.
- Novo comportamento: se `existingSeats.length === 0`, exibir estado de erro amigável ("Layout do veículo ainda não foi configurado. Entre em contato com o organizador.") e impedir seleção.
- O mapa de assentos só renderiza a partir de `seats` materializados no banco.

### 2) Sincronização idempotente `layout_snapshot → seats`

**Arquivo:** `src/pages/admin/Fleet.tsx` (dentro do `handleSubmit`)

Após salvar o veículo com sucesso (insert ou update que altere template/snapshot):

1. Ler `layout_snapshot.items` do veículo recém-salvo.
2. Buscar `seats` existentes do `vehicle_id`.
3. Para cada item do snapshot:
   - Se existe seat na mesma posição (`floor`, `row_number`, `column_number`): atualizar `label`, `category`, `status` (bloqueado/disponivel).
   - Se não existe: inserir.
4. Para seats que existem no banco mas não no snapshot: deletar (se não tiver tickets vinculados) ou marcar como bloqueado.
5. Atualizar `vehicle.capacity` = contagem de assentos não-bloqueados do snapshot.

Criar função utilitária `syncSeatsFromSnapshot(vehicleId, companyId, snapshot)` inline no Fleet.tsx (sem novo arquivo).

### 3) Capacidade travada pelo layout

**Arquivo:** `src/pages/admin/Fleet.tsx`
- Quando veículo tem `template_layout_id` ou `layout_snapshot`, o campo `capacity` fica readonly e é calculado automaticamente (contagem de itens não-bloqueados do snapshot).
- Exibir texto: "Capacidade calculada pelo layout: X assentos".

**Arquivo:** `src/pages/admin/EventDetail.tsx`
- Ao selecionar veículo na criação de trip, preencher `capacity` automaticamente com `vehicle.capacity` e tornar o campo readonly (remover edição manual de capacidade).

### 4) Categoria `leito_cama` completa

**Arquivo:** `src/types/database.ts`
- Alterar `SeatCategory` para incluir `leito_cama`:
  ```ts
  export type SeatCategory = 'convencional' | 'executivo' | 'leito' | 'semi_leito' | 'leito_cama';
  ```

**Arquivo:** `src/components/public/SeatButton.tsx`
- Adicionar estilo para `leito_cama`: `'leito_cama': 'border-rose-500 bg-rose-50'`

**Arquivo:** `src/components/public/SeatLegend.tsx`
- Adicionar label e cor para `leito_cama`.

**Arquivo:** `src/lib/ticketVisualRenderer.ts` e `src/components/public/TicketCard.tsx`
- Adicionar `leito_cama: 'Leito Cama'` nos maps de labels de categoria.

---

## P1 — Ajustes Importantes

### 5) Regra unificada de numeração (janela < corredor)

Não será criado arquivo novo. A ordenação já existe no snapshot do template — a sincronização respeita a ordem do snapshot. O `SeatMap` já ordena por `row_number`/`column_number` do banco. A fonte de verdade é o template.

### 6) UX somente-leitura quando veículo usa template

**Arquivo:** `src/pages/admin/Fleet.tsx`
- Quando `editingId` e veículo tem `template_layout_id`: campos de layout (capacity, floors, seats_left_side, seats_right_side) ficam readonly.
- Exibir badge: "Layout vinculado ao template oficial".
- Não implementar "clone para layout próprio" neste pacote (preparação futura).

---

## Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/admin/TemplatesLayout.tsx` | Fix `.endswith` → `.endsWith` (2 ocorrências) |
| `src/pages/public/Checkout.tsx` | Remover `generateSeatLayout` e fallback; estado de erro |
| `src/pages/admin/Fleet.tsx` | Sincronização seats, capacity readonly, UX template |
| `src/pages/admin/EventDetail.tsx` | Capacity auto-preenchida e readonly na trip |
| `src/types/database.ts` | Adicionar `leito_cama` ao `SeatCategory` |
| `src/components/public/SeatButton.tsx` | Estilo `leito_cama` |
| `src/components/public/SeatLegend.tsx` | Label/cor `leito_cama` |
| `src/components/public/TicketCard.tsx` | Label `leito_cama` |
| `src/lib/ticketVisualRenderer.ts` | Label `leito_cama` |
| `src/components/public/SeatMap.tsx` | Remover cast `(seat as any).category` (já tipado) |

