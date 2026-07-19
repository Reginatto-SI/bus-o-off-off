
# Melhorias de desempenho — Início (mobile) e Vendas

## Diagnóstico (verificado no código atual)

### `/admin/vendas` (`src/pages/admin/Sales.tsx`)
1. A consulta principal `fetchSales` **já pagina no banco** (`.range()` + `count: 'exact'`, 20 por página) e já filtra por `activeCompanyId`. Isso está correto.
2. Consultas auxiliares (`tickets`, `event_boarding_locations`, `seat_locks`) já são feitas apenas para os 20 IDs da página. Também correto.
3. **Gargalo real 1 — sem debounce na busca:** o `useEffect` da linha 913 depende de `filters` inteiro; cada tecla dispara `fetchSales()` + `resolveSearchScope()` (2 consultas extras a `tickets` e `events`) + `fetchGlobalReservationRiskSummary()` (mais 2 counts em `sales`). Em um digitar normal isso empilha dezenas de requisições.
4. **Gargalo real 2 — bloqueio serial:** `fetchSales` só chama `setLoading(false)` depois de terminar as consultas auxiliares (tickets/embarque/locks). A lista principal só aparece quando tudo termina.
5. **Gargalo real 3 — indicadores derivados só da página atual:** os KPIs "Pagas / Pendentes / Reservas / Canceladas / Total arrecadado / Custo da plataforma / Comissão dos vendedores" (linhas 1067‑1102) são calculados a partir de `sales` (os 20 registros) — não refletem o total da empresa. O usuário pediu explicitamente para usar **consultas resumidas** preservando as mesmas regras. Isso será corrigido sem alterar as regras de status.
6. **Gargalo real 4 — sequência de dois `fetchSales` em navegação:** ao mudar filtro, `currentPage` também é resetado em outros efeitos, o que pode disparar duas cargas seguidas.

### `/admin/dashboard` (`src/pages/admin/Dashboard.tsx`)
1. As queries do **mobile home** (`mobileTodaySummary`, `mobileRecentSales`) já estão bem enxutas: `limit(3)` para últimas vendas, filtro por dia e por empresa, seleção mínima de colunas.
2. **Gargalo real:** as queries pesadas do dashboard **desktop** (`opKpis`, `finKpis`, `dailySales`, `statusDist`, `topEvents`, `topSellers` — linhas 1015‑1237) usam apenas `enabled = Boolean(activeCompanyId)`; **rodam também no mobile**, mesmo com a home mobile visível. Cada uma varre `sales` do período (últimos N dias) sem `limit`, e `statusDist` faz 4 counts sequenciais. É esse tráfego oculto que deixa a home mobile lenta.

## Alterações planejadas (pequenas e direcionadas)

### 1. `src/pages/admin/Dashboard.tsx` — desativar queries desktop no mobile
- Trocar `enabled` das queries `opKpis`, `finKpis`, `dailySales`, `statusDist`, `topEvents`, `topSellers` para `enabled && !isMobileDashboardHomeVisible`.
- Efeito: no mobile só rodam `mobileTodaySummary` (1 select agregado + 1 count) e `mobileRecentSales` (3 linhas). A tela fica praticamente instantânea.
- Nenhuma mudança em desktop, layout, KPIs ou regras.

### 2. `src/pages/admin/Sales.tsx` — debounce da busca
- Introduzir estado local `searchInput` no `SalesFiltersCard`/topo e propagar para `filters.search` após ~350 ms (padrão `setTimeout` já usado em outras telas). Sem lib nova.
- Mantém digitação fluida sem disparar consultas por tecla.

### 3. `src/pages/admin/Sales.tsx` — renderização progressiva
- Renderizar a lista/tabela assim que `data` da consulta principal chegar (`setSales` + `setLoading(false)`), e disparar `tickets`/`boarding`/`seat_locks` em paralelo depois, atualizando `seatLabelsMap`/`boardingTimeMap`/`latestLockExpiryMap` de forma incremental.
- Falha em consulta secundária não bloqueia a lista.

### 4. `src/pages/admin/Sales.tsx` — indicadores por consulta resumida
- Nova função `fetchSalesStats()` que, com os mesmos filtros de empresa/data/evento/vendedor/busca da tela, dispara **em paralelo** apenas counts (`select('id', { count: 'exact', head: true })`) por status: `pago`, `pendente_pagamento`, `reservado`, `cancelado`, `bloqueado`, e o total geral.
- Para financeiro (`totalValue`, `totalPlatformFee`, `totalSellersCommission`), usar a RPC já existente `get_sales_report_kpis` (usada no Dashboard) com os mesmos filtros, garantindo aderência à regra oficial e sem trafegar linhas.
- Substituir o `useMemo stats` para consumir esse resultado; sales-da-página deixa de alimentar os cards.
- Rodar `fetchSalesStats` independentemente de `fetchSales` (não bloqueia a lista) e sob o mesmo debounce da busca.

### 5. `src/pages/admin/Sales.tsx` — evitar dupla carga
- Consolidar o `useEffect` para separar dependências de paginação vs. filtros: quando `filters` mudam, resetar `currentPage=1` e disparar `fetchSales` uma única vez.

## Fora do escopo
- Não altera RLS, schema, regras de status, layout desktop, visual mobile, permissões, 20 por página, conteúdo dos cards, rotas, pagamento ou fluxo financeiro.
- Não refatora arquitetura; apenas ajustes cirúrgicos nos dois arquivos citados.

## Validação
- `/admin/dashboard` mobile: verificar via DevTools que só disparam as 2 queries mobile + as 2 de onboarding leve; cards aparecem em <1 s.
- `/admin/vendas`: primeira carga faz 1 query paginada + 1 RPC KPIs + counts de status; digitar não dispara requisição por tecla; trocar de página faz apenas 1 fetch da nova página; totais dos KPIs batem com relatório oficial.
- Isolamento multiempresa preservado (todos os filtros continuam com `.eq('company_id', activeCompanyId)`).
- Desktop do dashboard continua idêntico.
