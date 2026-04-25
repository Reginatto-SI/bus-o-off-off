# Step 2 — Validação do financeiro oficial e padronização de KPIs

## 1. Objetivo
Padronizar relatórios e KPIs para que o financeiro oficial e a comissão oficial considerem somente vendas `pago`, mantendo pendentes/canceladas em contexto operacional sem contaminar consolidação financeira.

## 2. Problema identificado antes da correção
- RPCs de relatório de vendas somavam `gross_revenue` sem restringir a `pago`.
- Relatório por evento considerava qualquer venda não cancelada como vendida, inflando ocupação/receita com pendentes.
- Tela administrativa de vendas exibia “Total Arrecadado” com soma de status não pagos.
- Dashboards de vendedor mostravam “Total Vendido” sem deixar claro que era valor gerado (não necessariamente pago).

## 3. O que foi implementado
1. Nova migration SQL ajustando `get_sales_report_summary_paginated` e `get_sales_report_kpis` para calcular métricas financeiras (`gross_revenue`, `platform_fee`, `sellers_commission`) somente com `status='pago'`.
2. Ajustes semânticos no `SalesReport`:
   - “Receita Bruta (Pagas)”; 
   - “Vendas Geradas” para contagem total;
   - ticket médio financeiro calculado por vendas pagas.
3. Ajustes no `EventReport`:
   - ocupação e receita consolidadas usando apenas vendas pagas;
   - labels de “Passagens pagas” e “Receita (pagas)”.
4. Ajustes no `Sales` (admin):
   - “Total Arrecadado (Pagas)” somente com `pago`;
   - “Reservadas/Pendentes” como pipeline operacional.
5. Ajustes em dashboards de vendedor (`SellerDashboard` e `MySales`):
   - separação de “Valor Gerado” vs valores pagos;
   - comissão oficial baseada apenas em vendas pagas.
6. Inclusão de `pendente_pagamento` na distribuição de status do `Dashboard` para evitar leitura binária incorreta entre reservado/pago/cancelado.

## 4. Regra final aplicada
- **Financeiro oficial:** somente `status='pago'` entra em receita bruta oficial, taxa da plataforma e comissão oficial.
- **Comissão oficial:** somente vendas pagas.
- **Pendentes:** continuam aparecendo em visão operacional/comercial (pipeline), com nomenclatura explícita.
- **Canceladas:** fora do financeiro oficial e da comissão oficial.

## 5. Proteções e decisões de compatibilidade
- Contagens operacionais (`total_sales`, `cancelled_sales`) foram preservadas para histórico e acompanhamento comercial.
- A mudança foi concentrada em agregações/labels existentes, sem criar nova arquitetura de relatórios.
- Comentários adicionados nos pontos críticos para deixar explícita a regra de negócio do Step 2.

## 6. Evidências técnicas
- Migration:
  - `supabase/migrations/20261016103000_fix_sales_report_financial_paid_only.sql`
- Front-end/admin:
  - `src/pages/admin/SalesReport.tsx`
  - `src/pages/admin/EventReport.tsx`
  - `src/pages/admin/Sales.tsx`
  - `src/pages/admin/Dashboard.tsx`
- Front-end/vendedor:
  - `src/pages/seller/SellerDashboard.tsx`
  - `src/pages/admin/MySales.tsx`

## 7. Como validar manualmente
1. Criar/usar vendas de teste com mix de status (`pendente_pagamento`, `pago`, `cancelado`).
2. Em `/admin/relatorios/vendas`, validar:
   - “Receita Bruta (Pagas)” não inclui pendente/cancelado;
   - “Vendas Geradas” continua mostrando total do pipeline.
3. Em `/admin/relatorios/eventos`, validar:
   - passagens/ocupação/receita consolidadas não sobem com pendente;
   - sobem apenas após `pago`.
4. Em `/admin/vendas`, validar:
   - “Total Arrecadado (Pagas)” reflete somente pagas;
   - card de reservadas/pendentes mantém visão operacional.
5. Em dashboards de vendedor, validar:
   - “Valor Gerado” pode incluir pendente;
   - comissão oficial não soma vendas não pagas.

## 8. Limitações ou pontos de atenção
- Este Step 2 não implementa segregação completa sandbox/produção em todos os relatórios; isso permanece como ponto de atenção para step específico de ambiente.
- Alguns indicadores operacionais continuam exibindo volume gerado para uso comercial, agora com nomenclatura explícita.

## 9. Conclusão
- **Step 2 concluído:** sim, no escopo de padronização financeira/comissão e semântica de KPIs.
- **Seguro seguir para o Step 3:** sim.
- **Pendência bloqueante:** não há bloqueante técnico neste step; apenas aplicar migration e deploy para refletir em ambiente.
