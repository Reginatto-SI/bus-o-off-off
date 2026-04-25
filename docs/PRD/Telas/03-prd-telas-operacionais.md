# 03 — Catálogo de Telas Operacionais, Acesso e Exceção (índice de rotas e arquivos)

## 1) Objetivo
Mapear as telas operacionais e de acesso como **catálogo/índice** (rotas + arquivos), sem substituir PRDs comportamentais individuais.

## 2) Escopo
- `src/pages/Login.tsx`
- `src/pages/seller/SellerDashboard.tsx`
- `src/pages/driver/*.tsx`
- `src/pages/representative/RepresentativeDashboard.tsx`
- `src/pages/NotFound.tsx`

## Nota de escopo deste documento
Este arquivo é um **índice de telas**. Para comportamento detalhado (regras operacionais, cenários de falha e diagnóstico), consultar PRDs comportamentais dedicados quando existentes.

## 3) Catálogo de telas mapeadas (não substitui PRD comportamental)

### 3.1 `/login` — Login
- **Arquivo:** `src/pages/Login.tsx`
- **Objetivo:** autenticar usuário no sistema e iniciar sessão para áreas restritas.

### 3.2 `/vendedor/minhas-vendas` — SellerDashboard
- **Arquivo:** `src/pages/seller/SellerDashboard.tsx`
- **Objetivo:** operação mobile-first do vendedor para acompanhar vendas e ações associadas ao perfil.

### 3.3 `/admin/minhas-vendas` — redirect legado
- **Arquivo de roteamento:** `src/App.tsx`
- **Objetivo:** compatibilidade de bookmarks antigos.
- **Comportamento atual:** redireciona para `/vendedor/minhas-vendas`.

### 3.4 `/motorista` — DriverHome
- **Arquivo:** `src/pages/driver/DriverHome.tsx`
- **Objetivo:** ponto de entrada do portal do motorista.

### 3.5 `/motorista/validar` — DriverValidate
- **Arquivo:** `src/pages/driver/DriverValidate.tsx`
- **Objetivo:** validar passagens no fluxo operacional de embarque.

### 3.6 `/motorista/embarque` — DriverBoarding
- **Arquivo:** `src/pages/driver/DriverBoarding.tsx`
- **Objetivo:** apoiar operação de embarque e acompanhamento de passageiros.

### 3.7 `/motorista/preferencias` — DriverPreferences
- **Arquivo:** `src/pages/driver/DriverPreferences.tsx`
- **Objetivo:** configurar preferências operacionais do motorista.

### 3.8 `/representante/painel` — RepresentativeDashboard
- **Arquivo:** `src/pages/representative/RepresentativeDashboard.tsx`
- **Objetivo:** painel exclusivo de representante para acompanhamento comercial e indicadores do perfil.

### 3.9 `*` — NotFound
- **Arquivo:** `src/pages/NotFound.tsx`
- **Objetivo:** resposta padrão para rotas inexistentes.

## 4) Regras transversais
- As telas operacionais devem manter comportamento previsível por perfil (vendedor, motorista, representante).
- Rotas legadas precisam manter redirecionamento explícito para evitar quebra de links antigos.
- Qualquer leitura/escrita de dados por empresa deve continuar condicionada ao contexto multiempresa no backend.

## 5) Critérios de aceite deste catálogo
- [x] Todas as rotas operacionais e de login documentadas.
- [x] Rota fallback `*` documentada.
- [x] Redirect legado `/admin/minhas-vendas` documentado.
