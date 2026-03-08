

## Plano: Exibir Parceiros e Patrocinadores na Passagem (modelo único global)

### Resumo da Arquitetura

A passagem possui **3 pontos de renderização** que devem ser atualizados em sincronia:

| Contexto | Arquivo | Como renderiza |
|----------|---------|---------------|
| **Virtual (DOM)** | `TicketCard.tsx` | JSX/React |
| **PDF (fallback canvas)** | `ticketVisualRenderer.ts` | Canvas 2D |
| **Imagem PNG** | `ticketImageGenerator.ts` | Reutiliza `ticketVisualRenderer` |

O PDF principal usa `html2canvas` do DOM do `TicketCard` — logo, se adicionarmos ao TicketCard, o PDF já herda automaticamente. O canvas fallback (`ticketVisualRenderer`) precisa de atualização manual.

### Dados necessários

Precisamos passar arrays de parceiros e patrocinadores para o `TicketCardData`. Cada item precisa apenas de: `name`, `logo_url`.

---

### 1. Expandir a interface `TicketCardData`

**Arquivo**: `src/components/public/TicketCard.tsx`

Adicionar dois campos opcionais:

```typescript
commercialPartners?: { name: string; logo_url: string | null }[];
eventSponsors?: { name: string; logo_url: string | null }[];
```

---

### 2. Atualizar `TicketCard.tsx` — Blocos visuais

Após "Observações Operacionais" e antes do bloco de fees, inserir:

**Parceiros oficiais** (se `commercialPartners?.length > 0`):
- `border-t`, título "Parceiros oficiais", grid de logos (max 6)
- Logos pequenos (h-8), em flex-wrap horizontal

**Patrocinadores do evento** (se `eventSponsors?.length > 0`):
- Mesmo padrão, título "Patrocinadores do evento"
- Grid compacto de logos (max 6)

Ambos os blocos condicionais — sem dados, sem renderização.

---

### 3. Atualizar `ticketVisualRenderer.ts` — Canvas fallback

Adicionar renderização canvas dos logos de parceiros e patrocinadores na mesma posição (após Observações, antes de fees). Usar `loadImage()` já existente para carregar logos. Ajustar o cálculo dinâmico de `height` para acomodar os novos blocos.

Lógica:
- Calcular quantas linhas de logos (max 6 por bloco, ~3 por linha)
- Cada bloco: título (28px) + linhas de logos (~50px cada)
- Se não houver dados, zero de altura extra

---

### 4. Alimentar os dados — Edge Function `ticket-lookup`

**Arquivo**: `supabase/functions/ticket-lookup/index.ts`

Após buscar tickets, buscar:

1. **Parceiros comerciais**: query `commercial_partners` onde `company_id` = company do evento, `status = 'ativo'`, `show_on_ticket = true`, order by `display_order`, limit 6
2. **Patrocinadores do evento**: query `event_sponsors` join `sponsors` onde `event_id` = evento, `show_on_ticket = true`, order by `display_order`, limit 6

Retornar no response JSON:
```json
{
  "tickets": [...],
  "commercialPartners": [{ "name": "...", "logo_url": "..." }],
  "eventSponsors": [{ "name": "...", "logo_url": "..." }]
}
```

---

### 5. Alimentar os dados — `TicketLookup.tsx`

Extrair `commercialPartners` e `eventSponsors` do response e injetá-los em cada `TicketCardData`.

---

### 6. Alimentar os dados — `Confirmation.tsx`

Buscar parceiros e patrocinadores diretamente via supabase client (já tem `company_id` e `event_id`):
- `commercial_partners` where `company_id`, `status=ativo`, `show_on_ticket=true`
- `event_sponsors` join `sponsors` where `event_id`, `show_on_ticket=true`

Injetar nos `ticketCards`.

---

### 7. Alimentar os dados — `Sales.tsx` (admin)

Na função `buildTicketCardData`, aceitar os mesmos arrays opcionais e repassá-los. Buscar parceiros e patrocinadores quando o modal de passagem for aberto.

---

### Arquivos a modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/public/TicketCard.tsx` | Interface + blocos visuais |
| `src/lib/ticketVisualRenderer.ts` | Renderização canvas dos logos |
| `supabase/functions/ticket-lookup/index.ts` | Buscar e retornar parceiros/patrocinadores |
| `src/pages/public/TicketLookup.tsx` | Mapear dados para TicketCardData |
| `src/pages/public/Confirmation.tsx` | Buscar e injetar dados |
| `src/pages/admin/Sales.tsx` | Buscar e injetar dados no modal |

### Sem migration necessária

Todos os dados já existem nas tabelas `commercial_partners` e `event_sponsors` + `sponsors`. Basta consultar.

