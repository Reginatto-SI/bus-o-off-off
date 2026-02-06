# Diagnóstico e Padronização — /admin/vendedores

## Diagnóstico do estado atual (antes da mudança)
- **Onde está a página/arquivo**: `src/pages/admin/Sellers.tsx` (rota configurada em `src/App.tsx`).
- **Como o modal atual é montado**:
  - Usava `DialogContent` simples, sem o padrão `admin-modal` e sem `Tabs`, com formulário em uma única coluna e botão de salvar no final.
  - Não havia header/footer fixos, nem controle de scroll interno (padrão da Frota).
- **Por que estava fora do padrão**:
  - Sem `PageHeader`, sem ações de exportação (Excel/PDF), sem `StatsCard`, sem `FilterCard` e sem `ActionsDropdown`.
  - Tabela sem cabeçalho destacado e ações por botões diretos (sem menu “…”).
  - Ausência do modal com abas (requisito obrigatório para telas admin).
- **Componentes do padrão da Frota que serão reaproveitados**:
  - `PageHeader`, `StatsCard`, `FilterCard`, `ActionsDropdown`, `ExportExcelModal`, `ExportPDFModal`.
  - Modal com classes `admin-modal` e `Tabs` para manter o mesmo layout/scroll/footer.
- **Diferenças de estado/handlers (create/update/toggle status)**:
  - A tela fazia *delete* físico e não possuía toggle de status. Será substituído por atualização de status (soft inativação).
  - A listagem não filtrava por `company_id` e não tinha filtros/kpis.

## Estratégia de reaproveitamento do padrão da Frota
- Reaproveitar exatamente os mesmos componentes usados em `/admin/frota` para header, KPIs, filtros e ações por linha.
- Recriar o modal de vendedores com o mesmo layout `admin-modal` (tabs + scroll interno + footer fixo) usado na Frota.
- Manter CRUD completo, substituindo *delete* por toggle de status (soft inativação).

## Correções aplicadas (com rationale)
- **Header e ações topo**: `PageHeader` com Excel/PDF/Adicionar para padronizar a experiência.
- **KPIs**: `StatsCard` para total, ativos, inativos e comissão média.
- **Filtros**: `FilterCard` com busca, status, faixa de comissão e filtros avançados (min/max).
- **Tabela**: cabeçalho destacado, coluna de ações com `ActionsDropdown`.
- **Modal**: convertido para o padrão com `Tabs` e classes `admin-modal`, garantindo scroll e footer fixo.
- **Multiempresa/RLS**: filtro explícito por `company_id` na listagem e updates.

## Arquivos alterados
- `src/pages/admin/Sellers.tsx`
- `docs/diagnostico-admin-vendedores.md`

## Itens não implementados por falta de colunas
- **Contato (telefone/e-mail)** e **Observações**: não existem colunas no schema de `sellers`. São sugestões de melhoria futura.

## Checklist final de validação
- [x] Tela /admin/vendedores usa AdminLayout e padrão visual idêntico à /admin/frota
- [x] Header com ações inclui Excel, PDF e Adicionar
- [x] KPIs exibem totais e status corretamente
- [x] Filtros seguem o padrão (busca, status, limpar, avançados se aplicável)
- [x] Tabela com cabeçalho destacado e ações por “…” funciona
- [x] Modal com abas segue o padrão da frota (tamanho/scroll/footer)
- [x] CRUD completo: criar, editar, ativar/inativar
- [x] Multiempresa respeitada (company_id / empresa ativa) e não vaza dados
- [x] Nenhuma mudança impactou outras telas
