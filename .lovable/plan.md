
## Plano: Evolução de Patrocinadores — Cadastro Global + Vínculo por Evento

### Resumo da Solução

Transformar patrocinadores de entidade puramente global para um modelo de **cadastro base reutilizável** com **vínculo por evento** e **controle granular de exibição**.

---

### 1. Nova Tabela: `event_sponsors` (Relacionamento N:N)

Cria relacionamento entre eventos e patrocinadores com opções de exibição:

```sql
CREATE TABLE public.event_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  
  -- Opções de exibição (toggles)
  show_on_event_page boolean NOT NULL DEFAULT true,
  show_on_showcase boolean NOT NULL DEFAULT false,
  show_on_ticket boolean NOT NULL DEFAULT false,
  
  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(event_id, sponsor_id)
);

-- RLS
ALTER TABLE public.event_sponsors ENABLE ROW LEVEL SECURITY;

-- Admins gerenciam vínculos da própria empresa
CREATE POLICY "Admins can manage event_sponsors" ON public.event_sponsors
FOR ALL USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

-- Público visualiza patrocinadores de eventos públicos
CREATE POLICY "Public can view event_sponsors for public events" ON public.event_sponsors
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_sponsors.event_id AND e.status = 'a_venda'
  )
);
```

---

### 2. Alterações na Tela `/admin/patrocinadores`

**Arquivo:** `src/pages/admin/Sponsors.tsx`

- **Título:** manter "Patrocinadores"
- **Descrição:** alterar para:
  > "Cadastre os patrocinadores da sua empresa. Depois, vincule-os aos eventos para definir onde serão exibidos."
- Remover referência a "carrossel global do app"
- Remover campo `carousel_order` do formulário principal (passa a ser relevante apenas no vínculo do evento)

---

### 3. Nova Aba no Modal de Evento: "Patrocinadores"

**Arquivo:** `src/pages/admin/Events.tsx`

Adicionar nova aba **Patrocinadores** no wizard/modal de evento, após "Taxas" ou "Publicação":

**Conteúdo da aba:**
- Lista de patrocinadores vinculados ao evento
- Botão "Adicionar Patrocinador" → abre modal com:
  - Select de patrocinadores disponíveis (da tabela `sponsors`)
  - Checkboxes:
    - ☑ Mostrar na página do evento (default: ON)
    - ☐ Mostrar na vitrine pública (default: OFF)
    - ☐ Mostrar na passagem (default: OFF)
  - Campo ordem de exibição

**Ações:**
- Editar vínculo (alterar checkboxes)
- Remover patrocinador do evento (não exclui o cadastro base)

---

### 4. Exibição na Página Pública do Evento

**Arquivo:** `src/pages/public/PublicEventDetail.tsx`

- Buscar patrocinadores vinculados ao evento com `show_on_event_page = true`
- Exibir seção discreta "Patrocinadores" com logos/banners clicáveis
- Posicionar abaixo das informações de embarque, de forma não invasiva

---

### 5. Exibição na Passagem (Opcional)

**Arquivos:** `src/lib/ticketVisualRenderer.ts`, `src/components/public/TicketCard.tsx`

- Se patrocinador vinculado ao evento tiver `show_on_ticket = true`:
  - Adicionar pequena área na passagem para logos de patrocinadores
  - Posição: parte inferior, antes do rodapé
  - Limite visual: máximo 2-3 logos em tamanho reduzido
  - Prioridade visual secundária (não compete com QR Code nem dados do passageiro)

---

### 6. Exibição na Vitrine Pública (Opcional)

**Arquivo:** `src/pages/public/PublicCompanyShowcase.tsx`

- Se patrocinador vinculado a eventos públicos da empresa tiver `show_on_showcase = true`:
  - Pode aparecer no carrossel de patrocinadores da vitrine
  - Comportamento atual do carrossel permanece, mas agora alimentado pelo novo modelo

---

### 7. Tipos TypeScript

**Arquivo:** `src/types/database.ts`

```typescript
export interface EventSponsor {
  id: string;
  event_id: string;
  sponsor_id: string;
  company_id: string;
  show_on_event_page: boolean;
  show_on_showcase: boolean;
  show_on_ticket: boolean;
  display_order: number;
  created_at: string;
  sponsor?: Sponsor;
}
```

---

### Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| Migration SQL | Criar tabela `event_sponsors` |
| `src/types/database.ts` | Adicionar `EventSponsor` |
| `src/pages/admin/Sponsors.tsx` | Atualizar descrição |
| `src/pages/admin/Events.tsx` | Nova aba "Patrocinadores" |
| `src/pages/public/PublicEventDetail.tsx` | Exibir patrocinadores |
| `src/lib/ticketVisualRenderer.ts` | Suporte opcional a logos |
| `src/pages/public/PublicCompanyShowcase.tsx` | Integrar novo modelo |

---

### Resultado

- Patrocinadores são cadastrados uma vez e reutilizados
- Cada evento define seus próprios patrocinadores
- Controle granular de onde cada patrocinador aparece
- Estrutura escalável e profissional
