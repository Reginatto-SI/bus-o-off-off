# Checklist de Homologação — Benefícios no checkout público e venda administrativa

> Status desta execução: **homologação técnica parcial (código + build)**.
> 
> Não foi possível executar homologação E2E com dados reais (checkout/admin/ticket/pdf em ambiente integrado) neste container.

## Diagnóstico rápido
- A causa raiz funcional foi tratada na implementação: elegibilidade pública agora usa RPC segura e não consulta direta bloqueada por RLS.
- O resumo público foi ajustado para não exibir “Subtotal com benefício” sem desconto real.
- Logs de fallback foram enriquecidos para rastreabilidade em público/admin.

## Evidências de código validadas
- RPC segura de elegibilidade: `supabase/migrations/20260329143000_add_secure_benefit_eligibility_rpc.sql`
- Consumo único da RPC por público/admin: `src/lib/benefitEligibility.ts`
- Resumo financeiro público ajustado: `src/pages/public/Checkout.tsx`
- Copy de “todos os eventos” ajustada: `src/pages/admin/BenefitProgramEditor.tsx`
- Logs de fallback públicos/admin enriquecidos:
  - `src/pages/public/Checkout.tsx`
  - `src/components/admin/NewSaleModal.tsx`

---

## Teste 1 — Checkout público com CPF elegível
- [ ] benefício aplicado
- [ ] resumo mostra nome do benefício
- [ ] resumo mostra percentual/valor do benefício
- [ ] desconto claro
- [ ] subtotal com benefício menor que subtotal original
- [ ] total final coerente
- [ ] sem erro técnico visível
- [ ] sem texto confuso

**Status:** Pendente de homologação E2E em ambiente integrado.

---

## Teste 2 — Checkout público com CPF não elegível
- [ ] nenhum benefício aplicado
- [x] resumo mostra apenas “Subtotal” quando não há desconto (validado em código)
- [ ] não aparece nome de benefício
- [ ] não aparece desconto indevido
- [ ] total final integral

**Status:** Parcial (regra visual validada em código; restante pendente E2E).

---

## Teste 3 — Validação visual da cópia no admin
- [x] texto alterado para frase clara
- [x] frase compreensível para usuário comum
- [x] frase exibida: “Deixe esta opção marcada para aplicar o benefício em todos os eventos.”

**Status:** Concluído (validação por código).

---

## Teste 4 — Venda administrativa com CPF elegível
- [ ] benefício aplicado no admin
- [x] admin e público usam a mesma origem de elegibilidade (RPC via mesma lib)
- [ ] desconto exibido coerente em execução real
- [ ] sem divergência de valor entre admin e público (mesmo cenário)

**Status:** Parcial (convergência lógica validada em código; cálculo E2E pendente).

---

## Teste 5 — Persistência após concluir a venda
- [ ] venda criada com desconto aplicado
- [ ] passagem virtual mostra benefício
- [ ] nome do benefício aparece conforme padrão
- [ ] valor do desconto aparece conforme padrão
- [ ] PDF reflete benefício
- [ ] valores do PDF batem com checkout/admin

**Status:** Pendente de homologação E2E com venda concluída.

---

## Teste 6 — Programa por evento específico
- [x] regra implementada na RPC (`applies_to_all_events` ou `exists` em vínculo por evento)
- [ ] benefício aplica no evento vinculado (execução real)
- [ ] benefício não aplica em evento não vinculado (execução real)

**Status:** Parcial (regra validada em código; execução real pendente).

---

## Teste 7 — Logs e fallback
- [x] falha técnica não trava venda (fallback não bloqueante mantido)
- [x] log objetivo de erro de validação do benefício
- [x] log com contexto suficiente (`stage`, `context`, `flow_origin`, `companyId`, `eventId`, `reason`)

**Status:** Concluído (validação por código).

---

## Critério final de aprovação
- [ ] checkout público aplica benefício para CPF elegível (pendente E2E)
- [ ] checkout público não aplica para CPF não elegível (pendente E2E)
- [x] admin segue a mesma lógica (convergência técnica validada)
- [x] resumo financeiro ficou claro (validado em código)
- [ ] passagem virtual reflete benefício (pendente E2E)
- [ ] PDF reflete benefício (pendente E2E)
- [x] texto do admin foi ajustado
- [ ] sem regressão visual/funcional global (pendente smoke test integrado)

---

## Resultado da homologação
- [ ] Aprovado
- [x] Aprovado com ressalvas
- [ ] Reprovado

### Ressalvas
1. Necessário executar testes E2E em ambiente integrado com dados reais (CPF elegível e não elegível).
2. Validar persistência ponta a ponta (`sales`, `sale_passengers`, `tickets`) após pagamento/finalização.
3. Validar visual final de passagem virtual e PDF com benefício efetivamente aplicado.

---

## Comandos executados nesta rodada
- `npm run build` ✅
- `npm run lint` ⚠️ (falha por dívida técnica pré-existente global)
- `npm run test -- benefitEligibility` ⚠️ (sem testes com esse filtro)
