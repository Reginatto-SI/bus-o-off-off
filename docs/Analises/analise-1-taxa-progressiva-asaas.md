# Análise 1 — Taxa progressiva por valor da passagem (landing vs PRD vs código)

Data da análise: 2026-04-25
Escopo: somente auditoria, sem alterações de regra de negócio/código.

## 1) Diagnóstico geral

**Conclusão executiva:** a regra comercial da landing (6%/5%/4%/3% por faixa + teto de R$ 25 por passagem) **não está implementada de forma completa no sistema atual**.

O que existe hoje no código e PRDs:
- cálculo baseado em **`company.platform_fee_percent` único** (percentual fixo por empresa), sem motor de faixas por valor da passagem;
- possibilidade de **repasse ao cliente** via `events.pass_platform_fee_to_customer`;
- split Asaas, snapshot financeiro e comissão de representante estruturados para consumir esse percentual fixo;
- comissão de representante com regra operacional de **1/3 da taxa da plataforma**.

Portanto, frente à regra divulgada na landing, o estado atual é: **parcialmente funcional apenas para taxa percentual fixa; não funcional para progressividade por faixa + teto R$ 25 por passagem**.

---

## 2) PRDs encontrados e o que dizem sobre taxa, split e comissão

Arquivos auditados (obrigatórios):
- `docs/PRD/Asaas/00-asaas-indice-geral.md`
- `docs/PRD/Asaas/01-asaas-visao-geral.md`
- `docs/PRD/Asaas/02-asaas-fluxo-checkout-e-venda.md`
- `docs/PRD/Asaas/03-asaas-webhook-e-confirmacao.md`
- `docs/PRD/Asaas/04-asaas-split-comissoes-e-representantes.md`
- `docs/PRD/Asaas/05-asaas-configuracao-empresa-e-validacao.md`
- `docs/PRD/Asaas/06-asaas-operacao-erros-e-diagnostico.md`

### 00 — índice geral
- Organiza a documentação e reforça que PRD 04 é o financeiro (split/comissões).
- **Não documenta** tabela progressiva por faixas de valor da passagem.

### 01 — visão geral
- Define macrofluxo Asaas e menciona split por helper central.
- **Não traz** regra de progressividade (6/5/4/3) nem teto de R$ 25.

### 02 — checkout e venda
- Foca criação de venda/cobrança e integridade de snapshot de passageiros.
- **Não formaliza** regra de taxa progressiva por valor de passagem.

### 03 — webhook e confirmação
- Foca confirmação idempotente e convergência webhook/verify.
- **Não define** tabela progressiva nem teto por passagem.

### 04 — split, comissões e representantes
- Confirma regra operacional de split e que representante usa **1/3 da taxa da plataforma**.
- Fala em `platform_fee_percent` e `socio_split_percent`.
- **Não documenta** motor por faixas de preço da passagem nem teto de R$ 25.

### 05 — configuração da empresa
- Reforça configuração por ambiente e dependência de taxa/plataforma em empresa.
- **Não formaliza** progressividade por faixa/teto.

### 06 — operação e diagnóstico
- Reforça investigação de divergências entre split/snapshot/ledger.
- **Não contém** especificação da tabela progressiva da landing.

**Síntese dos PRDs:** os PRDs tratam taxa da plataforma como percentual configurado por empresa (modelo percentual fixo), não como tabela progressiva por valor individual da passagem.

---

## 3) Evidências no código (arquivos e trechos relevantes)

## 3.1 Landing page (promessa comercial)
- A landing exibe explicitamente os cards:
  - Até R$ 100: 6%
  - R$ 100 a R$ 300: 5%
  - R$ 300 a R$ 600: 4%
  - Acima de R$ 600: 3%
  - Teto máximo: Máx. R$ 25 por passagem vendida
  - Copy: “Pode repassar ao cliente”
- Evidência em `src/pages/public/LandingPage.tsx` (seção de cards de taxa).

## 3.2 Checkout público (cálculo no front)
- Busca `platform_fee_percent` da `company` e usa esse único valor para calcular taxa quando `event.pass_platform_fee_to_customer` está ativo.
- Cálculo de taxa usa percentual simples sobre preço unitário médio (via `calculateFees`/`calculatePlatformFee`).
- Não há função/estrutura de faixas 100/300/600 nem `min(..., 25)` por passagem.

## 3.3 Cálculo unificado de taxas no frontend
- `src/lib/feeCalculator.ts`:
  - `calculatePlatformFee(unitPrice, feePercent)` = `unitPrice * feePercent/100` com arredondamento.
  - Sem lógica progressiva por range.
  - Sem teto de R$ 25.

## 3.4 create-asaas-payment (backend de cobrança)
- Carrega `company.platform_fee_percent` e usa esse percentual no split e no snapshot.
- `calculateFeesTotal(...)` aplica taxa percentual simples quando `pass_platform_fee_to_customer` está true.
- `buildFinancialSplitSnapshot(...)` calcula valores da plataforma sobre `grossAmount` com percentual único.
- Não existe função de taxa progressiva por preço de passagem.
- Não existe aplicação de teto de R$ 25 por passagem.

## 3.5 Resolver de split compartilhado
- `supabase/functions/_shared/split-recipients-resolver.ts` usa `platformFeePercent` como entrada (percentual único).
- Comissão do representante é derivada por helper local: `platformFeePercent / 3`.
- Não há leitura de faixas 100/300/600 e não há cap de R$ 25.

## 3.6 Webhook e verify (snapshot/convergência)
- `asaas-webhook` e `verify-payment-status` reaproveitam snapshot congelado da venda quando existe; caso contrário, recalculam com `company.platform_fee_percent`.
- A base continua sendo percentual fixo por empresa.
- Sem lógica progressiva e sem teto por passagem.

## 3.7 Migrations/regras de dados
- `20260615093000_add_event_platform_fee_controls.sql` comenta `pass_platform_fee_to_customer` como “cliente paga preço base + 6% da plataforma” (referência fixa a 6%, sem tabela por faixas).
- `20260424120000_add_sales_split_snapshot_asaas.sql` congela percentuais/valores de split por venda, mas não define motor progressivo.
- `20260411170000_update_representative_commission_one_third_platform_fee.sql` formaliza comissão do representante = 1/3 da taxa da plataforma (percentual da empresa).

---

## 4) Comparação: regra da landing vs regra implementada

## Regra da landing (promessa comercial)
- progressiva por valor da passagem: 6%/5%/4%/3%;
- teto de R$ 25 por passagem;
- taxa pode ser repassada ao cliente.

## Regra implementada (evidência técnica)
- taxa percentual fixa por empresa (`platform_fee_percent`);
- repasse ao cliente controlado por `events.pass_platform_fee_to_customer`;
- split/snapshot/comissão baseados no mesmo percentual fixo;
- ausência de motor de faixas e ausência de teto de R$ 25 por passagem.

## Resultado da comparação
- **Aderência parcial apenas no “pode repassar ao cliente”.**
- **Sem aderência para progressividade por faixas e teto de R$ 25 por passagem.**

---

## 5) O sistema calcula automaticamente essa taxa no fluxo completo?

### 5.1 Valor cobrado do cliente
- Sim, há cálculo automático de taxa quando `pass_platform_fee_to_customer = true`.
- Porém o cálculo é percentual fixo por empresa, não progressivo por faixa.

### 5.2 Taxa da plataforma
- Sim, o sistema calcula e persiste valores ligados à taxa da plataforma (split snapshot e campos financeiros).
- Base de cálculo: percentual fixo.

### 5.3 Split enviado ao Asaas
- Sim, é montado automaticamente pelo resolvedor central.
- Percentual de plataforma no split = `platform_fee_percent`.

### 5.4 Snapshot financeiro salvo na venda
- Sim, no create; webhook/verify reutilizam snapshot congelado quando disponível.
- Não incorpora regra progressiva porque a origem já é percentual fixo.

### 5.5 Ledger/comissão de representante
- Sim, calculado em 1/3 da taxa da plataforma vigente no modelo atual (fixo).
- Sem suporte específico a progressividade por faixa.

### 5.6 Painel administrativo / diagnóstico / confirmação
- Fluxos de diagnóstico e confirmação estão estruturados em torno do mesmo modelo fixo.
- Não há evidência de UI/diagnóstico calculando ou auditando faixas progressivas + teto.

---

## 6) Como o cálculo ocorre hoje (base da taxa)

Com base no código auditado, o cálculo atual considera:
- **Base principal:** percentual da empresa (`platform_fee_percent`).
- **Aplicação de cobrança ao cliente:** sobre preço unitário (médio no checkout de múltiplos passageiros) quando repasse ativo.
- **Split/snapshot financeiro:** sobre `gross_amount` da venda com percentual fixo.

Não foi encontrada regra explícita no código para:
- cálculo por faixa de **valor individual da passagem** (100/300/600);
- cálculo com **teto de R$ 25 por passagem**;
- variação de percentual por quantidade de passageiros com recálculo por passageiro individual usando cap.

---

## 7) Validação do teto de R$ 25

**Resultado:** não encontrado no código auditado.

Não há evidência de aplicação de teto de R$ 25:
- por passagem;
- por venda;
- por passageiro.

A única regra de limite encontrada relacionada à taxa foi:
- bloqueio de cobrança de taxa manual abaixo do mínimo operacional do Asaas (R$ 5,00), que é outra regra e não substitui teto máximo comercial.

---

## 8) Comissão de representante e taxa progressiva

- A comissão do representante está implementada para seguir **1/3 da taxa da plataforma** (regra confirmada em código e migration).
- Como a taxa da plataforma atual é percentual fixo por empresa, a comissão reflete esse modelo fixo.
- **Se a regra progressiva da landing for mandatória, hoje a comissão não está atrelada a uma taxa progressiva real por faixa, porque essa taxa progressiva não é calculada no core atual.**

---

## 9) Riscos financeiros/operacionais encontrados

1. **Risco de promessa comercial sem execução sistêmica:** landing comunica tabela progressiva + teto, mas backend opera com percentual fixo.
2. **Risco de divergência de expectativa financeira da empresa:** organizador pode esperar taxa menor em tickets maiores e cap de R$ 25, o que não foi evidenciado no cálculo real.
3. **Risco de auditoria e suporte:** PRDs financeiros não formalizam a tabela da landing; times podem operar com regra diferente da comunicação comercial.
4. **Risco de impacto em comissão/split:** qualquer ajuste futuro para progressividade exigirá revisão coordenada em checkout, create, split, snapshot, webhook/verify e ledger de representante.

---

## 10) Lacunas de documentação

- PRDs auditados em `docs/PRD/Asaas` não descrevem explicitamente:
  - tabela 6/5/4/3 por faixa de valor da passagem;
  - teto de R$ 25 por passagem;
  - definição formal de base de cálculo da progressividade (valor unitário bruto, final, líquido, por passageiro ou por venda).

- Falta contrato documental único ligando:
  - regra comercial da landing
  - regra operacional do backend
  - impacto em split/snapshot/comissão.

---

## 11) Recomendação objetiva

Classificação de estado atual frente ao objetivo desta análise:

- **Funcional:** não.
- **Parcialmente funcional:** sim (somente para modelo de taxa percentual fixa com repasse opcional, split/snapshot/comissão consistentes nesse modelo).
- **Não funcional:** sim, para a regra específica de taxa progressiva por valor da passagem + teto R$ 25.
- **Precisa criar/atualizar PRD:** sim.
- **Precisa ajustar código:** sim, se a regra da landing for a regra oficial de negócio.

---

## 12) Próximos passos sugeridos (sem implementar)

1. **Produto/Financeiro:** decidir e formalizar a regra oficial única (landing vs core atual).
2. **PRD:** atualizar PRD 04 (e referências em 02/03/06) com:
   - faixas exatas;
   - fronteiras (inclui/exclui 100/300/600);
   - base de cálculo (unitário por passageiro vs venda agregada);
   - aplicação do teto (por passagem vs por venda);
   - regras de arredondamento.
3. **Mapeamento técnico de impacto:** checklist de pontos a ajustar antes de codar:
   - `feeCalculator` (frontend);
   - `create-asaas-payment` e helpers de fees;
   - resolvedor de split + snapshot;
   - webhook/verify/reconcile (convergência do snapshot);
   - SQL/RPC da comissão de representante.
4. **QA/observabilidade:** definir casos de teste de borda (R$ 100/300/600, ticket alto com cap, múltiplos passageiros, mix de categorias).
5. **Comunicação:** evitar continuar divulgando regra comercial não executada até haver alinhamento oficial.

---

## Anexo — comandos de auditoria usados

- Leitura dos PRDs:
  - `sed -n '1,240p' docs/PRD/Asaas/*.md`
- Busca de evidências em landing e código:
  - `rg -n "6%|5%|4%|3%|R\$ ?25|teto|taxa|plataforma" ...`
  - `rg -n "platform_fee_percent|pass_platform_fee_to_customer|calculateFees|split" ...`
- Inspeção de trechos críticos:
  - `sed -n '1728,1815p' src/pages/public/LandingPage.tsx`
  - `sed -n '1,180p' supabase/functions/create-asaas-payment/index.ts`
  - `sed -n '520,980p' supabase/functions/create-asaas-payment/index.ts`
  - `sed -n '1,340p' supabase/functions/_shared/split-recipients-resolver.ts`
  - `sed -n '900,1045p' supabase/functions/verify-payment-status/index.ts`
  - `sed -n '1080,1285p' supabase/functions/asaas-webhook/index.ts`
  - `sed -n '1,260p' src/lib/feeCalculator.ts`
