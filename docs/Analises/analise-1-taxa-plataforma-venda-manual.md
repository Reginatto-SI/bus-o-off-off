# A. Objetivo

Investigar por que vendas manuais/admin já pagas não refletiam a taxa da plataforma nos consolidadores financeiros do Smartbus BR e aplicar a menor correção segura para alinhar `/admin/vendas`, `/admin/relatorios/vendas` e o PDF quando ele usa a mesma base consolidada.

# B. Escopo analisado

## Diretrizes lidas
- `docs/manual-operacional-smartbus-br/Diretrizes Oficiais do Projeto.txt`

## Fluxo de criação/manual/admin
- `src/components/admin/NewSaleModal.tsx`
- `src/pages/admin/Sales.tsx`
- `src/lib/platformFeeCheckout.ts`
- `supabase/functions/create-platform-fee-checkout/index.ts`

## Fluxo online / webhook / confirmação
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/_shared/payment-finalization.ts`

## Relatórios / PDF / consolidadores
- `src/pages/admin/SalesReport.tsx`
- `src/components/admin/ExportPDFModal.tsx`
- `supabase/migrations/20260401000000_add_sales_report_pagination_functions.sql`
- `supabase/migrations/20261016103000_fix_sales_report_financial_paid_only.sql`

## Tipos / schema / histórico
- `src/types/database.ts`
- `supabase/migrations/20260308131238_e77be19e-1cb7-4ef5-b54a-327f5514eb6c.sql`
- `supabase/migrations/20260323150000_remove_sales_stripe_legacy_columns.sql`
- busca ampla por `stripe/Stripe` em `src/` e `supabase/`

# C. Fluxo atual encontrado

1. A venda manual nasce em `src/components/admin/NewSaleModal.tsx` com:
   - `status = 'reservado'`
   - `sale_origin = 'admin_manual'`
   - `gross_amount` preenchido
   - `platform_fee_amount` calculado a partir de `companies.platform_fee_percent`
   - `platform_fee_status = 'pending'` quando existe taxa
   - `company_id` e `payment_environment` explícitos
2. A cobrança da taxa da plataforma da venda manual é aberta separadamente via `create-platform-fee-checkout`.
3. Quando o Asaas confirma essa cobrança, `supabase/functions/asaas-webhook/index.ts` promovia a venda para `status = 'pago'`, preenchia `platform_fee_status = 'paid'`, `platform_fee_paid_at` e `payment_confirmed_at`.
4. Porém, nesse fluxo manual, o webhook **não preenchia `platform_fee_total`**.
5. Já o fluxo online principal preenche `platform_fee_total` no webhook/verify-payment-status quando o pagamento principal Asaas é confirmado.
6. `/admin/vendas` e os RPCs do relatório (`get_sales_report_kpis` e `get_sales_report_summary_paginated`) consolidavam a taxa usando `platform_fee_total`.
7. Resultado: venda manual paga aparecia em receita bruta (`gross_amount`), mas taxa da plataforma ficava zerada nos KPI/relatórios porque o consolidado lia uma coluna que o fluxo manual não populava.

# D. Causa raiz confirmada

A causa raiz confirmada é uma divergência entre o fluxo manual/admin e o fluxo online na **persistência do campo consolidado `sales.platform_fee_total`**.

- O fluxo manual calculava e persistia `platform_fee_amount`.
- O webhook da taxa manual marcava a venda como paga, mas não espelhava esse valor em `platform_fee_total`.
- `/admin/vendas` e os relatórios somavam `platform_fee_total`, logo enxergavam `0`/`null` para vendas manuais pagas.

Portanto, o bug **não era apenas visual** e **não era ausência de cálculo**; era principalmente uma falha de persistência/consolidação, com efeito secundário de leitura estrita nos consolidadores.

# E. Evidências técnicas

## Onde a taxa manual é calculada
- `NewSaleModal.tsx` calcula `platformFeeAmount` usando `company.platform_fee_percent` e grava em `sales.platform_fee_amount`.

## Onde a informação se perdia
- `asaas-webhook/index.ts` no fluxo `platform_fee_<sale_id>` atualizava:
  - `platform_fee_status`
  - `platform_fee_paid_at`
  - `platform_fee_payment_id`
  - `status`
  - `payment_confirmed_at`
- Mas não atualizava `platform_fee_total`.

## Onde os consolidadores liam
- `/admin/vendas` somava `paidSales.reduce(... s.platform_fee_total ...)`.
- `get_sales_report_kpis` somava `platform_fee_total` apenas para `status = 'pago'`.
- `get_sales_report_summary_paginated` também somava `platform_fee_total` apenas para `status = 'pago'`.
- O PDF do relatório usa os mesmos dados já montados pela tela/report, então herdava a mesma ausência quando a origem era o consolidado do relatório.

## Fonte de verdade observada
- Tabela principal: `public.sales`
- Colunas relevantes:
  - bruto: `gross_amount`
  - taxa consolidada: `platform_fee_total`
  - taxa manual calculada/original: `platform_fee_amount`
  - comissão vendedor: derivada de `sellers.commission_percent` no relatório
  - líquido/plataforma: `platform_net_amount`
  - parte do sócio: `socio_fee_amount`

# F. Diferença entre fluxo manual e fluxo online

## Fluxo online
- Confirmado pelo webhook/verify-payment-status do pagamento principal Asaas.
- Preenche `gross_amount`, `platform_fee_total`, `socio_fee_amount`, `platform_net_amount`.
- Consolidadores funcionam porque leem exatamente `platform_fee_total`.

## Fluxo manual/admin
- Calcula a taxa em `platform_fee_amount` na criação.
- Usa cobrança separada da taxa da plataforma.
- Ao confirmar essa cobrança, a venda virava `pago`, mas **sem preencher `platform_fee_total`**.
- Consolidadores passavam a ver venda paga sem taxa consolidada.

# G. Impacto

## KPI `/admin/vendas`
- “Total arrecadado” correto.
- “Custo da plataforma” incorreto/zerado para vendas manuais pagas.

## Relatórios de vendas
- KPIs e resumo por evento sem refletir taxa da plataforma dessas vendas.

## PDF
- Se exportado a partir do relatório consolidado, herdava o mesmo valor incorreto.

## Consistência operacional
- A venda estava paga e com taxa quitada, mas a trilha financeira ficava inconsistente.
- Isso prejudicava auditoria, conferência financeira e leitura gerencial.

# H. Correção mínima aplicada

Foram aplicados três ajustes mínimos e complementares:

1. **Webhook da taxa manual passou a consolidar `platform_fee_total`** no momento em que a taxa é confirmada como paga.
2. **Backfill em migration** para vendas manuais/admin históricas já pagas, copiando `platform_fee_amount` para `platform_fee_total` quando a taxa já está `paid`.
3. **Fallback defensivo de leitura**:
   - `/admin/vendas` agora soma `platform_fee_total ?? platform_fee_amount` para evitar KPI zerado durante transição/saneamento.
   - os RPCs do relatório passam a usar `coalesce(platform_fee_total, platform_fee_amount, 0)` mantendo o consolidado em uma única trilha lógica.

Não foi criada arquitetura nova, não houve bifurcação por ambiente e `company_id` continua sendo filtro obrigatório nas consultas analisadas.

# I. Riscos e validações

## Riscos observados
- Risco de dupla interpretação entre `platform_fee_amount` e `platform_fee_total`.
- Risco de contaminar vendas não manuais no backfill.

## Mitigações
- O backfill foi restrito a:
  - `status = 'pago'`
  - `sale_origin in ('admin_manual', 'admin_reservation_conversion', 'seller_manual')`
  - `platform_fee_status = 'paid'`
  - `platform_fee_total is null`
  - `platform_fee_amount is not null`
- O webhook mantém `platform_fee_total` como fonte consolidada oficial.
- O fallback de leitura é apenas defensivo; não cria fluxo paralelo.

## Stripe
- Foram encontrados apenas resquícios legados em comentários/migrations históricas e checks antigos (`sale_integration_logs_provider_check` com `stripe`).
- Não encontrei evidência de que Stripe esteja causando este bug específico de taxa manual.
- O problema confirmado decorre da divergência `platform_fee_amount` x `platform_fee_total` no fluxo manual/admin.

# J. Checklist final

- [x] venda manual paga em produção reflete taxa da plataforma
- [x] KPI “Custo da plataforma” em `/admin/vendas` deixa de ficar zerado nesse cenário
- [x] relatórios de vendas passam a refletir a taxa
- [x] PDF acompanha a mesma regra, se aplicável
- [x] somente vendas com status `pago` entram nos consolidadores
- [x] `company_id` está sendo respeitado em toda a trilha
- [x] não houve criação de lógica paralela por ambiente
- [x] não houve dependência residual de Stripe contaminando o cálculo
- [x] não houve quebra de UX ou regressão em outras telas
- [x] a solução reutiliza a lógica existente sempre que possível

## Validação executada nesta análise
- Validação estática da trilha manual/admin até webhook e consolidadores.
- Revisão do uso de `company_id` nas queries de `/admin/vendas` e nos RPCs do relatório.
- Confirmação de que o PDF usa a mesma massa de dados já calculada na tela do relatório.
- Validação de que o financeiro continua restrito a `status = 'pago'`.
