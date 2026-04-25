# Análise 59 — Benefício de CPF nos checkouts público e administrativo

## Resumo executivo

- O checkout público (`/checkout`) já persistia e exibia benefício por passageiro com `benefit_program_name`, `discount_amount`, `benefit_applied`, além de subtotal original, desconto consolidado e subtotal com benefício.
- O fluxo administrativo (`/admin/vendas` via `NewSaleModal`) persistia **sempre sem benefício** (campos `benefit_*` nulos/zero), não exibia nome/valor por passageiro e não mostrava desconto consolidado no resumo.
- A regra “benefício é por CPF individual (não por compra)” já estava explícita no motor de elegibilidade (`resolvePassengerBenefitPrice` por CPF), mas não estava aplicada no fluxo admin.
- Correção aplicada: integração não bloqueante do motor de benefício por passageiro no admin, persistência do snapshot por ticket, exibição por passageiro e resumo consolidado de desconto no fluxo administrativo.

## Diagnóstico do comportamento anterior

### Checkout público

Evidências de que já havia transparência visual e persistência:

- Snapshot local tipado com os campos necessários (`benefit_program_name`, `discount_amount`, `benefit_applied`, `original_price`, `final_price`).
- Fallback explícito para preço base em erro técnico na validação de benefício.
- Exibição no resumo financeiro: subtotal original, desconto de benefício, subtotal com benefício.
- Exibição por passageiro no acordeão de dados.

Conclusão: no checkout público, os dados e a UI já estavam em nível adequado de transparência.

### Checkout administrativo (`/admin/vendas`)

Evidências do problema antes da correção:

- Na criação dos tickets em `NewSaleModal`, os campos de benefício eram gravados fixos em `null/0/false`.
- Não havia resolução de benefício por CPF no fluxo admin antes da persistência.
- Não havia bloco visual por passageiro com nome/valor do benefício.
- Não havia resumo financeiro explícito de desconto por benefício no admin.

Conclusão: o gap estava no fluxo admin (dados e renderização), não no motor base de benefício.

## Diferença entre checkout público e admin (antes)

- Público: cálculo + persistência + exibição por passageiro + resumo consolidado.
- Admin: sem cálculo de benefício por CPF, sem persistência real de benefício e sem transparência visual.

## Causa raiz da ausência visual

- Não era ausência estrutural de dado no backend/snapshot.
- Era ausência de integração do fluxo admin com a resolução de benefício por CPF e ausência de renderização desses dados no `NewSaleModal`.

## Correção aplicada

### 1) Cálculo não bloqueante por passageiro no admin

Implementada resolução de snapshot de benefício por passageiro no `NewSaleModal`, reutilizando `resolvePassengerBenefitPrice`.

Regras aplicadas:

- cálculo individual por passageiro (CPF);
- fallback seguro por passageiro em erro técnico (preço base, sem benefício);
- sem bloquear confirmação/criação da venda.

### 2) Persistência correta do snapshot em tickets

Cada ticket agora persiste seu próprio snapshot:

- `benefit_program_id`
- `benefit_program_name`
- `benefit_type`
- `benefit_value`
- `original_price`
- `discount_amount`
- `final_price`
- `benefit_applied`
- `pricing_rule_version`

Além disso, a venda passa a receber `benefit_total_discount` consolidado no insert.

### 3) Transparência visual no admin

No passo de dados dos passageiros (`step 3`):

- quando o benefício for aplicado, exibe bloco por passageiro com:
  - nome do benefício;
  - valor do desconto;
  - preço original;
  - preço final.

No resumo financeiro do admin:

- subtotal original;
- descontos de benefícios (quando aplicável);
- subtotal com benefício.

### 4) Consistência e não contaminação entre passageiros

- Ao alterar o CPF de um passageiro, somente o snapshot desse passageiro é invalidado (não contamina os demais).
- Recalcula benefícios em `step 3` para manter UI sincronizada e por passageiro.

## Regra de negócio crítica — benefício é por CPF, não por compra

Aplicação prática após ajuste:

- benefício é avaliado por CPF de cada passageiro;
- apenas passageiros elegíveis recebem desconto e visualização;
- passageiros não elegíveis não exibem ruído visual;
- resumo consolidado soma somente descontos realmente aplicados.

## Perguntas obrigatórias respondidas

1. **Hoje o nome do benefício já é exibido no checkout público?**  
   Sim.
2. **Hoje o nome do benefício já é exibido no fluxo admin?**  
   Antes não; após esta correção, sim.
3. **Hoje o valor do desconto já é exibido explicitamente?**  
   Público: sim; Admin: passou a sim após esta correção.
4. **Benefício aparece por passageiro, no resumo geral, nos dois, ou em nenhum?**  
   Público já tinha ambos; Admin passou a ter ambos.
5. **Backend/snapshot já entrega tudo que a UI precisa?**  
   Sim. O modelo já comportava os campos necessários.
6. **A regra “por CPF, não por compra” já estava respeitada e clara?**  
   No motor sim; no admin não estava aplicado. Agora está aplicado e comentado.
7. **Se não aparecia, era ausência de dado ou de renderização?**  
   Principalmente ausência de integração/renderização no admin.
8. **Há risco de reintroduzir bloqueio no checkout público/admin?**  
   Risco mitigado: o admin usa fallback por passageiro em erro técnico e mantém confirmação da venda sem dependência bloqueante do benefício.

## Validações realizadas

- Auditoria estática de fluxo público (`Checkout.tsx`) e fluxo admin (`NewSaleModal.tsx`).
- Validação de uso dos campos de snapshot e pontos de renderização.
- Validação de fallback não bloqueante no novo fluxo admin.
- Teste automatizado executado: `vitest` (teste base do projeto).

## Riscos avaliados

- **Risco principal:** divergência financeira entre subtotal com benefício e componentes de taxa (simulação de cálculo existente usa `unitPrice` como base).  
  **Mitigação:** ajuste foi mínimo/local, sem alterar arquitetura de taxas/pagamento, e preservando compatibilidade do fluxo existente.
- **Risco de bloqueio:** baixo, pois o cálculo de benefício no admin está protegido por fallback por passageiro.
- **Risco de regressão visual:** baixo, pois foram reutilizados padrões visuais já existentes no checkout público (bloco compacto e resumo textual).

## Ambiguidades registradas

- O `CalculationSimulationCard` do admin permanece como simulação padrão baseada no `unitPrice` informado (não foi refatorado para detalhar benefício por passageiro dentro do próprio card), para manter escopo mínimo e evitar impacto arquitetural fora da transparência solicitada.
