# Análise 4 — Auditoria pós-correção do wizard `/vendas/servicos`

## Diagnóstico geral

Escopo auditado sem alteração de código, com foco em impacto colateral da correção mínima anterior.

### 1) Status `pendente` e `pendente_taxa` (impacto em relatórios/dashboards/filtros/diagnóstico)

**Achado:** a base aceita os novos status (`sale_status`), porém parte relevante do front administrativo ainda não oferece esses status nos filtros/listas principais.

**Evidências objetivas:**
- Migration adiciona os novos valores no enum: `pendente` e `pendente_taxa`.【F:supabase/migrations/20260426130000_service_sales_minimal_compat.sql†L4-L7】
- `/admin/vendas` ainda lista filtros fixos sem esses dois status (`pendente_pagamento`, `reservado`, `pago`, `cancelado`, `bloqueado`).【F:src/pages/admin/Sales.tsx†L1713-L1726】
- `/admin/relatorios/vendas` idem (sem `pendente` e `pendente_taxa`).【F:src/pages/admin/SalesReport.tsx†L710-L723】
- `/admin/relatorios/comissao-vendedores` idem (sem os novos status).【F:src/pages/admin/SellersCommissionReport.tsx†L587-L597】
- `/admin/diagnostico-vendas` idem (sem os novos status).【F:src/pages/admin/SalesDiagnostic.tsx†L2511-L2522】
- Dashboard continua com mapa visual de status sem os novos valores, mantendo apenas `pago`, `pendente_pagamento`, `reservado`, `cancelado`.【F:src/pages/admin/Dashboard.tsx†L112-L123】

**Conclusão:**
- Há risco **médio** de invisibilidade operacional/analítica parcial: os dados existem, mas o operador pode não conseguir filtrar rapidamente por esses novos estados nas telas mais usadas.

---

### 2) `trip_id` e `boarding_location_id` nullable (risco em telas legadas)

**Achado:** o schema foi flexibilizado corretamente para serviço avulso, mas telas legadas de vendas/relatórios continuam assumindo chave composta com `trip_id` + `boarding_location_id`.

**Evidências objetivas:**
- Migration remove `NOT NULL` de `trip_id`/`boarding_location_id` em `sales`.【F:supabase/migrations/20260426130000_service_sales_minimal_compat.sql†L8-L11】
- Wizard grava `trip_id: null` e `boarding_location_id: null` por desenho operacional do serviço avulso.【F:src/pages/admin/ServiceSales.tsx†L209-L214】
- `/admin/vendas` e `/admin/relatorios/vendas` montam chaves e consultas de embarque baseadas nesses campos, sem ramificação específica para venda sem logística de passagem.【F:src/pages/admin/Sales.tsx†L612-L623】【F:src/pages/admin/SalesReport.tsx†L230-L234】【F:src/pages/admin/SalesReport.tsx†L301-L333】

**Conclusão:**
- Risco **médio** de comportamento parcial/ruído visual em telas legadas (labels/joins de embarque) quando linhas de serviço sem trip/local aparecem misturadas com passagens.
- Não foi encontrada quebra fatal imediata no código auditado, mas há acoplamento claro com o modelo antigo de passagem.

---

### 3) Acesso da rota `/vendas/servicos` (menu x rota direta)

**Achado:** rota está registrada, porém não há item correspondente no menu lateral admin.

**Evidências objetivas:**
- Rota existe em `App.tsx`.【F:src/App.tsx†L141-L143】
- `AdminSidebar` exibe `/admin/vendas` e `/admin/servicos`, mas não contém `/vendas/servicos`.【F:src/components/layout/AdminSidebar.tsx†L86-L94】【F:src/components/layout/AdminSidebar.tsx†L135-L139】

**Conclusão:**
- Acesso atual é essencialmente por rota direta (ou deep link). Risco **baixo** técnico, **médio** operacional (descobribilidade).

---

### 4) Respeito a `company_id`

**Achado:** fluxo do wizard respeita `company_id` nas leituras e escritas principais.

**Evidências objetivas:**
- Leitura de `events` e `event_services` filtrada por `company_id`.【F:src/pages/admin/ServiceSales.tsx†L137-L147】
- Inserção em `sales` inclui `company_id: activeCompanyId`.【F:src/pages/admin/ServiceSales.tsx†L218-L223】
- `sale_logs` inclui `company_id` e `performed_by`.【F:src/pages/admin/ServiceSales.tsx†L245-L255】
- Update de capacidade em `event_services` filtra `id` + `company_id`.【F:src/pages/admin/ServiceSales.tsx†L259-L264】

**Conclusão:**
- Multi-tenant está **coerente** no fluxo auditado.

---

### 5) Consistência de capacidade

**Achado:** existe validação prévia (`quantity <= available`), porém a atualização de capacidade não é transacional/atômica.

**Evidências objetivas:**
- Validação local antes do save (`quantity > availableQuantity` bloqueia).【F:src/pages/admin/ServiceSales.tsx†L188-L190】
- Persistência faz update simples `sold_quantity + quantity` após gravação da venda/log, sem lock transacional no banco.【F:src/pages/admin/ServiceSales.tsx†L259-L264】
- Dívida técnica de concorrência já estava registrada na análise anterior.【F:docs/Analises/analise-3-correcao-wizard-venda-servicos.md†L116-L119】

**Conclusão:**
- Risco **médio-alto** em cenários de concorrência simultânea.

---

### 6) Uso de `sale_logs` para item de serviço

**Achado:** funcional para rastreabilidade mínima nesta etapa, porém com limitação analítica/estrutural.

**Evidências objetivas:**
- Item de serviço é salvo como JSON em `sale_logs.new_value` (`action: service_item_registered`).【F:src/pages/admin/ServiceSales.tsx†L243-L255】

**Conclusão:**
- Para MVP operacional imediato: **suficiente**.
- Para auditoria/BI evolutivo: risco **médio** (dados sem estrutura relacional própria de item).

---

### 7) `payment_environment` no fluxo operacional

**Achado:** wizard usa `useRuntimePaymentEnvironment` e bloqueia confirmação se ambiente não estiver resolvido.

**Evidências objetivas:**
- Hook de ambiente carregado no wizard e validação explícita antes de salvar.【F:src/pages/admin/ServiceSales.tsx†L33-L35】【F:src/pages/admin/ServiceSales.tsx†L201-L203】
- Persistência usa `payment_environment: runtimePaymentEnvironment` (sem hardcode fixo).【F:src/pages/admin/ServiceSales.tsx†L223-L224】

**Conclusão:**
- Implementação está **adequada** para o padrão atual do projeto.

---

### 8) Entidade “agencia”

**Achado:** não foi identificada criação de nova entidade “agencia” na correção auditada.

**Evidências objetivas:**
- Ajustes concentrados em `sales`, status e wizard; sem novos artefatos/tabelas de “agencia”.【F:supabase/migrations/20260426130000_service_sales_minimal_compat.sql†L1-L16】

**Conclusão:**
- Requisito de usar empresa/company existente foi mantido.

---

## Problemas encontrados

1. **Filtros e visões não contemplam `pendente`/`pendente_taxa` em telas centrais** (Vendas, Relatório de Vendas, Comissão, Diagnóstico, Dashboard).
2. **Acoplamento legado com trip/boarding** nas telas antigas pode gerar leitura parcial/ruído para vendas de serviço sem logística.
3. **Controle de capacidade não transacional** (janela para inconsistência concorrente).
4. **Item de serviço em `sale_logs`** atende curto prazo, mas limita consolidação analítica futura.

---

## Riscos por criticidade

### Alta
- **Nenhum risco alto imediato confirmado** no escopo auditado.

### Média
- Inconsistência operacional de filtro/status (novos estados não visíveis em várias telas).
- Potencial ruído em telas legadas que pressupõem trip/boarding para toda venda.
- Concorrência de capacidade sem proteção transacional.
- Evolução analítica limitada por item em `sale_logs` JSON.

### Baixa
- Rota `/vendas/servicos` sem entrada no menu (acesso por URL direta).

---

## Correções mínimas recomendadas (próxima etapa)

1. **Atualizar filtros/labels de status** nas telas administrativas críticas para incluir `pendente` e `pendente_taxa`.
2. **Adicionar fallback visual explícito** para vendas sem `trip/boarding` em listagens/relatórios (ex.: “Venda de serviço avulsa”).
3. **Aplicar salvaguarda mínima de capacidade no banco** (ex.: update condicional por disponibilidade) sem refatorar arquitetura.
4. **Planejar transição de item para estrutura relacional (`sale_items`)** quando iniciar fase de relatórios/BI, mantendo `sale_logs` como trilha auxiliar.
5. **Adicionar link de menu para `/vendas/servicos`** com permissão adequada para reduzir dependência de rota direta.

---

## Checklist de aprovação para próxima etapa

- [ ] Filtros/status de `pendente` e `pendente_taxa` visíveis em Vendas, Relatório, Diagnóstico e Dashboard.
- [ ] Vendas sem trip/boarding exibidas com fallback claro nas telas legadas.
- [ ] Capacidade com proteção mínima contra concorrência simultânea.
- [ ] Estratégia definida para evolução de `sale_logs` -> estrutura de item quando entrar em fase analítica.
- [ ] Rota `/vendas/servicos` acessível por menu (não apenas URL direta).
- [ ] Confirmado que nenhuma entidade “agencia” foi introduzida.
