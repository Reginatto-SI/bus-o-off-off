# Análise Geral — Estado Atual da Implementação de Benefício no Checkout

## 1. Resumo executivo

A funcionalidade de **benefício por passageiro via CPF** está implementada de forma **relevante no checkout público e no momento de criação da cobrança Asaas**, mas o ciclo completo ainda está **incompleto em pós-pagamento/tickets** e com **inconsistência potencial na tela de confirmação**.

Diagnóstico objetivo:

- ✅ Existe modelagem de programas, CPFs elegíveis e vínculo com eventos no banco.
- ✅ Existe motor de elegibilidade e cálculo por passageiro (incluindo desempate pelo benefício mais vantajoso).
- ✅ Checkout aplica benefício por passageiro e persiste snapshot em `sale_passengers`.
- ✅ `create-asaas-payment` valida consistência financeira entre snapshot e total da venda antes de gerar cobrança.
- ⚠️ Na finalização do pagamento, os tickets são gerados **sem copiar snapshot de benefício** e, em seguida, os registros de `sale_passengers` são apagados.
- ⚠️ Isso gera perda de trilha por passageiro no pós-pagamento (auditoria histórica limitada ao agregado em `sales.benefit_total_discount`).
- ⚠️ A tela de confirmação recalcula taxas com `sale.unit_price` (não com preço final com benefício), podendo exibir breakdown divergente do cálculo usado na cobrança.

Resposta direta principal:

- **O benefício está realmente sendo aplicado no checkout hoje?** → **Sim**, com cálculo por passageiro e persistência em `sale_passengers` antes da cobrança.

---

## 2. O que está funcionando

### 2.1 Banco de dados (estrutura de benefício)

- Existe tabela `benefit_programs` com:
  - `benefit_type` (`percentual`, `valor_fixo`, `preco_final`)
  - `benefit_value`
  - `status`, vigência (`valid_from`, `valid_until`), `applies_to_all_events`
  - escopo multiempresa por `company_id`.
- Existe tabela `benefit_program_eligible_cpf` com CPF em 11 dígitos, status e vigência.
- Existe tabela `benefit_program_event_links` para vínculo N:N programa-evento com validação de `company_id`.

### 2.2 Motor de benefício

- Existe `src/lib/benefitEligibility.ts` com:
  - função de aplicação de benefício no preço (`applyBenefitToPrice`);
  - função de seleção do melhor benefício para um passageiro (`resolveBestBenefitForPassengerPrice`);
  - função de consulta de elegibilidade por CPF (`getEligibleBenefitsByPassenger`) considerando status, vigência e vínculo com evento.
- O desempate está determinístico (menor preço final, maior desconto, menor id).

### 2.3 Checkout público

- `Checkout.tsx` resolve snapshot por passageiro com CPF + preço base por assento.
- Exibe desconto total e subtotal com benefício no resumo financeiro.
- Persiste no `sales`:
  - `gross_amount` final da compra
  - `benefit_total_discount` agregado.
- Persiste no `sale_passengers` por passageiro:
  - `benefit_program_id`, `benefit_program_name`, `benefit_type`, `benefit_value`,
  - `original_price`, `discount_amount`, `final_price`, `benefit_applied`, `pricing_rule_version`.

### 2.4 Integração de pagamento (pré-cobrança)

- `create-asaas-payment` carrega `sale_passengers` e:
  - calcula soma de `final_price` (por viagem principal);
  - recalcula taxas;
  - valida se bate com `sales.gross_amount`;
  - valida se `sales.benefit_total_discount` bate com soma de `discount_amount`.
- Em divergência, a função retorna erro e não cria cobrança.

---

## 3. O que está parcialmente implementado

### 3.1 Revalidação dinâmica durante preenchimento

- Ao mudar CPF, o snapshot daquele passageiro é invalidado (`null`), mas o cálculo não é refeito imediatamente em tempo real; ele é resolvido ao avançar para etapa de pagamento (e novamente no submit se necessário).
- Isso é funcional, mas é um comportamento de recalcular por transição de etapa, não “live”.

### 3.2 Persistência pós-pagamento para auditoria longa

- Existe snapshot completo no `sale_passengers` até a confirmação.
- Porém, após gerar tickets, `sale_passengers` é removido, então a trilha detalhada por passageiro não permanece no histórico definitivo do ticket.

### 3.3 Exibição em ticket/confirmação

- O ticket mostra dados do passageiro e valores gerais (ex.: `unitPrice`, `totalPaid`, fees), mas não possui campos específicos de benefício.
- Não há camada explícita de “benefício aplicado” no ticket virtual/PDF.

---

## 4. O que está quebrado ou inconsistente

### 4.1 Perda de snapshot de benefício no fechamento

- `payment-finalization.ts` cria tickets a partir de `sale_passengers`, porém sem copiar campos de benefício para `tickets`.
- Em seguida, apaga `sale_passengers` da venda.
- Resultado: perde-se o snapshot por passageiro no pós-pagamento.

### 4.2 Inconsistência potencial no breakdown da confirmação

- `Confirmation.tsx` recalcula taxas com `sale.unit_price` para montar `feeLines`.
- O checkout/cobrança usa subtotal pós-benefício (derivado de `final_price` de passageiros).
- Logo, existe chance de a decomposição exibida na confirmação não representar exatamente a mesma base usada no cálculo da cobrança.

### 4.3 Lacuna de consistência no webhook/finalização

- A validação forte de consistência (snapshot x gross x desconto) está concentrada no `create-asaas-payment`.
- A finalização (`asaas-webhook` + `payment-finalization`) não reconstrói/revalida benefício por passageiro antes de gerar ticket; ela assume que o pré-cobrança já saneou.
- Não é necessariamente bug imediato, mas é dependência crítica de etapa anterior.

---

## 5. O que existe mas não está sendo usado

- Campos de benefício em `sale_passengers` são completos, mas não são propagados para `tickets`.
- Portanto, para consumo de ticket virtual/PDF e possíveis relatórios por passageiro, esse conjunto de dados fica “morto” após a deleção de `sale_passengers`.
- `sales.benefit_total_discount` existe e é usado para integridade de cobrança, mas não há uso claro desse campo em telas de relatório para segmentação explícita de benefício (os relatórios seguem majoritariamente com `gross_amount` ou fallback `quantity * unit_price`).

---

## 6. Fluxo real atual (end-to-end)

1. **Usuário entra no checkout**
   - Carrega evento, viagem, taxas e assentos.
2. **Preenche passageiros**
   - CPF validado.
   - Ao avançar de “Passageiros” para “Pagamento”, resolve benefício por passageiro via CPF.
3. **Sistema calcula valor**
   - Usa snapshots por passageiro (`final_price`) + taxas para `gross_amount`.
   - Exibe subtotal original, desconto benefício e total.
4. **Cria venda (`sales`)**
   - Salva `gross_amount` e `benefit_total_discount`.
5. **Cria `sale_passengers`**
   - Salva snapshot detalhado do benefício por passageiro.
6. **Gera cobrança (`create-asaas-payment`)**
   - Revalida consistência financeira com base nos snapshots.
   - Se inconsistente, bloqueia cobrança.
7. **Confirma pagamento (webhook/verify/reconcile + payment-finalization)**
   - Marca venda como paga.
   - Gera tickets a partir de `sale_passengers`.
   - **Não copia benefício para tickets**.
   - Remove `sale_passengers`.
8. **Ticket final**
   - Não exibe benefício aplicado.

Resposta objetiva do item 9:

- **Em quais pontos o benefício entra?**
  - Elegibilidade/cálculo no checkout;
  - Persistência temporária em `sale_passengers`;
  - validação de integridade no `create-asaas-payment`.
- **Em quais pontos não entra?**
  - Snapshot em `tickets`;
  - visualização explícita no ticket virtual/PDF;
  - leitura explícita em relatórios/admin orientados a benefício.

---

## 7. Riscos críticos

### 7.1 Divergência frontend vs backend

- **Médio**: confirmação recalcula breakdown com base possivelmente diferente da usada na cobrança (unitário sem benefício vs snapshot pós-benefício).

### 7.2 Cobrança incorreta

- **Baixo a médio** no fluxo principal, porque `create-asaas-payment` tem validações fortes de consistência.
- **Sob controle no pré-cobrança**, desde que essa função seja sempre o gate de geração do pagamento.

### 7.3 Perda de auditoria

- **Alto**: snapshot detalhado por passageiro é apagado após geração de tickets e não é transferido para `tickets`.

### 7.4 Duplicidade de desconto

- **Baixo no cenário atual**: retorno (`VOLTA`) é explicitamente persistido com snapshot zerado para não duplicar total.

### 7.5 Dados mortos

- **Médio/alto**: campos de benefício em `sale_passengers` são ricos, mas viram temporários sem espelho em `tickets`, limitando uso histórico e analítico.

---

## 8. Nível de prontidão (nota de 0 a 10)

**Nota: 6,5 / 10**

Justificativa curta:

- Cálculo e integridade pré-cobrança estão bons.
- Persistência de snapshot por passageiro existe.
- Falta fechar o ciclo pós-pagamento/auditoria em tickets e harmonizar exibição financeira da confirmação com a regra efetiva de cobrança.

---

## 9. Recomendação estratégica

### Vale corrigir o que existe ou reimplementar?

- **Recomendação: corrigir e completar o que já existe (não reimplementar do zero).**

Motivo:

- A base atual (modelo + motor + checkout + validação de cobrança) já está madura e coerente.
- O principal gap está no **pós-pagamento e observabilidade histórica** (propagação/sobrevivência do snapshot), não no núcleo de cálculo.
- Reimplementação ampla aumenta risco sem ganho proporcional neste momento.

---

## Respostas diretas às perguntas-chave

- **Quais campos de benefício existem hoje?**
  - Em `sale_passengers`: `benefit_program_id`, `benefit_program_name`, `benefit_type`, `benefit_value`, `original_price`, `discount_amount`, `final_price`, `benefit_applied`, `pricing_rule_version`.
  - Em `sales`: `benefit_total_discount`.
- **Existe snapshot por passageiro?**
  - Sim, em `sale_passengers`.
- **Existe snapshot no ticket?**
  - Não.
- **O benefício está realmente sendo aplicado no checkout hoje?**
  - Sim.
- **`sale_passengers` recebe os campos de benefício/preço corretamente?**
  - Sim, no fluxo público analisado.
- **Existe risco de cobrar valor diferente do mostrado?**
  - No gate de cobrança Asaas, risco mitigado por validação de integridade; porém existe risco de divergência de exibição no pós-checkout (tela de confirmação).
