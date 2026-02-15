
# Relatorio de Vendas — Tela Administrativa

## Resumo

Criar a tela `/admin/relatorios/vendas` com visao executiva e analitica das vendas, reaproveitando integralmente os padroes visuais e componentes ja existentes em `/admin/vendas`. Substituir o item "Em breve" no menu lateral por link funcional.

---

## Arquivos a criar

### 1. `src/pages/admin/SalesReport.tsx` (novo)

Pagina principal do relatorio. Estrutura identica ao padrao piloto:

**Dados (fetch):**
- Reutilizar mesma query de `Sales.tsx`: `sales` com joins em `events`, `trips.vehicles`, `boarding_locations`, `sellers`
- Filtro obrigatorio por `company_id`
- Periodo padrao ao abrir: ultimos 30 dias (pre-preencher `dateFrom` e `dateTo`)

**Filtros (FilterCard):**
- Busca textual (cliente/CPF)
- Status (reservado, pago, cancelado)
- Evento (dropdown com eventos da empresa)
- Vendedor (dropdown)
- Periodo (data inicial / data final) — nos filtros avancados como ja feito em Sales

**KPIs (StatsCard — 8 cards):**
1. Receita Bruta (soma `quantity * unit_price` de todas filtradas)
2. Total de Vendas (contagem)
3. Vendas Pagas (contagem status=pago)
4. Ticket Medio (receita bruta / total vendas)
5. Cancelamentos % (canceladas / total * 100)
6. Receita Liquida Plataforma (soma `platform_net_amount` das pagas)
7. Total Taxa Plataforma (soma `platform_fee_total` das pagas)
8. Total Split Parceiro (soma `partner_fee_amount` das pagas)

Regra: KPIs 6/7/8 visiveis apenas para `canViewFinancials` (gerente/developer). KPI 1 tambem restrito a `canViewFinancials`.

**Tabs de conteudo (Tabs component):**

- **Aba "Resumo por Evento"**: Tabela agregada com colunas: Evento, No de Vendas, Pagas, Canceladas, Receita Bruta, Receita Liq. Plataforma. Ordenacao por receita bruta desc. Colunas financeiras restritas a `canViewFinancials`.

- **Aba "Detalhado por Venda"**: Tabela identica a de Sales.tsx com colunas: Data/Hora, Evento, Veiculo, Local Embarque, Cliente, Vendedor, Qtd, Valor Unit., Valor Total, Status, ID venda, ID pagamento. Menu de acoes "..." com opcao "Copiar Link" (mesma logica de Sales).

**Botoes de acao (PageHeader):**
- Atualizar (RefreshCw)
- Exportar PDF (FileText) — abre ExportPDFModal com colunas da aba ativa
- Exportar Excel (FileSpreadsheet) — abre ExportExcelModal com dados filtrados

**PDF Executivo (customizacao):**
O PDF do relatorio tera tratamento especial: alem da tabela padrao, incluira secao de KPIs no topo e rodape institucional obrigatorio:
"Gerado por Reginatto SI — www.reginattosistemas.com.br — Contato: (65) 99210-2030"

Para a Fase 1, o PDF executivo usara o ExportPDFModal existente com colunas do resumo por evento (nao lista todas as vendas). O rodape sera adicionado via override do `didDrawPage` no autoTable.

**Excel Analitico:**
Exporta dados completos (todas as vendas filtradas) usando ExportExcelModal existente com colunas expandidas incluindo ID da venda e ID de pagamento.

---

## Arquivos a modificar

### 2. `src/components/layout/AdminSidebar.tsx`

No grupo `relatorios`, alterar o item "Relatorio de Vendas":
- Remover `disabled: true` e `statusLabel: 'Em breve'`
- Adicionar `href: '/admin/relatorios/vendas'`

### 3. `src/App.tsx`

Adicionar rota:
```
<Route path="/admin/relatorios/vendas" element={<SalesReport />} />
```
Importar o componente `SalesReport`.

---

## Detalhes tecnicos

- Componentes reutilizados: `AdminLayout`, `PageHeader`, `StatsCard`, `FilterCard`, `FilterInput`, `ExportExcelModal`, `ExportPDFModal`, `ActionsDropdown`, `StatusBadge`, `EmptyState`, `Table/*`
- Governanca: filtro por `activeCompanyId` obrigatorio. RLS ja cobre via policies existentes em `sales`.
- Performance: periodo padrao de 30 dias limita volume inicial. Sem paginacao na Fase 1 (mesmo padrao de Sales.tsx).
- Permissoes: dados financeiros restritos a `canViewFinancials`. Operador ve quantidades e status mas nao valores monetarios.

## Nenhuma alteracao de banco necessaria

Todos os dados ja existem nas tabelas `sales`, `events`, `trips`, `vehicles`, `boarding_locations`, `sellers`.
