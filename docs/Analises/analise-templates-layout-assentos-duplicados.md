# Análise: erro de assentos duplicados em `/admin/templates-layout`

## 1. Resumo executivo

Foi identificada **causa raiz no frontend**, no fluxo de pintura/edição em lote do grid do template:

- a validação pré-salvamento não detectava duplicidade de assentos **gerada dentro do próprio lote selecionado** (ex.: múltiplas células editadas de uma vez);
- quando o número base era inválido em edição em lote (ex.: texto não numérico), podia haver transformação inconsistente;
- com isso, o payload chegava ao backend com `seat_number` repetido no mesmo `template_layout_id`, e o banco rejeitava no índice único `idx_template_layout_items_unique_seat_number`.

A correção mínima aplicada foi apenas na validação de rascunho do frontend (`validateDraft`), para bloquear duplicidade intra-lote e número inválido antes da persistência, sem alterar a lógica de venda/ocupação.

---

## 2. Arquivos analisados

- `src/pages/admin/TemplatesLayout.tsx`
- `supabase/migrations/20260315000000_add_template_layout_catalog.sql`
- `supabase/migrations/20260520001802_d7c49337-440e-4dd9-8182-d4ac39a61f2f.sql`
- `src/lib/tripSeatOccupancyRpc.ts`

---

## 3. Fluxo atual de criação de template

1. Tela `/admin/templates-layout` abre formulário + editor visual de grid.
2. Usuário desenha assentos/bloqueios no estado local `items`.
3. Ao salvar:
   - validações locais (`validateItems`);
   - criação/atualização do registro em `template_layouts`;
   - transformação de `items` em `sanitizedItems`;
   - leitura dos itens existentes;
   - remoção de itens deletados visualmente (`delete by id`);
   - `upsert` de itens por conflito de coordenada (`template_layout_id,floor_number,row_number,column_number`).

---

## 4. Fluxo atual de persistência dos itens do layout

Persistência ocorre em `template_layout_items`:

- `UNIQUE (template_layout_id, floor_number, row_number, column_number)` para posição;
- índice único parcial `idx_template_layout_items_unique_seat_number` em `(template_layout_id, seat_number) WHERE seat_number IS NOT NULL`.

Ou seja, o banco permite mesmo número em templates diferentes (escopo por `template_layout_id`), mas não permite duplicidade no mesmo template.

---

## 5. Onde a validação de duplicidade ocorre

### Frontend

- `validateDraft` (edição/pintura de células) valida duplicidade por pavimento contra `items` já existentes.
- `validateItems` valida:
  - posição duplicada;
  - número duplicado no mesmo pavimento;
  - número duplicado em pavimentos diferentes no mesmo template.

### Backend/Banco

- bloqueio definitivo por índice único em `template_layout_items(template_layout_id, seat_number)`.

---

## 6. Evidência da causa raiz

No fluxo antigo de `validateDraft`, ao editar múltiplas células:

- os números candidatos eram calculados em `numbersToApply`, porém a duplicidade era comparada só contra `items` existentes;
- **não havia checagem de duplicidade entre os próprios `targetCoords` do lote**;
- portanto, lote podia conter assentos repetidos e passar na validação local;
- erro aparecia apenas no `upsert`, retornando a mensagem de persistência com origem em duplicidade.

Também havia fragilidade para valor base inválido em lote (parse para número).

---

## 7. Relação com alterações recentes de ocupação/pintura de poltronas

Não foi encontrada dependência direta entre:

- criação/salvamento de template (`template_layouts` / `template_layout_items`), e
- ocupação de viagem/venda (`tickets`, `seat_locks`, RPC `get_trip_seat_occupancy`).

As alterações recentes de ocupação atuam no contexto de venda/viagem e não no catálogo estrutural de template.

Conclusão: **problema atual é local ao editor de template (frontend), não à lógica de ocupação real**.

---

## 8. Riscos encontrados

1. Duplicidade intra-lote na pintura em massa passava no frontend e estourava no banco.
2. Entrada não numérica em edição em lote podia gerar transformação inconsistente.
3. Mensagem final ao usuário ficava tardia (só após tentativa de persistência).

---

## 9. Correção mínima aplicada

Arquivo alterado: `src/pages/admin/TemplatesLayout.tsx`

Ajustes em `validateDraft`:

1. Base numérica de assento em lote agora valida `Number.isNaN` e invalida cedo (`''` => erro amigável).
2. Quando não há número informado no draft, a validação não auto-preenche número para múltiplas células (evita repetição implícita no lote).
3. Nova checagem de duplicidade **intra-lote por pavimento** antes de comparar com itens existentes.

Sem mudança de arquitetura, sem alterar venda/checkout/Asaas/RPC de ocupação.

---

## 10. Arquivos alterados

- `src/pages/admin/TemplatesLayout.tsx`
- `docs/Analises/analise-templates-layout-assentos-duplicados.md`

---

## 11. Checklist de testes manuais

- [ ] Criar template novo com assentos sequenciais sem duplicidade.
- [ ] Criar template novo com assentos propositalmente duplicados (deve bloquear).
- [ ] Editar template existente sem alterar assentos e salvar.
- [ ] Editar template existente removendo assentos e salvar.
- [ ] Editar template existente adicionando novos assentos e salvar.
- [ ] Confirmar que assentos removidos não continuam persistidos.
- [ ] Confirmar que templates diferentes aceitam mesmo número sem conflito entre si.
- [ ] Confirmar que empresas diferentes aceitam mesmos números sem conflito indevido.
- [ ] Confirmar pintura correta no fluxo público (vendido/bloqueado/disponível).
- [ ] Confirmar pintura correta no fluxo admin/manual.
- [ ] Confirmar ausência de impacto em checkout, Asaas, webhook e confirmação de pagamento.

---

## 12. Checklist de regressão (venda/ocupação)

- [ ] RPC `get_trip_seat_occupancy` continua retornando ocupação por viagem corretamente.
- [ ] `seat_locks` segue como lock técnico do checkout público.
- [ ] Tickets confirmados continuam bloqueando assentos no mapa.
- [ ] Reservas manuais continuam respeitando regras atuais sem dependência do template editor.

---

## 13. Refino pós-correção (usabilidade de preenchimento em lote)

### 13.1 O que foi revalidado

1. O fluxo de aplicação em lote continua aceitando número inicial explícito e gerando sequência (`N`, `N+1`, `N+2`...).
2. A validação de duplicidade intra-lote continua ativa antes da persistência.
3. A validação de conflito com assentos já existentes no mesmo template continua ativa.

### 13.2 Preenchimento sequencial em lote continuou funcionando?

Sim. Quando o usuário seleciona múltiplas células e informa um número inicial válido (ex.: `1`), o sistema gera sequência numérica automaticamente no lote e mantém os bloqueios de duplicidade real.

### 13.3 Ajuste adicional necessário

Foi aplicado ajuste mínimo para preservar produtividade sem abrir brecha de duplicidade:

- em lote de múltiplas células novas sem número existente, se o usuário não informar número inicial, o sistema orienta com mensagem clara para informar a semente da sequência;
- isso evita comportamento implícito ambíguo e mantém previsibilidade da numeração em massa.

### 13.4 Arquivos alterados no refino

- `src/pages/admin/TemplatesLayout.tsx`
- `docs/Analises/analise-templates-layout-assentos-duplicados.md`

### 13.5 Checklist final de testes manuais (refino)

- [ ] Criar template novo com assentos `1` a `10`.
- [ ] Selecionar 10 células e gerar numeração sequencial a partir de `1`.
- [ ] Tentar gerar sequência que conflite com assento já existente no mesmo template.
- [ ] Tentar gerar duplicidade dentro do próprio lote.
- [ ] Editar template existente e salvar sem alterar nada.
- [ ] Remover assentos e salvar.
- [ ] Criar outro template com os mesmos números e confirmar ausência de conflito indevido.
- [ ] Confirmar que venda/admin/checkout/ocupação de assentos não foram alterados.
