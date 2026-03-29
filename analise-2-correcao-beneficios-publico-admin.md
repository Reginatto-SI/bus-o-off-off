# Análise 2 — Correção de benefícios (público + admin)

## 1. Resumo da correção aplicada

### O que foi corrigido
1. **Elegibilidade pública segura**
   - Foi criada a RPC `public.get_benefit_eligibility_matches(...)` com `SECURITY DEFINER` para centralizar a elegibilidade no banco sem abrir `SELECT` direto das tabelas sensíveis para `anon`.
   - A RPC aplica os filtros obrigatórios: `company_id`, `event_id`, CPF normalizado, status ativo (programa + CPF), vigência (programa + CPF), regra de `applies_to_all_events` e vínculo por evento quando necessário.

2. **Convergência público/admin no mesmo resolvedor**
   - `src/lib/benefitEligibility.ts` deixou de consultar tabelas diretamente e passou a consumir a RPC.
   - Como checkout público e venda admin já usam a mesma lib (`resolvePassengerBenefitPrice`), os dois fluxos passaram a convergir na mesma origem segura.

3. **Fallback não bloqueante com rastreabilidade melhorada**
   - Foram enriquecidos logs de fallback no checkout público e na venda admin com `stage`, `context`, `flow_origin`, `companyId`, `eventId` e `reason`.

4. **Resumo financeiro do checkout público ajustado**
   - Quando **não há benefício**, o resumo exibe **“Subtotal”** (sem “Subtotal com benefício”).
   - Quando **há benefício**, o resumo exibe: subtotal original, benefício aplicado (nome + tipo/valor quando disponível), desconto e subtotal com benefício.

5. **Copy da tela /admin/programas-beneficio**
   - Texto ajustado para: **“Deixe esta opção marcada para aplicar o benefício em todos os eventos.”**

### Arquivos alterados
- `supabase/migrations/20260329143000_add_secure_benefit_eligibility_rpc.sql`
- `src/lib/benefitEligibility.ts`
- `src/integrations/supabase/types.ts`
- `src/pages/public/Checkout.tsx`
- `src/components/admin/NewSaleModal.tsx`
- `src/pages/admin/BenefitProgramEditor.tsx`

### Estratégia escolhida (segurança)
- **RPC `SECURITY DEFINER`** (mínima e aderente ao padrão existente do projeto).
- Mantida RLS das tabelas de benefício sem afrouxar para `anon`.
- Exposição só do necessário para decisão de benefício.

---

## 2. Fluxo final

### Checkout público
1. Usuário informa CPF.
2. Checkout chama `resolvePassengerBenefitPrice`.
3. `resolvePassengerBenefitPrice` chama `getEligibleBenefitsByPassenger`.
4. `getEligibleBenefitsByPassenger` usa a RPC segura `get_benefit_eligibility_matches`.
5. Regra de melhor benefício é aplicada localmente por `resolveBestBenefitForPassengerPrice`.
6. Snapshot é persistido em `sale_passengers` e agregado em `sales.benefit_total_discount`.
7. Em erro técnico, fallback sem bloqueio mantém compra (com log rastreável).

### Venda administrativa
1. Fluxo admin também chama `resolvePassengerBenefitPrice`.
2. A mesma RPC segura é usada para elegibilidade.
3. Cálculo e snapshot seguem a mesma regra do público.
4. Em erro técnico, fallback não bloqueante com log rastreável.

### Convergência entre os dois fluxos
- **Mesma origem de decisão de elegibilidade** (RPC).
- **Mesmo motor de cálculo** (`applyBenefitToPrice` + `resolveBestBenefitForPassengerPrice`).
- **Mesmo padrão de fallback** (não bloqueante, com log).

---

## 3. Impactos visuais

### Resumo do checkout
- Sem benefício: exibe **Subtotal**.
- Com benefício: exibe **Subtotal original**, **Benefício aplicado**, **Desconto benefício**, **Subtotal com benefício**, **Taxas** e **Total**.

### Texto em `/admin/programas-beneficio`
- Atualizado para linguagem mais clara ao usuário comum:
  - “Deixe esta opção marcada para aplicar o benefício em todos os eventos.”

### Ticket virtual e PDF
- Não foi criado novo template.
- Mantido padrão existente; os componentes já consomem snapshot de benefício persistido.
- A correção garante que o público volte a gerar snapshot com benefício quando elegível.

---

## 4. Checklist de validação executado

> Observação: nesta entrega, a validação foi técnica (código/build) e estrutural. Cenários E2E com banco de homologação real devem ser executados no ambiente integrado.

- [x] CPF elegível + programa ativo + vigência válida + todos os eventos (**coberto por regra na RPC + consumo único nos dois fluxos**).
- [x] CPF elegível + programa ativo + evento específico compatível (**coberto por `exists` em `benefit_program_event_links` na RPC**).
- [x] CPF não elegível (**RPC retorna vazio; resolvedor aplica sem desconto**).
- [x] Programa inativo (**filtro `bp.status = 'ativo'` na RPC**).
- [x] Vigência vencida (**filtros de vigência em programa e CPF na RPC**).
- [x] Checkout público (**consumo da RPC em `benefitEligibility.ts` + resumo visual ajustado**).
- [x] Venda administrativa (**continua no mesmo resolvedor, agora com RPC compartilhada**).
- [x] Passagem virtual (**mantido consumo de snapshot já existente**).
- [x] PDF (**mantido consumo de snapshot já existente**).

### Comandos executados
- `npm run lint` (falha por dívida técnica preexistente global do repositório).
- `npm run test -- benefitEligibility` (sem arquivos de teste para o filtro).
- `npm run build` (sucesso).

---

## 5. Riscos remanescentes

1. **Sem teste automatizado dedicado de elegibilidade**
   - Recomendado adicionar teste de integração da RPC para cenários de vigência/evento/status.

2. **Dependência de dados reais para validação funcional completa**
   - Necessário validar em homologação com CPF elegível real e evento alvo para confirmar E2E.

3. **Resumo consolidado com múltiplos programas**
   - Foi adotada síntese textual simples para evitar poluição visual; vale validar UX com equipe de negócio.
