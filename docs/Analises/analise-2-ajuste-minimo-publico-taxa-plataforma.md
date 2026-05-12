# Análise 2 — Ajuste mínimo do piso público da taxa da plataforma

Data: 2026-05-12

## 1. Resumo do problema corrigido

A análise anterior (`docs/Analises/analise-1-regra-taxa-split-smartbus.md`) identificou que a venda pública calculava a taxa progressiva da plataforma por passageiro/item e aplicava o teto de R$ 25,00 por item, mas não elevava a taxa total para o piso operacional de R$ 5,00 quando a soma final ficava abaixo desse valor.

O PRD oficial (`docs/PRD/PRD 01 — Regra Oficial de Divisão da Taxa entre Marketplace, Sócio e Representante.txt`) define a ordem obrigatória:

1. calcular a taxa por passagem/item;
2. aplicar o teto de R$ 25,00 por passagem/item;
3. somar as taxas dos itens/passageiros;
4. aplicar o mínimo operacional de R$ 5,00 sobre a taxa total da plataforma quando ela for maior que zero e menor que R$ 5,00;
5. dividir entre Marketplace, Sócio e Representante.

A correção desta etapa aplica esse piso no motor compartilhado usado pelo backend público e ajusta o visual/total do checkout público para usar a mesma regra quando a taxa da plataforma for repassada ao cliente.

## 2. Arquivos alterados

- `supabase/functions/_shared/platform-fee-engine.ts`
- `src/lib/feeCalculator.ts`
- `src/pages/public/Checkout.tsx`
- `src/lib/feeCalculator.test.ts`
- `docs/Analises/analise-2-ajuste-minimo-publico-taxa-plataforma.md`

## 3. Regra antes/depois

### Antes

- Backend público (`computeProgressiveFeeForPassengers`):
  - calculava a taxa por passageiro;
  - aplicava teto de R$ 25,00 por passageiro;
  - somava o total;
  - retornava esse total mesmo quando ficava abaixo de R$ 5,00.

- Frontend público (`Checkout.tsx`):
  - estimava taxas no resumo usando cálculo visual;
  - quando a taxa era repassada ao cliente, não aplicava piso total de R$ 5,00;
  - em alguns pontos ainda podia usar média visual para resumo, o que não é a fonte correta para cenários com itens diferentes.

### Depois

- Backend público:
  - calcula por item;
  - aplica teto por item;
  - soma o total;
  - aplica piso total de R$ 5,00 apenas se `0 < total < 5`;
  - entrega esse total para o split/payload Asaas antes da divisão.

- Frontend público:
  - usa `calculatePlatformFeeTotal(unitPrices)` para o total da plataforma quando houver repasse ao cliente;
  - soma primeiro as taxas por item e só depois aplica o piso;
  - mantém taxas adicionais da empresa separadas da base da taxa da plataforma.

## 4. Evidência de que o mínimo é aplicado depois da soma por item

No backend, `computeProgressiveFeeForPassengers` agora calcula `totalCappedFee` a partir da soma dos itens já limitados pelo teto e só depois aplica `PLATFORM_FEE_MINIMUM_TOTAL_BRL = 5` quando o total é maior que zero e menor que R$ 5,00.

No frontend, `calculatePlatformFeeTotal(unitPrices)` soma `calculatePlatformFee(unitPrice)` para cada item e depois chama `applyPlatformFeeMinimumTotal(progressiveTotal)`.

Cenários cobertos por teste:

- `[30]` → taxa por item R$ 1,80 → total final R$ 5,00;
- `[30, 30]` → R$ 1,80 + R$ 1,80 = R$ 3,60 → total final R$ 5,00;
- `[30, 30, 30]` → R$ 5,40 → total final R$ 5,40.

## 5. Evidência de que o mínimo não é aplicado por passageiro

O teste `aplica piso uma única vez para duas passagens de R$ 30` valida explicitamente que `calculatePlatformFeeTotal([30, 30])` retorna R$ 5,00 e não R$ 10,00.

Isso confirma que o piso não está sendo aplicado em cada passageiro individualmente. A função individual `calculatePlatformFee(30)` continua retornando R$ 1,80; o piso só entra no cálculo agregado da venda.

## 6. Evidência de que taxa adicional da empresa não entra na base da plataforma

O teste `não inclui taxa adicional da empresa na base da taxa da plataforma` valida a separação:

- `calculatePlatformFeeTotal([100])` retorna R$ 6,00;
- a taxa adicional fixa da empresa de R$ 6,00 é calculada por `calculateFees(100, eventFees)` separadamente;
- a taxa da plataforma não é recalculada sobre R$ 106,00.

No checkout público, a mesma separação foi mantida:

- `eventFeesTotal` soma apenas as taxas adicionais do evento;
- `platformFeeTotal` usa somente os preços dos passageiros/itens;
- `totalFees = eventFeesTotal + platformFeeTotal` apenas no total cobrado ao cliente quando há repasse.

## 7. Testes criados ou ajustados

Foram adicionados testes em `src/lib/feeCalculator.test.ts` para validar:

1. uma passagem de R$ 30,00 gera taxa final de R$ 5,00;
2. duas passagens de R$ 30,00 geram taxa final de R$ 5,00, não R$ 10,00;
3. três passagens de R$ 30,00 geram taxa final de R$ 5,40;
4. uma passagem de R$ 100,00 gera taxa final de R$ 6,00;
5. uma passagem de R$ 1.000,00 gera taxa final de R$ 25,00 por teto;
6. uma passagem de R$ 100,00 com taxa adicional da empresa de R$ 6,00 mantém taxa da plataforma em R$ 6,00, sem recalcular sobre R$ 106,00.

Comandos executados:

- `npm test -- src/lib/feeCalculator.test.ts src/lib/checkoutFinancialIntegrity.test.ts`
- `npx eslint src/lib/feeCalculator.ts src/lib/feeCalculator.test.ts src/pages/public/Checkout.tsx`
- `npm run build`

Resultado: os testes e o lint direcionado passaram. O build passou e apresentou apenas os avisos já esperados de Browserslist desatualizado e chunk grande. O lint completo do repositório (`npm run lint`) ainda falha por débitos preexistentes fora do escopo desta tarefa.

## 8. Riscos restantes não tratados nesta tarefa

Conforme escopo solicitado, estes pontos permanecem sem alteração:

- **Venda manual:** continua com fluxo separado de cobrança da taxa e não foi alterada nesta tarefa.
- **Ledger de representante:** continua fora do escopo desta correção e não foi ajustado para derivar do snapshot/payload efetivo.
- **Snapshot/diagnóstico:** não foram alterados campos de snapshot nem a tela administrativa de diagnóstico.
- **Serviços:** o tratamento financeiro de serviços avulsos/vinculados permanece como decisão pendente de produto/financeiro.

## 9. Recomendação para o próximo passo

Recomenda-se homologar em sandbox os seguintes cenários de venda pública antes de produção:

1. uma passagem de R$ 30,00 com repasse da taxa ao cliente;
2. duas passagens de R$ 30,00 com repasse;
3. três passagens de R$ 30,00 com repasse;
4. uma passagem de R$ 30,00 sem repasse da taxa ao cliente, validando que o comprador não paga a taxa adicional, mas o split/payload considera R$ 5,00;
5. passagem de R$ 100,00 + taxa adicional da empresa de R$ 6,00, validando que a taxa da plataforma permanece R$ 6,00;
6. passagem de R$ 1.000,00, validando teto de R$ 25,00.

Depois da homologação do piso público, o próximo ajuste financeiro recomendado é tratar o ledger de representante e a venda manual, conforme riscos documentados na análise 1.
