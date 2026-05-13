# Análise 3 — Venda manual, taxa da plataforma e split SmartBus BR

Data da análise: 2026-05-12

## 1. Resumo executivo

A venda manual administrativa está **parcialmente aderente ao PRD, com risco financeiro relevante**.

O fluxo manual atual calcula o **valor total da taxa da plataforma** de forma próxima à regra oficial: usa snapshots por passageiro, considera preço final após benefício/desconto, usa a função progressiva por item, aplica teto de R$ 25,00 por item por meio de `calculatePlatformFee`, soma as taxas dos passageiros e aplica o piso operacional de R$ 5,00 sobre o total da venda.

Entretanto, a cobrança manual da taxa é criada por `create-platform-fee-checkout` como **cobrança separada em nome da plataforma**, sem `split` no payload do Asaas e sem usar o resolvedor oficial de Marketplace/Sócio/Representante. Na prática, a cobrança separada recebe o valor total da taxa na conta operacional da plataforma e não distribui automaticamente valores para Sócio e Representante.

Também não há snapshot financeiro equivalente ao fluxo público na criação/confirmação da venda manual: os campos `split_snapshot_*` não são preenchidos pelo fluxo manual, o payload técnico registrado contém apenas `{ sale_id }`, e o diagnóstico tende a mostrar ausência de payload de split ou informações parciais. Para representante, existe possibilidade de ledger por fallback legado quando uma venda manual paga passa pela função de comissão, mas esse ledger não nasce de um split efetivo da cobrança manual e depende de campos/snapshots ausentes ou da fórmula legado.

Conclusão objetiva: **a venda manual não cumpre integralmente a regra oficial de divisão entre Marketplace, Sócio e Representante**. A cobrança separada pode continuar existindo como desenho operacional, mas somente se a menor correção futura fizer essa cobrança separar ou registrar de forma inequívoca os recebedores oficiais e os valores efetivos, preferencialmente reutilizando o motor público/shared.

## 2. Arquivos analisados

### Fontes de verdade obrigatórias

- `docs/PRD/PRD 01 — Regra Oficial de Divisão da Taxa entre Marketplace, Sócio e Representante.txt`
- `docs/Analises/analise-1-regra-taxa-split-smartbus.md`
- `docs/Analises/analise-2-ajuste-minimo-publico-taxa-plataforma.md`

### PRDs Asaas considerados

- `docs/PRD/Asaas/02-asaas-fluxo-checkout-e-venda.md`
- `docs/PRD/Asaas/04-asaas-split-comissoes-e-representantes.md`
- `docs/PRD/Asaas/05-asaas-configuracao-empresa-e-validacao.md`
- `docs/PRD/Asaas/06-asaas-operacao-erros-e-diagnostico.md`
- `docs/PRD/Asaas/07-asaas-motor-taxa-e-distribuicao-financeira.md`
- `docs/PRD/Asaas/07-asaas-motor-taxa-distribuicao-financeira.md`

### Código e migrations analisados

- `src/components/admin/NewSaleModal.tsx`
- `src/pages/admin/Sales.tsx`
- `src/pages/admin/SalesDiagnostic.tsx`
- `src/pages/representative/RepresentativeDashboard.tsx`
- `src/lib/feeCalculator.ts`
- `src/lib/platformFeeCheckout.ts`
- `supabase/functions/create-platform-fee-checkout/index.ts`
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/_shared/platform-fee-engine.ts`
- `supabase/functions/_shared/split-recipients-resolver.ts`
- `supabase/functions/_shared/payment-context-resolver.ts`
- `supabase/functions/_shared/payment-finalization.ts`
- `supabase/migrations/20260214215504_991ae50e-3ece-452d-868e-6bb4186af4ff.sql`
- `supabase/migrations/20260308131238_e77be19e-1cb7-4ef5-b54a-327f5514eb6c.sql`
- `supabase/migrations/20260313180000_fix_reserved_fee_transition_rule.sql`
- `supabase/migrations/20260314115028_e9799097-639e-4e16-b59d-c51094fa6771.sql`
- `supabase/migrations/20260317000601_caa381c3-87bf-4b5a-879e-8348a25a6ee7.sql`
- `supabase/migrations/20260411170000_update_representative_commission_one_third_platform_fee.sql`
- `supabase/migrations/20260425120000_align_representative_commission_with_split_snapshot.sql`
- `supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql`
- `supabase/migrations/20261016103000_fix_sales_report_financial_paid_only.sql`
- `supabase/migrations/20261024110000_final_asaas_alignment.sql`
- `supabase/migrations/20261027090000_fix_manual_sales_platform_fee_consolidation.sql`
- `supabase/migrations/20261106090000_create_representatives_phase1_base.sql`
- `supabase/migrations/20261106110000_manual_reconcile_sale_351151a0.sql`

## 3. Fluxo atual da venda manual

1. O administrador abre `/admin/vendas` e cria a venda pelo modal `NewSaleModal`.
2. O modal resolve assentos, evento, trecho, tipo de passagem, benefícios por CPF e taxas adicionais do evento.
3. No submit, a venda manual é inserida em `sales` com:
   - `status = 'reservado'`;
   - `sale_origin = 'admin_manual'`;
   - `gross_amount` com soma dos valores finais dos passageiros mais taxas adicionais da empresa;
   - `platform_fee_amount` calculado no frontend administrativo;
   - `platform_fee_status = 'pending'` quando existe taxa;
   - `payment_environment` explícito pelo runtime.
4. Os tickets são inseridos imediatamente em `tickets`, com snapshots de tipo de passagem e benefício.
5. A venda fica operacionalmente reservada/paga apenas depois da quitação da taxa da plataforma separada.
6. A listagem/detalhe de vendas chama `startPlatformFeeCheckout`, que invoca a Edge Function `create-platform-fee-checkout`.
7. `create-platform-fee-checkout` cria ou reutiliza uma cobrança Pix no Asaas para `platform_fee_amount`, com `externalReference = platform_fee_${sale.id}`.
8. `verify-payment-status` possui fallback para vendas manuais sem `asaas_payment_id` e com `platform_fee_payment_id`; ao confirmar a cobrança da taxa, marca `platform_fee_status = 'paid'`, `platform_fee_paid_at`, `payment_confirmed_at` e `status = 'pago'` quando a venda ainda estava reservada.

## 4. Como a taxa manual é calculada

### 4.1 Por passageiro/item

A venda manual calcula a taxa com base em snapshots por passageiro. O submit chama `resolvePassengerBenefitSnapshots`, que define para cada passageiro:

- `original_price` a partir do tipo de passagem (`ticketTypePrice`) quando existe, ou por preço de categoria/evento;
- `discount_amount` quando há benefício elegível;
- `final_price` como valor financeiro efetivo do item.

Depois, `calculateManualPlatformFeeFromSnapshots` soma `calculatePlatformFee(snapshot.final_price)` para todos os passageiros.

**Resultado:** aderente ao PRD quanto à granularidade por item e ao uso do valor financeiro real após benefício/desconto.

### 4.2 Tipo de passagem, benefício e desconto

O fluxo manual usa o preço do tipo de passagem como prioridade. Quando há benefício por CPF, persiste snapshot individual por ticket (`benefit_program_id`, `benefit_type`, `benefit_value`, `original_price`, `discount_amount`, `final_price`, `benefit_applied`). A base da taxa é `snapshot.final_price`, não o preço cheio.

**Resultado:** aderente para benefícios/descontos, desde que o desconto represente o valor real vendido.

### 4.3 Taxas adicionais da empresa

O `gross_amount` manual é `seatsTotal + feeBreakdown.totalFees * quantity`. Porém a taxa da plataforma manual é calculada sobre os snapshots dos passageiros, sem incluir `feeBreakdown.totalFees`.

**Resultado:** aderente ao PRD para separação de taxas adicionais da empresa.

### 4.4 Teto de R$ 25,00 por item

`calculateManualPlatformFeeFromSnapshots` usa `calculatePlatformFee(snapshot.final_price)`. A análise 2 documenta que `calculatePlatformFee` preserva a regra individual e os testes do frontend público cobrem o teto de R$ 25,00 por passagem. Assim, a venda manual herda o teto por item da função compartilhada de frontend.

**Resultado:** aderente quanto ao teto por item.

### 4.5 Piso operacional de R$ 5,00

O modal soma primeiro as taxas progressivas por passageiro e depois aplica `Math.max(progressiveFee, 5)` quando a empresa tem taxa configurada maior que zero. `create-platform-fee-checkout` também possui defesa backend: se `sale.platform_fee_amount` for menor que R$ 5,00, atualiza a venda para o piso e cobra R$ 5,00.

**Resultado:** aderente quanto ao piso total, não por passageiro.

### 4.6 Diferença em relação ao motor público/shared

Apesar de o valor calculado ser conceitualmente equivalente em cenários simples, a venda manual **não chama** `computeProgressiveFeeForPassengers` de `supabase/functions/_shared/platform-fee-engine.ts`. Ela usa o helper frontend `calculatePlatformFee` e replica no modal a soma mais piso.

**Risco:** baixo para valor em cenários atualmente cobertos, mas relevante para governança, porque o PRD proíbe helpers paralelos divergentes entre venda pública e manual.

## 5. Como a taxa manual é cobrada

A taxa manual é cobrada em **cobrança separada** da passagem.

- Função criadora: `supabase/functions/create-platform-fee-checkout/index.ts`.
- Método: Pix (`billingType: 'PIX'`).
- Valor: `feeAmount`, derivado de `sale.platform_fee_amount` com defesa de piso mínimo.
- Cliente Asaas: customer da empresa, encontrado/criado por CNPJ/documento da empresa.
- Ambiente: resolvido por `resolvePaymentContext({ mode: 'platform_fee', sale })`, ou seja, usa `payment_environment` persistido na venda.
- Referência rastreável: `externalReference = platform_fee_${sale.id}`.
- Vínculo local: `sales.platform_fee_payment_id` recebe `paymentData.id` e `sales.platform_fee_status` controla a pendência/quitação.

A função também tenta evitar duplicidade consultando cobrança existente por `platform_fee_payment_id` ou `externalReference`, reutilizando cobranças pendentes ou bloqueando estados terminais/indeterminados.

**Resultado operacional:** a cobrança separada possui rastreabilidade mínima por `sale_id`, `platform_fee_payment_id`, `externalReference` e logs.

## 6. Existe split efetivo na cobrança manual?

Não foi encontrada evidência de split efetivo na cobrança manual.

O payload de criação da cobrança manual em `create-platform-fee-checkout` contém:

- `customer`;
- `billingType`;
- `value`;
- `dueDate`;
- `description`;
- `externalReference`.

Não contém campo `split`.

Além disso, `create-platform-fee-checkout` não chama:

- `computeProgressiveFeeForPassengers`;
- `distributePlatformFee`;
- `resolveAsaasSplitRecipients`;
- qualquer rotina equivalente que gere Marketplace/Sócio/Representante.

Como a função usa `resolvePaymentContext` em `mode: 'platform_fee'`, a dona operacional da cobrança é a plataforma. Sem payload `split`, o Asaas não distribui automaticamente a taxa entre Sócio e Representante.

**Conclusão:** a cobrança manual separada recebe a taxa total na plataforma. O split oficial entre Marketplace, Sócio e Representante acontece, no máximo, em teoria/documentação, não como split financeiro efetivo no Asaas.

## 7. Existe ledger para Sócio e Representante?

### 7.1 Sócio

Não foi encontrado ledger específico para Sócio compensando vendas manuais.

No fluxo público, a parte do Sócio entra no payload de split e nos snapshots `split_snapshot_socio_fee_amount` quando a cobrança principal é criada por `create-asaas-payment`. Na venda manual, esses snapshots não são preenchidos por `create-platform-fee-checkout`, e a cobrança separada não envia split.

**Conclusão:** sócio ativo não recebe automaticamente sua parte em venda manual, e a parte do sócio inativo não é documentadamente redirecionada por snapshot/diagnóstico; ela fica na plataforma por ausência de split.

### 7.2 Representante

Existe a tabela `representative_commissions` e a RPC `upsert_representative_commission_for_sale`. Essa RPC prioriza `split_snapshot_representative_percent` e `split_snapshot_platform_fee_total`; quando não há snapshot, usa fallback legado baseado em `companies.platform_fee_percent / 3` sobre `gross_amount`.

No fluxo público, `payment-finalization` chama a RPC após confirmação real de pagamento. No fallback manual de `verify-payment-status`, a venda manual confirmada pela taxa separada é atualizada diretamente para paga, mas a rotina mostrada não chama `finalizeConfirmedPayment` e não evidencia chamada à RPC de comissão. Mesmo que outra rotina/reconciliação futura chame a RPC, a venda manual não possui snapshot de split; nesse caso, a comissão do representante cairia no fallback legado, não no valor efetivo da taxa manual.

**Conclusão:** não há evidência suficiente de que a venda manual gere ledger de representante de forma garantida e coerente com a regra oficial. Quando gerar, há risco de valor divergente em cenários com piso, teto, múltiplos itens, descontos ou taxa adicional.

## 8. Comparação venda manual x venda pública

| Aspecto | Venda pública | Venda manual |
|---|---|---|
| Base da taxa | `sale_passengers`/snapshots e motor shared backend | `tickets`/snapshots no modal e helper frontend |
| Cálculo por item | Sim | Sim |
| Benefícios/descontos | Sim | Sim |
| Taxa adicional da empresa fora da base | Sim | Sim |
| Teto R$ 25 por item | Sim | Sim via `calculatePlatformFee` |
| Piso R$ 5 sobre total | Sim após análise 2 | Sim no modal e defesa backend |
| Cobrança | Cobrança principal da venda | Cobrança separada da taxa |
| Payload Asaas com `split` | Sim | Não |
| Resolvedor oficial de recebedores | Sim | Não |
| Snapshot `split_snapshot_*` | Sim | Não evidenciado |
| Sócio ativo recebe efetivamente | Sim, se elegível/wallet válida | Não evidenciado |
| Sócio inelegível redirecionado para Marketplace | Sim pelo resolvedor | Não como decisão explícita; na prática tudo fica na plataforma |
| Representante elegível recebe efetivamente | Sim via split e/ou ledger alinhado ao snapshot | Não evidenciado; ledger pode faltar ou cair no fallback legado |
| Diagnóstico de payload/split | Lê payload, snapshots, ledger e logs | Pode mostrar ausência/parcialidade; payload de taxa não contém split |

## 9. Cenários simulados

### Cenário 1 — Venda manual simples

Entrada:

- passagem: R$ 100,00;
- taxa esperada: R$ 6,00;
- sem representante;
- sócio ativo.

Cálculo manual atual:

- `calculatePlatformFee(100) = 6`;
- soma total = R$ 6,00;
- piso não altera.

Cobrança atual:

- `create-platform-fee-checkout` cobra R$ 6,00 em cobrança Pix separada;
- payload não contém `split`;
- valor efetivo vai para a conta operacional da plataforma.

Esperado PRD:

- Marketplace: R$ 3,00;
- Sócio: R$ 3,00;
- Representante: R$ 0,00.

Conclusão:

- O valor total da taxa bate.
- A divisão efetiva não acontece no Asaas.
- Sócio ativo não recebe automaticamente R$ 3,00.

### Cenário 2 — Venda manual abaixo do mínimo

Entrada:

- passagem: R$ 30,00;
- taxa calculada: R$ 1,80;
- taxa final esperada: R$ 5,00.

Cálculo manual atual:

- `calculatePlatformFee(30) = 1,80`;
- soma total = R$ 1,80;
- piso total eleva para R$ 5,00.

Cobrança atual:

- cobrança separada de R$ 5,00;
- backend também corrige registros legados abaixo do piso para R$ 5,00.

Esperado PRD:

- sem representante + sócio ativo: Marketplace R$ 2,50 e Sócio R$ 2,50;
- sem representante + sócio inativo: Marketplace R$ 5,00.

Conclusão:

- Valor cobrado bate com o piso.
- Não aplica R$ 5,00 por passageiro.
- Divisão não acontece efetivamente, salvo repasse manual externo não evidenciado no sistema.

### Cenário 3 — Venda manual com representante e sócio ativo

Entrada:

- passagem: R$ 100,00;
- taxa esperada: R$ 6,00;
- representante elegível;
- sócio ativo.

Cálculo manual atual:

- taxa total R$ 6,00.

Cobrança atual:

- R$ 6,00 cobrados pela plataforma;
- payload sem split.

Esperado PRD:

- Marketplace: R$ 2,00;
- Sócio: R$ 2,00;
- Representante: R$ 2,00.

Conclusão:

- O valor total pode bater.
- O Asaas não recebe split para sócio/representante.
- Não há garantia de ledger de representante; se houver fallback legado, para R$ 100,00 e taxa 6% tende a coincidir em R$ 2,00, mas isso é coincidência do cenário simples, não prova de aderência.

### Cenário 4 — Venda manual com representante e sócio inativo

Entrada:

- passagem: R$ 100,00;
- taxa esperada: R$ 6,00;
- representante elegível;
- sócio inativo.

Esperado PRD:

- Marketplace: R$ 4,00;
- Sócio: R$ 0,00;
- Representante: R$ 2,00.

Fluxo manual atual:

- cobrança separada de R$ 6,00 sem split;
- não há resolvedor que detecte sócio inativo e registre Marketplace R$ 4,00 / Representante R$ 2,00;
- a parte do representante não é protegida por split efetivo.

Conclusão:

- A inelegibilidade do sócio não bloqueia a cobrança, mas porque o sócio não participa do fluxo.
- A regra crítica de preservar o representante e redirecionar só a parte do sócio não está materializada.

### Cenário 5 — Venda manual com taxa adicional da empresa

Entrada:

- passagem: R$ 100,00;
- taxa adicional da empresa: R$ 6,00;
- total operacional: R$ 106,00;
- taxa esperada da plataforma: R$ 6,00.

Fluxo manual atual:

- `gross_amount = 100 + 6 = 106`;
- taxa da plataforma usa `snapshot.final_price = 100`;
- cobrança separada de R$ 6,00.

Conclusão:

- A base de cálculo está aderente: não calcula a plataforma sobre R$ 106,00.
- Se o ledger de representante cair no fallback legado sobre `gross_amount`, poderá calcular sobre R$ 106,00 e divergir do PRD.

### Cenário 6 — Venda manual com teto

Entrada:

- passagem: R$ 1.000,00;
- taxa calculada bruta: R$ 30,00;
- taxa final esperada: R$ 25,00.

Fluxo manual atual:

- `calculatePlatformFee(1000)` deve retornar R$ 25,00 pelo teto por item;
- cobrança separada de R$ 25,00.

Esperado PRD sem representante + sócio ativo:

- Marketplace: R$ 12,50;
- Sócio: R$ 12,50.

Esperado PRD com representante + sócio ativo:

- Marketplace: R$ 8,34;
- Sócio: R$ 8,33;
- Representante: R$ 8,33, conforme arredondamento do motor.

Conclusão:

- Valor total cobrado tende a bater.
- Split efetivo não acontece.
- Ledger por fallback legado poderia calcular R$ 10,00 para representante em empresa 3%? ou R$ 20,00 em empresa 6% / 3 sobre R$ 1.000,00, dependendo da configuração, divergindo do teto oficial de R$ 25,00 e da parcela de R$ 8,33.

## 10. Divergências encontradas

1. **Cobrança manual não envia `split` ao Asaas.**
   - Diverge da regra oficial de dividir a taxa total entre Marketplace, Sócio e Representante.

2. **Venda manual não usa o resolvedor oficial de recebedores.**
   - Não materializa elegibilidade de sócio, wallet por ambiente, representante e redirecionamentos.

3. **Venda manual não persiste snapshot financeiro equivalente ao fluxo público.**
   - Não há evidência de preenchimento de `split_snapshot_platform_fee_total`, `split_snapshot_socio_fee_amount`, `split_snapshot_platform_net_amount`, `split_snapshot_representative_percent`, `split_snapshot_source` e `split_snapshot_captured_at` no fluxo manual.

4. **Sócio ativo não recebe sua parte automaticamente.**
   - A cobrança separada fica na plataforma sem split.

5. **Representante elegível não recebe comissão efetiva garantida pela cobrança manual.**
   - Não há split no Asaas, e o ledger não é comprovadamente chamado no fallback manual; quando chamado sem snapshot, usa fallback legado.

6. **Ledger do representante pode divergir da taxa oficial.**
   - Sem snapshot, a RPC usa `platform_fee_percent / 3` sobre `gross_amount`, o que diverge em cenários com piso, teto, múltiplos itens, descontos ou taxas adicionais.

7. **Diagnóstico pode indicar ausência ou parcialidade, mas não reconcilia a regra oficial.**
   - A aba de split lê payloads, snapshots, logs e ledger. Para venda manual, o payload da cobrança de taxa não tem split e o snapshot tende a estar ausente.

8. **Há cálculo paralelo no frontend administrativo.**
   - Embora o resultado seja equivalente nos cenários simulados, a regra oficial pede unicidade entre venda pública e manual.

## 11. Riscos financeiros

### Alto risco

- Sócio ativo não receber sua parte em venda manual.
- Representante elegível não receber sua comissão ou receber valor calculado por fallback divergente.
- Marketplace reter valor que deveria ser dividido, criando passivo financeiro com sócios/representantes.
- Cenários com teto/piso/taxas adicionais gerarem ledger diferente da taxa cobrada.

### Risco operacional

- Suporte financeiro depender de `platform_fee_amount` e `platform_fee_payment_id` sem snapshot de recebedores.
- Dificuldade de conciliação: Asaas mostra cobrança da taxa sem split; sistema pode não ter registro de quem deveria receber.
- Reprocessamentos/reconciliações futuras podem gerar comissão com fórmula legado, não com a regra oficial.

### Risco de diagnóstico

- Diagnóstico pode mostrar “sem dados de split” para uma venda manual paga, mesmo que o financeiro precise tratar repasses internos.
- Se existir ledger gerado por fallback, o diagnóstico pode apresentar valor de representante que não aconteceu no Asaas e não foi derivado do split efetivo.

## 12. Decisões de produto pendentes

1. **Manter cobrança separada ou migrar venda manual para a cobrança principal com split?**
   - Cobrança separada não é proibida pelo PRD, mas precisa cumprir a mesma regra financeira.

2. **Se mantiver cobrança separada, ela deve enviar `split` no próprio pagamento da taxa?**
   - Essa é a menor forma de fazer o Asaas materializar Marketplace/Sócio/Representante na cobrança da taxa.

3. **Qual conta deve criar a cobrança separada da taxa quando houver split?**
   - Hoje o fluxo `platform_fee` usa credenciais da plataforma. É preciso validar no Asaas se o split desejado é permitido nesse desenho e quais wallets podem receber.

4. **Representante deve receber via split Asaas, ledger interno, ou ambos com conciliação?**
   - O PRD prioriza split efetivo e ledger coerente; se a decisão for ledger, precisa haver regra explícita de pagamento/repasse.

5. **Sócio sem wallet/inativo em venda manual deve ser registrado em snapshot como redirecionado para Marketplace?**
   - O PRD exige rastreabilidade dos recebedores previstos e efetivos.

6. **Como tratar vendas manuais históricas já pagas sem snapshot?**
   - Pode exigir backfill auditável ou relatório de exceções antes de automatizar repasses.

## 13. Correção mínima recomendada

A menor correção segura para uma etapa futura é **não refatorar a venda manual inteira**, mas centralizar o cálculo/distribuição da taxa antes da cobrança manual:

1. Em `create-platform-fee-checkout`, carregar os tickets/snapshots da venda manual e calcular a taxa com `computeProgressiveFeeForPassengers`, usando os mesmos preços finais dos itens.
2. Comparar o valor calculado com `sales.platform_fee_amount`:
   - se divergente antes da cobrança, atualizar/bloquear com log explícito;
   - se já existir cobrança, não alterar silenciosamente para evitar duplicidade ou divergência.
3. Resolver recebedores com `distributePlatformFee` + `resolveAsaasSplitRecipients`.
4. Montar payload Asaas da cobrança separada com `split` quando tecnicamente permitido.
5. Persistir snapshot financeiro da venda manual no mesmo padrão do fluxo público:
   - total da taxa;
   - parte Marketplace;
   - parte Sócio;
   - percentual/valor do Representante;
   - fonte `create-platform-fee-checkout`;
   - data de captura;
   - evidência de wallets efetivas e inelegibilidades, se houver campos existentes para isso.
6. Registrar em `sale_integration_logs` o payload real enviado ao Asaas, incluindo `split`, e a resposta do gateway.
7. Garantir que `verify-payment-status` ou rotina equivalente gere/atualize ledger de representante a partir do snapshot da venda manual confirmada, não por fallback legado.

Se o Asaas ou o contrato atual não permitir split em uma cobrança criada pela conta da plataforma, a correção mínima alternativa deve ser uma decisão formal de produto: manter cobrança separada na plataforma e criar **ledger/repasse interno obrigatório** para Sócio e Representante, com snapshot e diagnóstico indicando que não houve split Asaas, mas sim obrigação de repasse.

## 14. Arquivos que seriam afetados em uma futura correção

Prováveis arquivos de código:

- `supabase/functions/create-platform-fee-checkout/index.ts`
- `supabase/functions/_shared/platform-fee-engine.ts` apenas se precisar expor helper adicional; idealmente não alterar regra.
- `supabase/functions/_shared/split-recipients-resolver.ts` apenas se precisar aceitar contexto de cobrança manual; idealmente reutilizar sem alterar.
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/_shared/payment-finalization.ts`, se a finalização manual for centralizada.
- `src/components/admin/NewSaleModal.tsx`, para remover/reduzir cálculo paralelo ou apenas exibir preview vindo de helper compartilhado.
- `src/pages/admin/Sales.tsx`, para mensagens de status/ação da taxa se o payload passar a ter split/snapshot.
- `src/pages/admin/SalesDiagnostic.tsx`, para exibir snapshot manual/recebedores efetivos quando persistidos.

Prováveis migrations:

- migration para backfill/consistência de `split_snapshot_*` em vendas manuais futuras;
- migration ou RPC para ledger de representante manual a partir do snapshot;
- eventual ajuste em logs/snapshots se os campos atuais não forem suficientes para wallet efetiva de sócio/representante.

## 15. Testes recomendados

### Testes unitários

1. Motor compartilhado para venda manual:
   - `[30] => R$ 5,00`;
   - `[30, 30] => R$ 5,00`;
   - `[30, 30, 30] => R$ 5,40`;
   - `[100] => R$ 6,00`;
   - `[1000] => R$ 25,00`;
   - `[100] + taxa adicional R$ 6,00 => R$ 6,00`.

2. Distribuição:
   - sem representante + sócio ativo: 50/50;
   - sem representante + sócio inativo: 100/0/0;
   - com representante + sócio ativo: 1/3 cada;
   - com representante + sócio inativo: Marketplace 2/3, Representante 1/3.

### Testes de Edge Function

1. `create-platform-fee-checkout` com venda manual simples deve montar payload com valor correto e `externalReference` rastreável.
2. Quando houver split habilitado, o payload deve conter recebedores esperados e não enviar wallet inválida.
3. Sócio sem wallet não bloqueia a cobrança e redireciona parte para Marketplace.
4. Representante sem wallet não deve quebrar a cobrança, mas deve gerar diagnóstico/pendência explícita conforme decisão de produto.
5. Cobrança existente pendente/paga não pode ser duplicada.
6. Ambiente da cobrança deve ser exatamente `sales.payment_environment`.

### Testes de integração/sandbox

1. Criar venda manual R$ 100,00 sem representante e validar se o Asaas mostra split de R$ 3,00/R$ 3,00 quando a correção existir.
2. Criar venda manual R$ 30,00 e validar cobrança de R$ 5,00 com split sobre R$ 5,00.
3. Criar venda manual R$ 100,00 com representante e sócio ativo e validar R$ 2,00/R$ 2,00/R$ 2,00.
4. Criar venda manual R$ 100,00 com representante e sócio inativo e validar R$ 4,00/R$ 0,00/R$ 2,00.
5. Criar venda manual R$ 100,00 + taxa adicional R$ 6,00 e validar taxa de plataforma sobre R$ 100,00, não R$ 106,00.
6. Criar venda manual R$ 1.000,00 e validar teto de R$ 25,00 e divisão sobre R$ 25,00.

### Testes de diagnóstico

1. Venda manual paga deve exibir taxa calculada, taxa cobrada, recebedores previstos e recebedores efetivos.
2. Payload técnico deve mostrar `externalReference`, `payment_id`, ambiente, split enviado e resposta do Asaas.
3. Ledger de representante deve bater com snapshot/payload, ou ser explicitamente marcado como repasse interno quando não houver split Asaas.

## 16. Conclusão: aderente ou não aderente ao PRD

Classificação: **parcialmente aderente, com risco financeiro relevante**.

Aderências encontradas:

- cálculo por passageiro/item;
- uso do preço financeiro real após benefício/desconto;
- separação de taxas adicionais da empresa;
- teto de R$ 25,00 por item;
- piso operacional de R$ 5,00 sobre a taxa total;
- cobrança separada com vínculo por `sale_id`, `platform_fee_payment_id` e `externalReference`;
- uso do ambiente persistido da venda.

Não aderências ou lacunas relevantes:

- ausência de split efetivo na cobrança manual;
- ausência do resolvedor oficial de Marketplace/Sócio/Representante;
- ausência de snapshot financeiro equivalente ao fluxo público;
- ausência de garantia de repasse ao Sócio;
- ausência de garantia de comissão do Representante conforme a taxa oficial;
- risco de ledger legado divergente;
- diagnóstico insuficiente para comprovar recebedores efetivos em venda manual.

Portanto, a venda manual **não deve ser considerada plenamente aderente** até que a cobrança separada passe a materializar a divisão oficial no Asaas ou, por decisão formal, registre e execute repasses internos auditáveis que reproduzam exatamente a mesma divisão financeira do PRD.
