# Análise 1 — Regra de taxa, base de cálculo e split financeiro no SmartBus BR

Data da análise: 2026-05-12

## 1. Resumo executivo

A implementação atual está **parcialmente aderente** ao PRD oficial, mas **precisa de ajuste antes de ser considerada financeiramente confiável ponta a ponta**.

Pontos aderentes encontrados:

- O checkout público usa um motor progressivo por passageiro/item no backend (`computeProgressiveFeeForPassengers`) com faixas de 6%, 5%, 4% e 3% e teto de R$ 25,00 por passageiro/item.
- O checkout público separa a base de cálculo da taxa da plataforma dos valores de taxas adicionais do evento: a taxa progressiva é calculada a partir dos snapshots dos passageiros, enquanto as taxas adicionais entram apenas na validação do total bruto cobrado.
- Tipos de passagem/pacotes com preço próprio são considerados no snapshot financeiro público por `ticket_type_price`, com fallback para `final_price` quando há benefício/desconto.
- O payload Asaas da venda pública usa `split` em percentual operacional convertido a partir dos valores em reais calculados pelo motor financeiro.
- Wallet inválida/ausente de sócio ou representante não é enviada ao Asaas pelo resolvedor de split.
- O diagnóstico administrativo lê payload, snapshot e ledger para comparação.

Divergências e riscos objetivos encontrados:

1. **Mínimo operacional de R$ 5,00 não está aplicado na venda pública**. O motor backend público soma a taxa progressiva com teto, mas não eleva o total para R$ 5,00 quando a soma fica abaixo do mínimo. O frontend público também não aplica esse mínimo ao repassar a taxa ao cliente.
2. **Venda manual usa outro fluxo financeiro**. Em `/admin/vendas`, a taxa da plataforma é calculada e cobrada em uma cobrança separada (`create-platform-fee-checkout`) contra a conta da plataforma, sem o mesmo payload/split entre Marketplace, Sócio e Representante da venda pública.
3. **Snapshot financeiro da venda pública não guarda representante em valor monetário**. O snapshot salva `split_snapshot_platform_fee_total`, `split_snapshot_socio_fee_amount` e `split_snapshot_platform_net_amount`, mas não há campo equivalente para `representative_amount`; o diagnóstico depende do ledger para representar o valor do representante.
4. **Ledger de representante calcula comissão por fórmula percentual sobre `gross_amount`**, usando `company.platform_fee_percent / 3`, e não necessariamente a partir do snapshot da taxa oficial da venda. Isso diverge em cenários com teto por item, taxa mínima, múltiplos itens em faixas diferentes e taxas adicionais no total bruto.
5. **Diagnóstico pode exibir sócio no snapshot mesmo quando a wallet do sócio não foi enviada ao Asaas**, porque usa `split_snapshot_socio_fee_amount` sem persistir wallet/efetividade do recebedor no snapshot.
6. **Serviços avulsos em `ServiceSales` não passam pelo motor oficial de taxa/split**. Como o PRD de serviços diz que o módulo não altera o fluxo de passagens, a inclusão ou não de serviços avulsos na taxa da plataforma ainda precisa de decisão de produto; já serviços vinculados que componham o produto vendido estão previstos no PRD financeiro, mas o código analisado não demonstrou um caminho unificado claro para isso.

Conclusão: **não está 100% aderente ao PRD oficial**. A correção mínima recomendada deve começar pelo motor oficial público/shared, aplicando o mínimo de R$ 5,00 depois da soma por item e antes da divisão, e depois alinhar manual, ledger e diagnóstico com a mesma fonte de verdade. Como há impacto financeiro em múltiplos fluxos, esta análise **não implementa correção de regra**, apenas documenta causa, risco e plano mínimo.

## 2. Arquivos analisados

### PRDs e documentação

- `docs/PRD/PRD 01 — Regra Oficial de Divisão da Taxa entre Marketplace, Sócio e Representante.txt`
- `docs/PRD/Asaas/07-asaas-motor-taxa-e-distribuicao-financeira.md`
- `docs/PRD/Asaas/07-asaas-motor-taxa-distribuicao-financeira.md`
- `docs/PRD/Asaas/04-asaas-split-comissoes-e-representantes.md`
- `docs/PRD/Telas/prd-admin-vendas.md`
- `docs/PRD/Telas/prd-public-checkout.md`
- `docs/PRD/Telas/PRD — Módulo de Passeios & Serviços (SmartBus BR).md`
- `docs/Analises/analise-1-taxa-progressiva-asaas.md`
- `docs/Analises/analise-3-implementacao-motor-taxa-distribuicao.md`
- `docs/Analises/analise-venda-manual-piso-minimo-taxa-plataforma.md`
- `docs/Analises/analise-validacao-final-taxa-zero-split-asaas.md`

### Frontend/admin/público

- `src/lib/feeCalculator.ts`
- `src/lib/feeCalculator.test.ts`
- `src/lib/checkoutFinancialIntegrity.test.ts`
- `src/pages/public/Checkout.tsx`
- `src/pages/public/Confirmation.tsx`
- `src/components/admin/NewSaleModal.tsx`
- `src/pages/admin/Sales.tsx`
- `src/pages/admin/SalesDiagnostic.tsx`
- `src/pages/admin/Events.tsx`
- `src/pages/admin/ServiceSales.tsx`
- `src/pages/representative/RepresentativeDashboard.tsx`

### Edge Functions e helpers compartilhados

- `supabase/functions/_shared/platform-fee-engine.ts`
- `supabase/functions/_shared/checkout-financial-integrity.ts`
- `supabase/functions/_shared/split-recipients-resolver.ts`
- `supabase/functions/_shared/payment-context-resolver.ts`
- `supabase/functions/_shared/payment-finalization.ts`
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/create-platform-fee-checkout/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/reconcile-sale-payment/index.ts`

### Banco/migrations

- `supabase/migrations/20260424120000_add_sales_split_snapshot_asaas.sql`
- `supabase/migrations/20260411170000_update_representative_commission_one_third_platform_fee.sql`
- `supabase/migrations/20261106090000_create_representatives_phase1_base.sql`
- `supabase/migrations/20260426143000_create_sale_service_items_and_service_qr.sql`
- `supabase/migrations/20261027090000_fix_manual_sales_platform_fee_consolidation.sql`
- `supabase/migrations/20261028100000_add_company_referral_progress_engine.sql`

## 3. Fluxos analisados

| Fluxo | Resultado da análise |
|---|---|
| Checkout público da vitrine/evento | Usa motor progressivo e split Asaas, mas não aplica mínimo de R$ 5,00. |
| Venda manual administrativa `/admin/vendas` | Calcula taxa progressiva com mínimo no modal, mas cobra taxa em fluxo separado, sem split Marketplace/Sócio/Representante no Asaas. |
| Criação de cobrança Asaas | Venda pública monta payload com split. Taxa manual cria cobrança separada sem split. |
| Payload enviado ao Asaas | Público converte valores de split para percentuais sobre gross. Manual envia apenas valor da taxa ao customer da empresa na conta da plataforma. |
| Snapshot financeiro | Público congela total, sócio e marketplace; não congela valor do representante. Manual depende de `platform_fee_amount/platform_fee_total`. |
| Diagnóstico | Compara payload/snapshot/ledger, mas tem lacunas para recebedor efetivo e representante. |
| Ledger representante | Calculado por função SQL com base em percentual da empresa sobre valor bruto, não necessariamente pelo snapshot oficial. |
| Simulações visuais | Admin e checkout usam helper frontend progressivo com teto; mínimo só aparece no fluxo manual. |
| Tipos de passagem | Considerados no público via `ticket_type_price`; manual usa snapshots/fallback por assento/categoria. |
| Serviços | Serviços avulsos ficam fora do motor; serviços vinculados ao produto precisam de regra operacional mais explícita. |
| Taxas adicionais da empresa | Públicas entram no gross/validação, mas não na base da taxa da plataforma. |
| Múltiplos passageiros | Público calcula por passageiro no backend; frontend público também evita média. Manual soma snapshots por passageiro. |
| Sandbox vs produção | Resolvedores escolhem wallet por ambiente; regra de cálculo é a mesma, exceto por fluxo manual separado. |

## 4. Fonte atual da regra de cálculo

### Fonte oficial no PRD

O PRD oficial determina:

- cálculo por passagem/item vendido;
- faixas: até R$ 100,00 = 6%; acima de R$ 100,00 até R$ 300,00 = 5%; acima de R$ 300,00 até R$ 600,00 = 4%; acima de R$ 600,00 = 3%;
- teto de R$ 25,00 por passagem/item;
- mínimo operacional de R$ 5,00 sobre a taxa total antes da divisão;
- separação de taxas adicionais da empresa da base da taxa da plataforma;
- aplicação uniforme em venda pública, venda manual, snapshot, payload Asaas, diagnóstico e ledger.

### Fonte no código público/backend

A fonte mais próxima da regra oficial hoje é `supabase/functions/_shared/platform-fee-engine.ts`:

- `TIERS` define as faixas progressivas.
- `PASSENGER_FEE_CAP_BRL = 25` define teto por passageiro.
- `computeProgressiveFeeForPassengers(unitPrices)` calcula item a item e soma.
- `distributePlatformFee(...)` divide o total entre marketplace/sócio/representante de forma determinística.
- `amountToGrossPercent(...)` converte valores em reais para percentual operacional do Asaas.

Divergência: esse helper **não aplica mínimo operacional de R$ 5,00**.

### Fonte no código frontend

`src/lib/feeCalculator.ts` replica a regra visual:

- `resolvePlatformFeePercentByTicketPrice(unitPrice)` resolve a faixa.
- `calculatePlatformFee(unitPrice)` aplica percentual e teto de R$ 25,00.
- `calculateFees(...)` adiciona a taxa da plataforma ao total do cliente quando `passToCustomer` está ativo.
- `calculateSeatsTotal(...)` ainda calcula taxas por preço médio de assentos, mas o checkout público atual usa cálculo por snapshot em `Checkout.tsx`; portanto, esse helper pode ser legado/perigoso se reutilizado em outro fluxo.

Divergência: esse helper visual **também não aplica mínimo de R$ 5,00** no fluxo público. Na venda manual, o mínimo é aplicado fora dele, dentro do modal.

## 5. Fonte atual da regra de split

### Fonte oficial no PRD

A tabela oficial é:

| Cenário | Marketplace | Sócio | Representante |
|---|---:|---:|---:|
| Sem representante + sócio ativo | 1/2 | 1/2 | 0 |
| Sem representante + sócio inativo | 1 | 0 | 0 |
| Com representante + sócio ativo | 1/3 | 1/3 | 1/3 |
| Com representante + sócio inativo | 2/3 | 0 | 1/3 |

### Fonte no código

A fonte operacional é composta por:

- `distributePlatformFee(...)`, que divide valores monetários em 50/50 ou 1/3 quando recebe `representativeEligible`.
- `resolveAsaasSplitRecipients(...)`, que valida sócio e representante, remove recebedores sem wallet e redistribui percentuais inelegíveis.
- `create-asaas-payment`, que faz uma pré-resolução, decide elegibilidade do representante, calcula a distribuição monetária e chama o resolvedor novamente com percentuais operacionais por recebedor.

A estratégia é correta em intenção, mas tem pontos frágeis:

- A elegibilidade do representante é descoberta com uma pré-resolução que usa percentuais iguais ao total da taxa para os três recebedores. Isso é uma técnica de descoberta, mas exige cuidado de auditoria porque não representa a distribuição final.
- Quando representante está inelegível, `redistributeRepresentativeWhenUnavailable` redistribui a parte do representante para plataforma/sócio. O PRD não detalha o que fazer com a parte de representante inelegível; ele só é claro sobre sócio inelegível. Isso deve ficar como decisão de produto.
- A ausência de wallet do sócio é redirecionada para a plataforma, aderente ao PRD.
- A ausência de wallet do representante não envia wallet inválida ao Asaas, aderente à regra de não enviar wallet inválida, mas a política de absorção da parte do representante precisa ser confirmada.

## 6. Lista de helpers/funções envolvidos

| Helper/função | Arquivo | Papel | Observação |
|---|---|---|---|
| `resolveTierPercent` | `_shared/platform-fee-engine.ts` | Resolve 6/5/4/3 por preço unitário. | Aderente. |
| `computeProgressiveFeeForPassengers` | `_shared/platform-fee-engine.ts` | Calcula taxa por passageiro com teto. | Falta mínimo R$ 5,00. |
| `distributePlatformFee` | `_shared/platform-fee-engine.ts` | Divide taxa total entre partes. | Não recebe elegibilidade de sócio diretamente; só representante. |
| `amountToGrossPercent` | `_shared/platform-fee-engine.ts` | Converte valor em percentual do gross para Asaas. | Necessário porque Asaas recebe percentual. |
| `resolveAsaasSplitRecipients` | `_shared/split-recipients-resolver.ts` | Monta recebedores efetivos por ambiente/wallet. | Central para Asaas. |
| `validateFinancialSocioForSplit` | `_shared/payment-context-resolver.ts` | Valida sócio ativo/wallet. | Evita wallet inválida. |
| `resolvePaymentContext` | `_shared/payment-context-resolver.ts` | Escolhe ambiente, owner e política de split. | Manual taxa usa `mode: platform_fee`, sem split. |
| `resolvePassengerFinancialUnitPrice` | `_shared/checkout-financial-integrity.ts` | Define preço financeiro do passageiro. | Considera tipo de passagem e benefício. |
| `calculateFeesTotal` | `_shared/checkout-financial-integrity.ts` | Soma taxas adicionais e taxa repassada. | Usa total progressivo recebido; não aplica mínimo. |
| `buildCheckoutFinancialIntegritySnapshot` | `_shared/checkout-financial-integrity.ts` | Valida gross x passageiros + taxas. | Boa blindagem, mas depende do motor sem mínimo. |
| `calculatePlatformFee` | `src/lib/feeCalculator.ts` | Estimativa visual por item com teto. | Falta mínimo no público. |
| `calculateFees` | `src/lib/feeCalculator.ts` | Estimativa visual de taxas adicionais + plataforma. | Taxa adicional separada da plataforma. |
| `calculateManualPlatformFeeFromSnapshots` | `NewSaleModal.tsx` | Calcula taxa manual por passageiro + mínimo. | Fluxo manual separado do público. |
| `upsert_representative_commission_for_sale` | migration SQL | Grava ledger de representante. | Base atual diverge do snapshot oficial em cenários críticos. |

## 7. Verificação da venda pública

### Como funciona

1. O checkout público resolve snapshots por passageiro.
2. `calculateTotalsFromSnapshots` soma `final_price` dos passageiros.
3. Taxas adicionais e eventual repasse da taxa de plataforma ao cliente são somados em `totalFees` por passageiro.
4. A venda é inserida em `sales` com `gross_amount`.
5. Os passageiros são inseridos em `sale_passengers` com preço final, tipo e preço do tipo.
6. `create-asaas-payment` carrega os passageiros, calcula a taxa oficial via motor progressivo e valida integridade financeira.
7. O payload Asaas é criado com `value = grossAmount` e `split = splitArray`.
8. A venda recebe snapshot financeiro.

### Aderências

- Base da taxa vem dos passageiros, não do gross total.
- Taxas adicionais entram no gross e na validação, mas não alteram a base do motor progressivo.
- Tipos de passagem são persistidos e considerados.
- Múltiplos passageiros são calculados individualmente.
- Teto de R$ 25,00 é por passageiro/item.

### Divergência

- Mínimo operacional de R$ 5,00 não é aplicado. Exemplo: passageiro de R$ 30,00 gera R$ 1,80 em `computeProgressiveFeeForPassengers`; esse valor segue para `amountToGrossPercent`, split e snapshot. O PRD exige elevar para R$ 5,00 antes da divisão.

## 8. Verificação da venda manual

### Como funciona

- `NewSaleModal.tsx` calcula a taxa manual por snapshots de passageiros com `calculatePlatformFee(snapshot.final_price)`.
- Se a empresa tem taxa configurada maior que zero, aplica `ASAAS_MIN_PLATFORM_FEE_AMOUNT` de R$ 5,00 quando a taxa progressiva fica abaixo do piso.
- A venda nasce com `platform_fee_amount` e `platform_fee_status = pending`.
- O pagamento da taxa é aberto por `create-platform-fee-checkout`.
- `create-platform-fee-checkout` valida o mínimo novamente no backend e cria uma cobrança Pix separada na conta da plataforma, com `externalReference = platform_fee_<sale_id>`.

### Aderências

- Manual aplica mínimo de R$ 5,00.
- Manual calcula por passageiro/snapshot.
- Manual aplica teto por item via `calculatePlatformFee`.

### Divergência

- A venda manual não usa o mesmo fluxo financeiro da venda pública. A taxa é cobrada separadamente e não passa pelo mesmo payload de split Marketplace/Sócio/Representante.
- Isso viola a regra de ouro do PRD: não pode existir uma regra para venda pública e outra para venda manual.
- Se a venda manual tiver representante/sócio elegível, não foi encontrado split efetivo da cobrança da taxa manual para esses recebedores.

## 9. Verificação de tipos de passagem

### Público

Aderente em grande parte:

- O checkout persiste `ticket_type_id`, `ticket_type_name` e `ticket_type_price` em `sale_passengers`.
- `resolvePassengerFinancialUnitPrice` usa `ticket_type_price` como fonte quando não há benefício/desconto.
- Quando há benefício/desconto, preserva `final_price`, evitando cobrar taxa sobre preço cheio quando o produto vendido foi efetivamente descontado.

### Manual

Parcialmente aderente:

- O modal calcula snapshots por passageiro e usa preço final.
- Para venda manual em assentos/categorias, há lógica de fallback por preço base/categoria.
- Não foi encontrada, nesta análise, a mesma clareza de persistência/uso de `ticket_type_price` em todos os caminhos manuais equivalentes ao público.

## 10. Verificação de serviços

### Serviços vinculados ao produto vendido

O PRD financeiro cita “serviço vinculado que componha o produto vendido” como possível base da taxa. No código analisado, a venda pública principal calcula a taxa sobre `sale_passengers` primários. Não encontrei uma integração clara que acrescente serviços vinculados ao produto vendido na base do motor oficial da venda pública.

Resultado: **ponto ambíguo/pendente**. É necessário Produto confirmar quais serviços devem compor o produto principal e como isso deve aparecer no snapshot financeiro.

### Serviços avulsos/opcionais

`ServiceSales.tsx` cria venda de serviço em `sales` e itens em `sale_service_items`, mas não invoca `create-asaas-payment`, `platform-fee-engine` ou split oficial para cobrar/distribuir taxa da plataforma. O PRD de serviços diz que o módulo deve funcionar sem alterar o fluxo de passagens, o que sugere que o escopo ainda é operacional e não financeiro completo.

Resultado: **não assumir nova regra**. Deve ser decisão de produto se serviços avulsos geram taxa de plataforma e split.

## 11. Verificação de taxas adicionais

A implementação pública trata taxas adicionais corretamente em relação à base da plataforma:

- `event_fees` são carregadas separadamente.
- `calculateFeesTotal` soma taxas fixas/percentuais por passageiro.
- A taxa da plataforma progressiva é recebida separadamente em `progressivePlatformFeeTotal`.
- O motor oficial calcula a taxa da plataforma a partir dos preços dos passageiros (`passengerUnitPrices`), não do `grossAmount`.

Cenário obrigatório 2:

- passagem base R$ 100,00;
- taxa adicional R$ 6,00;
- total cliente R$ 106,00;
- taxa oficial esperada R$ 6,00.

Com a implementação atual pública, o motor progressivo calcularia a plataforma sobre R$ 100,00 e a taxa adicional entraria apenas no gross/validação. Portanto, **este cenário está aderente**, exceto se o mínimo/teto ou split posterior entrar em conflito.

## 12. Verificação de mínimo de R$ 5,00

### PRD

O mínimo deve ser aplicado sobre a taxa total da plataforma antes da divisão e em todos os fluxos.

### Código

- Público/backend: **não aplica**.
- Público/frontend: **não aplica**.
- Manual/frontend: aplica.
- Manual/backend: aplica defesa em profundidade em `create-platform-fee-checkout`.

### Resultado por cenário obrigatório 3

Passagem R$ 30,00:

| Fluxo | Resultado atual provável | Esperado PRD |
|---|---:|---:|
| Público | R$ 1,80 | R$ 5,00 |
| Manual | R$ 5,00 | R$ 5,00 |

Divergência objetiva: **sim**.

## 13. Verificação de teto de R$ 25,00 por item

### PRD

O teto deve ser aplicado por passagem/item, não uma única vez sobre a venda inteira.

### Código

- Backend público: `computeProgressiveFeeForPassengers` aplica `Math.min(uncappedFeeCents, PASSENGER_FEE_CAP_BRL)` por item do array.
- Frontend: `calculatePlatformFee(unitPrice)` aplica `Math.min(uncapped, 25)` por chamada/item.
- Manual: soma `calculatePlatformFee(snapshot.final_price)` por passageiro.

Cenário obrigatório 4:

- R$ 1.000,00 → 3% = R$ 30,00 → teto R$ 25,00.

Cenário obrigatório com duas passagens de R$ 1.000,00:

- Atual: R$ 25,00 + R$ 25,00 = R$ 50,00.
- Esperado: R$ 50,00.

Resultado: **aderente**.

## 14. Verificação de snapshot financeiro

### Público

`create-asaas-payment` salva:

- `split_snapshot_platform_fee_percent`
- `split_snapshot_socio_split_percent`
- `split_snapshot_representative_percent`
- `split_snapshot_platform_fee_total`
- `split_snapshot_socio_fee_amount`
- `split_snapshot_platform_net_amount`
- `split_snapshot_source`
- `split_snapshot_captured_at`

### Problemas

- O snapshot não salva `representative_amount`; salva apenas percentual do representante.
- O snapshot de sócio não guarda wallet efetiva nem flag de inclusão efetiva.
- `split_snapshot_socio_split_percent` é salvo como 33,33 ou 50 com base na elegibilidade do representante, mas não reflete necessariamente se o sócio foi efetivamente enviado ao Asaas.
- Se sócio estiver inelegível, a distribuição monetária pode redirecionar a parte para Marketplace, mas o diagnóstico visual por snapshot pode ficar incompleto sem evidência explícita de recebedor efetivo.

Resultado: **parcialmente aderente**, com risco de auditoria.

## 15. Verificação de payload Asaas

### Venda pública

O payload principal contém:

- `value: grossAmount`
- `externalReference: sale.id`
- `split: splitArray`

O split usa percentuais calculados por `amountToGrossPercent(valor_do_recebedor, grossAmount)`. Isso é coerente com uma limitação operacional do Asaas quando o split é percentual sobre a cobrança bruta.

Observação: o diagnóstico deve explicar que esses percentuais não são “percentuais comerciais da taxa”, mas conversão técnica dos valores de split para percentual do `grossAmount`. A análise do diagnóstico indica que o payload é lido, mas essa explicação ainda pode não estar suficientemente explícita para suporte/financeiro.

### Venda manual

`create-platform-fee-checkout` cria cobrança com:

- `billingType: PIX`
- `value: feeAmount`
- `externalReference: platform_fee_<sale_id>`
- sem `split`.

Divergência: manual não envia split efetivo de Marketplace/Sócio/Representante.

## 16. Verificação do diagnóstico administrativo

O diagnóstico em `SalesDiagnostic.tsx` faz bom esforço de conciliação:

- identifica recebedores por wallet do payload;
- lê logs de integração;
- exibe snapshot da venda;
- lê ledger de representante;
- compara payload x snapshot quando há valores.

Pontos frágeis:

- Quando o payload Asaas tem percentuais, nem sempre há valor monetário direto; a comparação com snapshot pode ficar parcial.
- Snapshot de sócio sem wallet pode gerar linha de sócio mesmo quando ele não foi recebedor efetivo no Asaas.
- Ledger do representante é usado como evidência complementar, mas o ledger pode ter sido calculado por base divergente.
- O diagnóstico não deve afirmar split efetivo quando a wallet não foi enviada ao Asaas; hoje ele marca algumas linhas de snapshot/ledger como “Sem dados suficientes”, o que é prudente, mas ainda pode confundir se apresentado junto a valores.

Resultado: **parcialmente aderente**.

## 17. Verificação do ledger de representante

A função SQL `upsert_representative_commission_for_sale` recalcula comissão com:

- `v_platform_fee_percent = company.platform_fee_percent`
- `v_commission_percent = v_platform_fee_percent / 3`
- `v_base_amount = sale.gross_amount` ou `unit_price * quantity`
- `commission_amount = base_amount * commission_percent`

Problemas:

1. Usa gross da venda como base, que pode incluir taxa adicional da empresa e taxa repassada ao cliente.
2. Usa percentual da empresa, não a taxa oficial efetiva calculada por item com teto/mínimo.
3. Em cenários de teto por item, múltiplos itens em faixas distintas e mínimo de R$ 5,00, o ledger pode divergir do split Asaas e do snapshot.
4. Se a taxa oficial total foi R$ 25,00 por teto, mas `gross_amount * (platform_fee_percent/3)` gerar outro valor, o ledger fica incorreto.

Resultado: **não aderente ao PRD oficial consolidado** para os cenários sensíveis.

## 18. Divergências encontradas

| ID | Divergência | Evidência | Impacto |
|---|---|---|---|
| D1 | Mínimo R$ 5,00 ausente na venda pública. | Motor shared soma taxa progressiva/teto, sem piso. | Plataforma cobra menos que o mínimo e split fica menor. |
| D2 | Venda manual usa cobrança separada sem split oficial. | `create-platform-fee-checkout` cria cobrança Pix da taxa sem `split`. | Sócio/representante podem não receber no Asaas no fluxo manual. |
| D3 | Ledger representante usa base/percentual paralelos. | SQL calcula comissão por `gross_amount * company.platform_fee_percent/3`. | Comissão pode divergir do payload e snapshot. |
| D4 | Snapshot não salva valor do representante. | Campos existentes salvam total, sócio, marketplace e percentual representante. | Diagnóstico/auditoria incompletos. |
| D5 | Diagnóstico pode ter linha de sócio sem prova de split efetivo. | Snapshot de sócio não tem wallet efetiva. | Risco de suporte interpretar repasse não enviado como efetivo. |
| D6 | Serviços avulsos fora do motor. | `ServiceSales.tsx` cria venda/itens sem motor/split. | Regra financeira indefinida para serviços. |
| D7 | Helper frontend `calculateSeatsTotal` ainda calcula por média. | Função calcula `avgUnitPrice` e taxa por média. | Risco futuro se reutilizado em checkout/fluxo sensível. |

## 19. Riscos financeiros encontrados

- **Subcobrança da plataforma** em vendas públicas abaixo do mínimo.
- **Repasse indevido ou ausente para sócio/representante** em venda manual.
- **Comissão de representante maior ou menor que 1/3 real da taxa oficial**, principalmente com taxa adicional, teto, mínimo ou múltiplos itens.
- **Diagnóstico financeiro inconclusivo** por falta de campos de recebedor efetivo e valor do representante no snapshot.
- **Divergência contábil entre Asaas, sales, snapshot e representative_commissions**.
- **Risco de auditoria** quando o payload usa percentuais técnicos sobre gross e a UI não deixa isso explícito.

## 20. Perguntas pendentes

1. Em caso de representante inelegível/sem wallet, a parte do representante deve ir 100% para Marketplace ou ser redistribuída entre Marketplace e Sócio quando o sócio estiver ativo? O código redistribui parte para o sócio em alguns cenários, mas o PRD só documenta claramente a absorção da parte do sócio pela Marketplace.
2. Serviços avulsos vendidos pelo módulo de serviços devem gerar taxa da plataforma e split? Se sim, entram como item próprio com teto/mínimo por item?
3. Serviços opcionais vinculados à passagem devem compor a base da taxa da plataforma ou ser tratados como taxa adicional da empresa?
4. Empresas com `platform_fee_percent = 0` continuam oficialmente isentas do motor progressivo/mínimo? O código preserva essa regra, mas o PRD financeiro principal não detalha exceções de empresa isenta.
5. O mínimo de R$ 5,00 deve ser aplicado por venda após a soma dos itens, como diz o PRD, inclusive quando a taxa é repassada ao cliente no checkout público? A interpretação desta análise é sim.
6. O ledger deve ser sempre derivado do snapshot congelado ou do payload efetivamente enviado ao Asaas? Recomendação: snapshot/payload efetivo, não recálculo por percentual da empresa.

## 21. Correção mínima recomendada, se houver

### Correção mínima 1 — aplicar mínimo no motor oficial compartilhado

- Arquivo: `supabase/functions/_shared/platform-fee-engine.ts`.
- Comportamento errado: `computeProgressiveFeeForPassengers` retorna `totalFee` abaixo de R$ 5,00.
- Esperado conforme PRD: após calcular item a item com teto e somar, elevar `totalFee` para R$ 5,00 quando `0 < totalFee < 5`, antes da divisão.
- Risco: altera cobrança pública, snapshot, split e validação de integridade. Necessário alinhar frontend público para o total visual não divergir do backend.
- Como testar antes do commit:
  - unit test com R$ 30,00 → `totalFee = 5.00`;
  - checkout público com repasse ao cliente: gross deve incluir R$ 5,00;
  - checkout público sem repasse: split deve capturar R$ 5,00 mesmo que cliente pague só a passagem;
  - venda manual deve permanecer R$ 5,00 e não duplicar mínimo.

### Correção mínima 2 — alinhar frontend público ao mínimo

- Arquivo: `src/lib/feeCalculator.ts` e pontos de uso no checkout.
- Comportamento errado: visual público mostra R$ 1,80 para passagem de R$ 30,00 se repasse estiver ativo.
- Esperado: visual deve mostrar R$ 5,00 quando a compra inteira tiver taxa total abaixo do mínimo.
- Risco: `calculatePlatformFee` é por item; o mínimo é por taxa total da venda, então a correção deve evitar aplicar R$ 5,00 em cada item. Pode exigir helper de total por array de itens.
- Como testar:
  - uma passagem R$ 30,00 → taxa visual R$ 5,00;
  - duas passagens R$ 30,00 → taxa total R$ 5,00? Pela ordem do PRD, soma R$ 1,80 + R$ 1,80 = R$ 3,60 e depois aplica mínimo total R$ 5,00;
  - três passagens R$ 30,00 → R$ 5,40, sem mínimo adicional.

### Correção mínima 3 — ledger de representante derivado do snapshot

- Arquivo: migration que redefine `public.upsert_representative_commission_for_sale`.
- Comportamento errado: comissão por `gross_amount * platform_fee_percent/3`.
- Esperado: comissão deve usar `split_snapshot_platform_fee_total` e a regra efetiva do representante, ou preferencialmente o valor do representante persistido no snapshot/payload.
- Risco: sensível, pode alterar valores já lançados; deve ser decidido se afeta apenas novas vendas ou também reconciliação histórica.
- Como testar:
  - venda R$ 1.000,00 com teto: representante deve receber R$ 8,33 ou R$ 8,34 conforme arredondamento oficial sobre R$ 25,00, não R$ 10,00 se base percentual gerar isso;
  - venda com taxa adicional: comissão não pode crescer por causa da taxa adicional.

### Correção mínima 4 — venda manual com split oficial

- Arquivos: `src/components/admin/NewSaleModal.tsx`, `supabase/functions/create-platform-fee-checkout/index.ts` ou eventual reuso de `create-asaas-payment`.
- Comportamento errado: cobrança manual de taxa não envia split oficial.
- Esperado: taxa manual deve ter a mesma distribuição Marketplace/Sócio/Representante ou decisão explícita de produto dizendo que venda manual é exceção.
- Risco: alto; envolve gateway, owner da cobrança, wallets e conciliação. Não implementar sem validação humana.

### Correção mínima 5 — diagnóstico não tratar snapshot como split efetivo

- Arquivo: `src/pages/admin/SalesDiagnostic.tsx`.
- Comportamento errado: snapshot pode sugerir recebedor sem wallet efetiva.
- Esperado: separar claramente “cálculo previsto”, “payload enviado” e “ledger”, e só marcar efetivo quando wallet aparece no payload/retorno.
- Risco: baixo/médio, visual/auditoria. Pode ser implementado após decisão sobre campos de snapshot.

## 22. Checklist de testes sugeridos

### Unitários

- `npm test -- src/lib/feeCalculator.test.ts`
- `npm test -- src/lib/checkoutFinancialIntegrity.test.ts`
- Criar/adicionar teste do motor shared para:
  - R$ 100,00 → R$ 6,00;
  - R$ 30,00 → R$ 5,00;
  - R$ 1.000,00 → R$ 25,00;
  - R$ 1.000,00 + R$ 1.000,00 → R$ 50,00;
  - R$ 100,00 + taxa adicional R$ 6,00 → taxa plataforma R$ 6,00;
  - R$ 100,00 + R$ 50,00 → R$ 6,00 + R$ 3,00 = R$ 9,00.

### Integração/backend

- Simular `create-asaas-payment` com venda pública, passageiro R$ 30,00, sócio ativo, sem representante: payload split deve somar R$ 5,00 em percentual técnico.
- Simular sócio inativo e representante elegível: payload deve ter Marketplace 2/3 e Representante 1/3 da taxa total.
- Simular sócio sem wallet: wallet não enviada e Marketplace absorve parte.
- Simular representante sem wallet: wallet não enviada; validar política de redistribuição após decisão de produto.

### E2E manual

- Venda manual R$ 30,00: taxa criada R$ 5,00.
- Venda manual R$ 100,00 com representante/sócio elegíveis: validar se Produto aceita cobrança sem split ou se deve bloquear homologação até alinhar.

### Diagnóstico/auditoria

- Comparar em `/admin/diagnostico-vendas`:
  - snapshot total;
  - payload enviado;
  - wallets efetivas;
  - ledger representante;
  - logs de integração.

## 23. Conclusão: está aderente ao PRD ou precisa de ajuste?

**Precisa de ajuste.**

A implementação atual já tem avanços importantes: motor progressivo, teto por item, base separada de taxas adicionais, suporte a tipos de passagem e resolvedor central de wallets/split no fluxo público. Porém, há divergências objetivas contra o PRD oficial:

- mínimo de R$ 5,00 ausente no público;
- venda manual com regra/fluxo diferente;
- ledger recalculando comissão por base paralela;
- snapshot/diagnóstico incompletos para recebedores efetivos;
- regra de serviços ainda ambígua.

Por se tratar de regra financeira sensível, a recomendação é **não fazer refatoração ampla agora**. A sequência segura é:

1. Produto confirmar as perguntas pendentes.
2. Aplicar mínimo de R$ 5,00 no motor oficial e no visual público.
3. Ajustar ledger para derivar do snapshot/payload efetivo.
4. Decidir e implementar o alinhamento da venda manual com split oficial.
5. Melhorar diagnóstico para separar previsto x enviado x efetivado.
