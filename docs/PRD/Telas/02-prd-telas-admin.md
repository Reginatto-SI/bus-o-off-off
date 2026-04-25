# 02 — Catálogo de Telas Administrativas (índice de rotas e arquivos)

## 1) Objetivo
Mapear as telas do painel administrativo (`/admin/**`) como **catálogo/índice** (rotas + arquivos), sem substituir PRDs comportamentais individuais.

## 2) Escopo
Arquivos em `src/pages/admin/**` ligados às rotas de `src/App.tsx`.

## 3) Regras transversais do módulo admin
- Área protegida por autenticação/autorização de perfil administrativo.
- Operações devem respeitar isolamento da empresa ativa (`company_id`) e políticas RLS no backend.
- Layout padrão administrativo (`AdminLayout`) e componentes compartilhados de tabela/filtro/modal são referência visual e operacional.

## Nota de escopo deste documento
Este arquivo é um **índice de telas**. Para comportamento detalhado (fluxo real, regras de negócio, falhas e diagnóstico), consultar os PRDs comportamentais dedicados.

## 4) Catálogo de telas mapeadas (não substitui PRD comportamental)

### 4.1 `/admin` → redirect para `/admin/dashboard`
- **Arquivo de roteamento:** `src/App.tsx`
- **Objetivo:** evitar tela vazia e consolidar entrada do admin no dashboard.

### 4.2 `/admin/dashboard` — Dashboard
- **Arquivo:** `src/pages/admin/Dashboard.tsx`
- **Objetivo:** visão executiva com indicadores principais da operação.

### 4.3 `/admin/eventos` — Events
- **Arquivo:** `src/pages/admin/Events.tsx`
- **Objetivo:** gestão de eventos (listagem, filtros e ações de manutenção).

### 4.4 `/admin/eventos/:id` — EventDetail
- **Arquivo:** `src/pages/admin/EventDetail.tsx`
- **Objetivo:** edição/detalhamento de um evento específico.
- **Dependência:** parâmetro `id`.

### 4.5 `/admin/frota` — Fleet
- **Arquivo:** `src/pages/admin/Fleet.tsx`
- **Objetivo:** gestão da frota de veículos.

### 4.6 `/admin/motoristas` — Drivers
- **Arquivo:** `src/pages/admin/Drivers.tsx`
- **Objetivo:** cadastro e manutenção de motoristas.

### 4.7 `/admin/auxiliares-embarque` — BoardingAssistants
- **Arquivo:** `src/pages/admin/BoardingAssistants.tsx`
- **Objetivo:** gestão de auxiliares de embarque.

### 4.8 `/admin/locais` — BoardingLocations
- **Arquivo:** `src/pages/admin/BoardingLocations.tsx`
- **Objetivo:** gestão de locais/pontos de embarque.

### 4.9 `/admin/vendedores` — Sellers
- **Arquivo:** `src/pages/admin/Sellers.tsx`
- **Objetivo:** cadastro e governança de vendedores.

### 4.10 `/admin/vendas` — Sales
- **Arquivo:** `src/pages/admin/Sales.tsx`
- **Objetivo:** operação de vendas administrativas (consulta e ações operacionais).

### 4.11 `/admin/usuarios` — Users
- **Arquivo:** `src/pages/admin/Users.tsx`
- **Objetivo:** administração de usuários e vínculos de acesso.

### 4.12 `/admin/empresa` — Company
- **Arquivo:** `src/pages/admin/Company.tsx`
- **Objetivo:** configuração da empresa ativa (cadastro, identidade, políticas e pagamentos).
- **Referência detalhada:** `docs/PRD/Telas/prd-admin-empresa.md`.

### 4.13 `/admin/indicacoes` — Referrals
- **Arquivo:** `src/pages/admin/Referrals.tsx`
- **Objetivo:** gestão e acompanhamento do módulo de indicações.

### 4.14 `/admin/minha-conta` — MyAccount
- **Arquivo:** `src/pages/admin/MyAccount.tsx`
- **Objetivo:** manutenção dos dados da conta do usuário autenticado.

### 4.15 `/admin/patrocinadores` — Sponsors
- **Arquivo:** `src/pages/admin/Sponsors.tsx`
- **Objetivo:** gestão de patrocinadores vinculados à operação/eventos.

### 4.16 `/admin/socios` — SociosSplit
- **Arquivo:** `src/pages/admin/SociosSplit.tsx`
- **Objetivo:** gestão de sócios/participação em distribuição financeira conforme regras oficiais.

### 4.17 `/admin/parceiros` — CommercialPartners
- **Arquivo:** `src/pages/admin/CommercialPartners.tsx`
- **Objetivo:** gestão de parceiros comerciais.

### 4.18 `/admin/programas-beneficio` — BenefitPrograms
- **Arquivo:** `src/pages/admin/BenefitPrograms.tsx`
- **Objetivo:** listagem e governança dos programas de benefício.

### 4.19 `/admin/programas-beneficio/novo` — BenefitProgramEditor
- **Arquivo:** `src/pages/admin/BenefitProgramEditor.tsx`
- **Objetivo:** criação de programa de benefício.

### 4.20 `/admin/programas-beneficio/:id` — BenefitProgramEditor
- **Arquivo:** `src/pages/admin/BenefitProgramEditor.tsx`
- **Objetivo:** edição de programa de benefício existente.
- **Dependência:** parâmetro `id`.

### 4.21 `/admin/relatorios/vendas` — SalesReport
- **Arquivo:** `src/pages/admin/SalesReport.tsx`
- **Objetivo:** relatório gerencial de vendas.

### 4.22 `/admin/relatorios/eventos` — EventReport
- **Arquivo:** `src/pages/admin/EventReport.tsx`
- **Objetivo:** relatório gerencial por eventos.

### 4.23 `/admin/relatorios/comissao-vendedores` — SellersCommissionReport
- **Arquivo:** `src/pages/admin/SellersCommissionReport.tsx`
- **Objetivo:** relatório de comissão de vendedores.

### 4.24 `/admin/relatorios/lista-embarque` — BoardingManifestReport
- **Arquivo:** `src/pages/admin/BoardingManifestReport.tsx`
- **Objetivo:** emissão/consulta da lista de embarque operacional.

### 4.25 `/admin/templates-layout` — TemplatesLayout
- **Arquivo:** `src/pages/admin/TemplatesLayout.tsx`
- **Objetivo:** gestão de templates/layouts de comunicação/documentos.

### 4.26 `/admin/diagnostico-vendas` — SalesDiagnostic
- **Arquivo:** `src/pages/admin/SalesDiagnostic.tsx`
- **Objetivo:** diagnóstico operacional e técnico de vendas/pagamentos.

### 4.27 Tela existente sem rota ativa — MySales
- **Arquivo:** `src/pages/admin/MySales.tsx`
- **Objetivo identificado no código:** visão de “minhas vendas” administrativa.
- **Estado de roteamento:** sem rota ativa em `src/App.tsx` (substituída por portal vendedor em `/vendedor/minhas-vendas`).

## 5) Critérios de aceite deste catálogo
- [x] Todas as rotas `/admin/**` em `src/App.tsx` documentadas.
- [x] Todas as páginas em `src/pages/admin` classificadas (ativas/sem rota ativa).
- [x] Referência explícita ao PRD detalhado já existente de `/admin/empresa`.
