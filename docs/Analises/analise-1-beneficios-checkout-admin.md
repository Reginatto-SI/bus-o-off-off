# Análise 1 — Benefícios no checkout público e venda administrativa

## 1. Resumo executivo

### Problema real encontrado
O problema é **composto por mais de uma falha**:

1. **Falha de regra/acesso (principal):** o checkout público resolve elegibilidade via `supabase.from('benefit_program_eligible_cpf')` no cliente anônimo, mas as políticas RLS dessas tabelas permitem leitura apenas para `authenticated`. Resultado: a consulta de benefício falha no público e o fluxo cai no fallback sem desconto.  
2. **Falha de exibição no resumo do checkout público:** a linha **“Subtotal com benefício”** é exibida sempre, mesmo quando nenhum benefício foi aplicado, gerando leitura enganosa (“com benefício” sem redução).  
3. **Falha de experiência/consistência:** o checkout público mostra desconto agregado (quando houver) mas não exibe no resumo principal o nome/tipo do benefício aplicado por passageiro; essa informação fica restrita ao bloco individual de passageiro na etapa anterior.

### Onde ocorre
- **Elegibilidade (raiz):** `src/lib/benefitEligibility.ts` + políticas em `supabase/migrations/20261102090000_create_benefit_programs.sql`.  
- **Resumo visual público:** `src/pages/public/Checkout.tsx`.  
- **Comparativo admin/público:** `src/components/admin/NewSaleModal.tsx` vs `src/pages/public/Checkout.tsx`.

### Impacto funcional e visual
- **Funcional (público):** CPF elegível pode não receber desconto na venda pública, porque o fallback desativa benefício quando a consulta falha por permissão.  
- **Funcional (admin):** tendência de funcionar, pois fluxo roda com usuário autenticado e usa a mesma função de elegibilidade.  
- **Visual:** no checkout público, “Subtotal com benefício” pode aparecer igual ao subtotal original, sem contexto; falta transparência do programa aplicado no resumo final.

---

## 2. Fluxo atual mapeado

### 2.1 Cadastro do programa (/admin/programas-beneficio)
- Grava em `benefit_programs` com `company_id`, `status`, `benefit_type`, `benefit_value`, vigência e `applies_to_all_events`.  
- CPFs elegíveis em `benefit_program_eligible_cpf` (também com `company_id`, status, vigência e CPF só dígitos).  
- Vínculo por evento em `benefit_program_event_links` quando **não** aplica para todos os eventos.  
- Quando `applies_to_all_events = true`, os vínculos são removidos e a elegibilidade é tratada por flag (não por links).

### 2.2 Elegibilidade por CPF
- Ponto de decisão: `resolvePassengerBenefitPrice` → `getEligibleBenefitsByPassenger` (`src/lib/benefitEligibility.ts`).  
- Normaliza CPF para 11 dígitos (`normalizeCpfDigits`).  
- Filtros esperados: `company_id`, CPF, status ativo, vigência de programa e vigência de CPF, e depois filtro de escopo por evento (`applies_to_all_events` ou link explícito).  
- Resultado financeiro final é escolhido por “melhor benefício” com `resolveBestBenefitForPassengerPrice`.

### 2.3 Aplicação no checkout público
- Na transição **Passageiros → Pagamento** e novamente antes de persistir a venda, o checkout chama `resolvePassengerBenefitSnapshots`.  
- Se a consulta falha, o código aplica fallback com `benefit_applied=false`, `discount_amount=0`, `final_price=original_price` e segue o checkout sem bloquear.  
- Os totais exibidos no resumo usam esses snapshots (`checkoutSummary`).

### 2.4 Aplicação na venda administrativa
- `NewSaleModal` usa o mesmo resolvedor (`resolvePassengerBenefitPrice`), também com fallback não bloqueante.  
- Como o admin está autenticado, a tendência é a consulta de benefício passar nas políticas atuais e aplicar desconto corretamente.

### 2.5 Persistência na venda/ticket
- Venda (`sales`) recebe `benefit_total_discount`.  
- Passageiros (`sale_passengers`) recebem snapshot completo: nome do programa, tipo, valor, desconto, final e flag de aplicação.  
- Na finalização de pagamento, `sale_passengers` é copiado para `tickets` preservando snapshot de benefício.

### 2.6 Exibição em passagem virtual e PDF
- Ticket virtual (`TicketCard`) renderiza “Benefício aplicado” se houver `benefitApplied` + metadados.  
- Renderer de imagem/PDF (`ticketVisualRenderer`) também mostra benefício e desconto com base no snapshot do ticket.

---

## 3. Causa raiz

### Causa raiz 1 — Falha de regra/acesso (RLS) no checkout público
**O que está quebrado:** o checkout público consulta tabelas protegidas por RLS de `authenticated` usando cliente anônimo.  
**Onde:**
- Query de elegibilidade no cliente: `src/lib/benefitEligibility.ts` (consulta em `benefit_program_eligible_cpf` com join em `benefit_programs` e `benefit_program_event_links`).
- Políticas: `supabase/migrations/20261102090000_create_benefit_programs.sql` (todas as políticas de leitura dessas tabelas estão para `authenticated`).

**Efeito:** erro de consulta no público → fallback sem desconto em `Checkout.tsx` (`benefit_validation_fallback_applied`) → “Subtotal com benefício” sem redução real.

### Causa raiz 2 — Exibição ambígua no resumo público
**O que está quebrado:** texto/estrutura visual sugere benefício aplicado mesmo sem desconto (`Subtotal com benefício` sempre visível).  
**Onde:** `src/pages/public/Checkout.tsx` (bloco de resumo financeiro).  
**Efeito:** percepção de bug visual mesmo quando o cálculo está sem benefício por fallback.

### Causa raiz 3 — Transparência incompleta no resumo final do checkout
**O que está faltando:** no resumo principal (etapa pagamento), faltam nome/tipo/valor de benefício por programa aplicado, apesar de os snapshots possuírem esses dados por passageiro.  
**Onde:** `src/pages/public/Checkout.tsx` (resumo exibe subtotal/desconto agregado, não detalha programa).

---

## 4. Divergências encontradas

### 4.1 Público vs admin
- **Motor de cálculo:** compartilhado (mesma lib de elegibilidade e aplicação).  
- **Acesso a dados:** diferente por contexto de autenticação (admin autenticado vs público anônimo).  
- **Resultado prático:** admin tende a aplicar benefício; público tende a cair em fallback sem benefício quando consulta falha por RLS.

### 4.2 Cálculo vs exibição
- Cálculo usa snapshots por passageiro e impacta `gross_amount`/`benefit_total_discount`.  
- Exibição pública não detalha o benefício no resumo final (nome/tipo), e mantém label “com benefício” mesmo sem desconto.

### 4.3 Checkout vs ticket/PDF
- Checkout público pode não aplicar benefício por falha de elegibilidade (RLS), então nada relevante chega a persistir.  
- Quando aplicado e persistido, ticket virtual e PDF já têm suporte de exibição do benefício.

### 4.4 “Todos os eventos” vs evento específico
- A regra existe e está implementada no filtro final (`applies_to_all_events` dispensa link; caso contrário exige `event_links`).  
- O ponto frágil não é essa regra em si, mas sim o acesso de leitura público que impede chegar nessa decisão no checkout anônimo.

---

## 5. Correção mínima recomendada

> Sem refatorar arquitetura e sem fluxo paralelo.

1. **Criar um único ponto seguro de elegibilidade para uso público e admin**
   - Implementar RPC/Edge com `SECURITY DEFINER` ou função server-side equivalente, retornando apenas os campos necessários para decisão de benefício (sem expor listagem ampla de CPFs).  
   - Reusar esse mesmo endpoint nos dois fluxos (público e admin), mantendo um único motor de regra (`applyBenefitToPrice` / escolha do melhor benefício).

2. **Manter fallback não bloqueante (já existente)**
   - Preservar comportamento de “não travar venda” em erro técnico.

3. **Ajuste mínimo de UI no resumo público**
   - Exibir “Subtotal com benefício” **apenas quando houver desconto > 0**, ou renomear dinamicamente para “Subtotal” quando não houver benefício aplicado.  
   - Quando houver benefício, exibir no resumo: nome do programa (ou “benefício por CPF”), tipo/valor (ex.: 5%), desconto total e subtotal após benefício.

4. **Copy da tela /admin/programas-beneficio (pedido textual)**
   - Troca recomendada para a dica da opção “todos os eventos”:  
   **“Deixe esta opção marcada para aplicar o benefício em todos os eventos.”**

5. **Comentários de código (quando implementar correção)**
   - Documentar no ponto de chamada que o resolvedor é compartilhado público/admin para evitar regressão de lógica duplicada.

---

## 6. Checklist de validação

### Elegibilidade e regra
- [ ] CPF elegível + programa ativo + vigência válida + evento compatível → desconto aplicado.  
- [ ] CPF não elegível → sem desconto.  
- [ ] Vigência vencida (programa ou CPF) → sem desconto.  
- [ ] Programa inativo → sem desconto.  
- [ ] Programa “todos os eventos” sem links → aplica.  
- [ ] Programa por evento específico sem link para o evento atual → não aplica.

### Fluxos
- [ ] Checkout público: resumo mostra claramente programa/desconto quando aplicado.  
- [ ] Venda administrativa: mesmos critérios de elegibilidade/cálculo do público.  
- [ ] Passagem virtual: exibe benefício aplicado quando presente no ticket.  
- [ ] PDF: exibe benefício aplicado quando presente no ticket.

### Persistência
- [ ] `sales.benefit_total_discount` consistente com soma de `sale_passengers.discount_amount`.  
- [ ] Snapshot de benefício copiado para `tickets` na finalização.

---

## 7. Dúvidas abertas (sem assumir)

1. **A consulta pública de elegibilidade hoje falha em produção por RLS em todos os tenants?**  
   Evidência de código indica alto risco, mas a confirmação final depende de log runtime (console/network/edge/supabase logs) no ambiente afetado.

2. **Há telemetria centralizada para `benefit_validation_fallback_applied` no checkout público?**  
   Sem essa trilha operacional agregada, fica difícil medir incidência real por empresa/evento.

3. **A query com múltiplos `.or(...)` em `getEligibleBenefitsByPassenger` está cobrindo exatamente a semântica esperada em PostgREST para todos os casos?**  
   A regra pretendida está clara no código, mas seria prudente validar com teste de integração SQL/RPC para eliminar ambiguidades de composição lógica.

4. **No resumo público, a regra de exibição deve consolidar múltiplos programas (quando houver passageiros com benefícios distintos) em uma linha agregada ou por passageiro?**  
   O snapshot atual é por passageiro; precisa decisão de UX para agregação textual final sem confusão.

---

## Classificação final das falhas

- **Falha de regra de negócio/acesso:** leitura de elegibilidade indisponível para contexto público anônimo nas políticas atuais.  
- **Falha de cálculo:** não foi identificado erro matemático principal no motor; há fallback para preço base quando elegibilidade falha.  
- **Falha de persistência:** pipeline de snapshot (`sale_passengers` → `tickets`) está implementado; problema maior é não aplicar benefício antes de persistir no público.  
- **Falha de UI/exibição:** resumo público tem rótulo ambíguo e detalhamento insuficiente do benefício aplicado.
