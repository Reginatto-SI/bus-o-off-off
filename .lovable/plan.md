
# Inclusao de Data nos Embarques + Correcao Global de Exibicao

## Resumo

Adicionar o campo `departure_date` (date) na tabela `event_boarding_locations` para suportar embarques em dias diferentes da data do evento (ex: embarque dia 15/02 as 23:30 para evento dia 16/02). Atualizar todas as telas que exibem informacoes de embarque para mostrar data + hora.

---

## 1. Alteracao no Banco de Dados

### Migration

```sql
ALTER TABLE public.event_boarding_locations
  ADD COLUMN departure_date date;
```

- Campo nullable para nao quebrar registros existentes
- Quando `departure_date` for NULL, o sistema assume a data do evento como fallback

---

## 2. Atualizar o Tipo TypeScript

**Arquivo:** `src/types/database.ts`

Adicionar `departure_date: string | null` na interface `EventBoardingLocation`.

---

## 3. Painel Administrativo — Cadastro de Embarques

**Arquivo:** `src/pages/admin/EventDetail.tsx`

Na aba "Locais de Embarque", ao adicionar/editar um embarque:
- Adicionar campo "Data do Embarque" (input type="date") antes do campo de horario
- Default: data do evento
- Salvar no campo `departure_date` da tabela `event_boarding_locations`

---

## 4. Telas Publicas — Exibicao de Data + Hora

### 4.1 Selecao de Embarque (BoardingLocationCard)

**Arquivo:** `src/components/public/BoardingLocationCard.tsx`

- Receber `departure_date` da `EventBoardingLocation`
- Exibir no formato: `Sab, 15/02 as 23:30`
- Quando `departure_date` for null, usar a data do evento como fallback (passada via prop)

### 4.2 Checkout (Resumo do Embarque)

**Arquivo:** `src/pages/public/Checkout.tsx`

- Propagar `departure_date` no fluxo via query params ou busca direta
- Exibir data + hora no resumo lateral/superior

### 4.3 Confirmacao (TicketCard + Detalhes)

**Arquivos:**
- `src/pages/public/Confirmation.tsx` — buscar `departure_date` junto com `departure_time`
- `src/components/public/TicketCard.tsx` — adicionar `boardingDepartureDate` ao `TicketCardData` e exibir data formatada

### 4.4 Consulta de Passagens

**Arquivo:** `src/pages/public/TicketLookup.tsx`

- Buscar `departure_date` na query de `event_boarding_locations`
- Passar para o `TicketCard`

---

## 5. Formatacao de Data + Hora

Criar helper reutilizavel para formatar data de embarque:

```typescript
// Exemplo: "Sab, 15/02 as 23:30"
function formatBoardingDateTime(date: string | null, time: string | null, eventDate: string): string
```

- Usa `date-fns` com locale `ptBR`
- Se `date` for null, usa `eventDate` como fallback
- Se `time` for null, exibe apenas a data
- Respeita o fuso do navegador (Date nativa do JS ja faz isso com datas locais)

---

## 6. Fuso Horario

- O campo `departure_date` e armazenado como `date` (sem timezone) — correto para datas locais no Brasil
- O campo `departure_time` ja e `time without time zone` — correto
- A exibicao usa `new Date('YYYY-MM-DD')` que interpreta como data local
- Nao ha necessidade de conversao de timezone pois os campos ja sao "naive" (sem tz)

---

## 7. Arquivos Modificados (Resumo)

| Arquivo | Alteracao |
|---------|-----------|
| Migration SQL | Adicionar coluna `departure_date` |
| `src/types/database.ts` | Adicionar campo na interface |
| `src/pages/admin/EventDetail.tsx` | Campo de data no formulario de embarque |
| `src/components/public/BoardingLocationCard.tsx` | Exibir data + hora |
| `src/pages/public/Checkout.tsx` | Propagar e exibir data do embarque |
| `src/pages/public/Confirmation.tsx` | Buscar e exibir data do embarque |
| `src/components/public/TicketCard.tsx` | Novo campo `boardingDepartureDate` + exibicao |
| `src/pages/public/TicketLookup.tsx` | Buscar e passar `departure_date` |
| `src/lib/utils.ts` (ou novo helper) | Funcao `formatBoardingDateTime` |

---

## 8. Sem Novas Dependencias

Usa apenas `date-fns` (ja instalado) e tipos nativos.
