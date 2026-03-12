

# Plan: Passenger-Grouped Ticket Experience

## Summary

Create a new shared component `PassengerTicketList` that replaces the current "all tickets open at once" pattern with a compact passenger-grouped view across all 4 consumption points: Confirmation, TicketLookup, Sales admin modal, and NewSaleModal confirmation.

## Architecture

```text
CURRENT:
  [TicketCard] [TicketCard] [TicketCard] [TicketCard] ...  (all open, long scroll)

NEW:
  [Purchase Summary Card]
  [PassengerSummaryCard - João]  → click → opens TicketCard(s) with ida/volta tabs
  [PassengerSummaryCard - Maria] → click → opens TicketCard(s)
  [PassengerSummaryCard - Pedro] → click → opens TicketCard(s)
```

## Data Model Understanding

- Each ticket has a `trip_id` pointing to a `trips` row with `trip_type` (ida/volta)
- Return tickets use `seat_label` like `VOLTA-1`, `VOLTA-2`
- Same passenger appears as 2 separate tickets (ida + volta) with same CPF
- Grouping key: `passenger_cpf` (normalized digits)

## New Component: `src/components/public/PassengerTicketList.tsx`

A single reusable component consumed by all 4 screens. It receives:
- `tickets: TicketCardData[]` — flat list of all tickets
- `onRefreshStatus?` / `isRefreshingSaleIds?` — for payment refresh
- `allowReservedDownloads?` — for admin context
- `context?: 'public' | 'admin'` — minor layout tweaks

### Internal logic:
1. **Group tickets by passenger** using CPF digits as key
2. **Detect ida/volta** by checking if `seatLabel` starts with `VOLTA-`
3. **Render summary cards** — compact list showing:
   - Passenger name
   - Masked CPF (`***.456.789-**`)
   - Ida seat label (e.g., "Poltrona 12")
   - Volta indicator (e.g., "Volta inclusa" or "Somente ida")
   - Status badge
   - Chevron/expand affordance
4. **On click** — expand inline (Collapsible) or open detail view showing:
   - If ida+volta: Tabs component with "Ida" / "Volta" tabs, each rendering `<TicketCard>`
   - If ida only: Single `<TicketCard>` directly
5. **Volta without real seat** — display "Volta inclusa" with friendly label instead of `VOLTA-1`

### Purchase Summary Header (optional, shown when context data available):
- Event name, date, city
- Payment status badge
- Passenger count, total ticket count (e.g., "3 passageiros · 6 trechos")

## Screen Changes

### 1. `src/pages/public/Confirmation.tsx`
- Replace the `ticketCards.map(tc => <TicketCard>)` block (lines 461-463) with `<PassengerTicketList tickets={ticketCards} />`
- The purchase summary header is already rendered separately in this page, so just pass the ticket list

### 2. `src/pages/public/TicketLookup.tsx`
- Replace the `tickets.map(t => <TicketCard>)` block (lines 376-394) with `<PassengerTicketList tickets={tickets} onRefreshStatus={handleRefreshStatus} isRefreshingSaleIds={refreshingSaleIds} />`
- Update the results header to show passenger count instead of raw ticket count

### 3. `src/pages/admin/Sales.tsx` — "Gerar Passagem" modal (lines 1380-1427)
- Replace the current "pick passenger then show single TicketCard" flow with `<PassengerTicketList tickets={allTicketCards} allowReservedDownloads context="admin" />`
- Remove `selectedTicketId` state and the manual passenger picker — the new component handles this natively

### 4. `src/components/admin/NewSaleModal.tsx` — Step 4 confirmation (lines 745-798)
- Replace the prev/next navigation + single TicketCard with `<PassengerTicketList tickets={allConfirmationTicketCards} allowReservedDownloads context="admin" />`
- Remove `activeTicketIndex` state

## TicketCard Changes

The `TicketCard` component itself is NOT modified. It continues to be the official visual ticket rendered inside the detail view. QR Code, PDF, and image generation remain untouched.

Only addition to `TicketCardData` interface: none needed. The `seatLabel` convention (`VOLTA-N`) is sufficient for detection.

## Visual Design

### Passenger Summary Card
```text
┌─────────────────────────────────────────┐
│ 👤 João da Silva                    ▼   │
│    CPF: ***.456.789-**                  │
│    Ida: Poltrona 12 · Volta inclusa     │
│    ● Pago                               │
└─────────────────────────────────────────┘
```

### Expanded (ida+volta)
```text
┌─────────────────────────────────────────┐
│ 👤 João da Silva                    ▲   │
│    CPF: ***.456.789-**                  │
│    ┌──────┬────────┐                    │
│    │  Ida │ Volta  │  ← Tabs            │
│    └──────┴────────┘                    │
│    [Full TicketCard for selected leg]   │
└─────────────────────────────────────────┘
```

### Expanded (ida only)
```text
┌─────────────────────────────────────────┐
│ 👤 João da Silva                    ▲   │
│    [Full TicketCard]                    │
└─────────────────────────────────────────┘
```

## Files Changed

| File | Change |
|---|---|
| **New**: `src/components/public/PassengerTicketList.tsx` | Main reusable component |
| `src/pages/public/Confirmation.tsx` | Replace ticket list with PassengerTicketList |
| `src/pages/public/TicketLookup.tsx` | Replace ticket list with PassengerTicketList |
| `src/pages/admin/Sales.tsx` | Replace ticket gen modal content |
| `src/components/admin/NewSaleModal.tsx` | Replace step 4 confirmation |

No database changes. No changes to TicketCard, PDF, or image generation.

