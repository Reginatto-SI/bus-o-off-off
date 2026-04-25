# 01 — Catálogo de Telas Públicas (índice de rotas e arquivos)

## 1) Objetivo
Mapear as telas públicas do SmartBus BR como **catálogo/índice** (rotas + arquivos), sem substituir PRDs comportamentais individuais.

## 2) Escopo
Arquivos em `src/pages/public/**` e rotas públicas declaradas em `src/App.tsx`.

## 3) Padrão funcional comum
- Navegação por `react-router`.
- Acesso sem autenticação obrigatória (salvo bloqueios específicos definidos internamente em cada página).
- Dependência de dados públicos e/ou fluxos de checkout/consulta conforme cada tela.

## Nota de escopo deste documento
Este arquivo é um **índice de telas**. Para comportamento detalhado (regras, falhas, integrações e diagnóstico), usar os PRDs comportamentais dedicados da Fase 1 quando disponíveis.

## 4) Catálogo de telas mapeadas (não substitui PRD comportamental)

### 4.1 `/` — PublicRootRedirect
- **Arquivo:** `src/pages/public/PublicRootRedirect.tsx`
- **Objetivo:** resolver a entrada principal e redirecionar para o portal público padrão.
- **Comportamento atual:** rota raiz não renderiza catálogo próprio; atua como ponte de navegação.

### 4.2 `/eventos` — PublicEvents
- **Arquivo:** `src/pages/public/PublicEvents.tsx`
- **Objetivo:** listar eventos públicos disponíveis para navegação e compra.
- **Entradas:** filtros/listagem pública de eventos.
- **Saídas:** navegação para detalhe (`/eventos/:id`) e demais CTAs públicos.

### 4.3 `/eventos/:id` — PublicEventDetail
- **Arquivo:** `src/pages/public/PublicEventDetail.tsx`
- **Objetivo:** exibir detalhes do evento selecionado e preparar entrada para checkout.
- **Dependência de rota:** parâmetro `id`.

### 4.4 `/eventos/:id/checkout` — Checkout
- **Arquivo:** `src/pages/public/Checkout.tsx`
- **Objetivo:** capturar dados de compra e iniciar cobrança via fluxo oficial do sistema.
- **Dependência de rota:** parâmetro `id` do evento.
- **Observação:** integra com ciclo de confirmação documentado nos PRDs Asaas.

### 4.5 `/confirmacao/:id` — Confirmation
- **Arquivo:** `src/pages/public/Confirmation.tsx`
- **Objetivo:** apresentar status final/atual da venda iniciada no checkout.
- **Dependência de rota:** parâmetro `id` da venda/transação.

### 4.6 `/consultar-passagens` — TicketLookup
- **Arquivo:** `src/pages/public/TicketLookup.tsx`
- **Objetivo:** permitir consulta pública de passagens já emitidas.

### 4.7 `/v/:code` — SellerRedirect
- **Arquivo:** `src/pages/public/SellerRedirect.tsx`
- **Objetivo:** resolver código curto de vendedor e redirecionar para o destino comercial definido pelo fluxo atual.
- **Dependência de rota:** parâmetro `code`.

### 4.8 `/cadastro` — CompanyRegistration
- **Arquivo:** `src/pages/public/CompanyRegistration.tsx`
- **Objetivo:** cadastro público de nova empresa na plataforma.

### 4.9 `/cadastro-empresa` — redirect legado
- **Arquivo de origem funcional:** `src/App.tsx`
- **Objetivo:** preservar links antigos.
- **Comportamento atual:** `Navigate` para `/cadastro`.

### 4.10 `/seja-representante` — RepresentativeRegistration
- **Arquivo:** `src/pages/public/RepresentativeRegistration.tsx`
- **Objetivo:** inscrição/cadastro público para perfil de representante.

### 4.11 `/i/:code` — CompanyReferralRedirect
- **Arquivo:** `src/pages/public/CompanyReferralRedirect.tsx`
- **Objetivo:** resolver código de indicação de empresa e executar redirecionamento correspondente.
- **Dependência de rota:** parâmetro `code`.

### 4.12 `/empresa/:nick` — PublicCompanyShowcase
- **Arquivo:** `src/pages/public/PublicCompanyShowcase.tsx`
- **Objetivo:** vitrine pública da empresa identificada por slug (`nick`).
- **Dependência de rota:** parâmetro `nick`.

### 4.13 `/:nick` — PublicCompanyShortLink
- **Arquivo:** `src/pages/public/PublicCompanyShortLink.tsx`
- **Objetivo:** atalho curto para vitrine pública da empresa.
- **Dependência de rota:** parâmetro `nick`.

### 4.14 `/politica-de-intermediacao` — IntermediationPolicy
- **Arquivo:** `src/pages/public/IntermediationPolicy.tsx`
- **Objetivo:** página institucional/legal da política de intermediação.

### 4.15 `/sobre-smartbus-br` — AboutSmartbus
- **Arquivo:** `src/pages/public/AboutSmartbus.tsx`
- **Objetivo:** apresentar proposta institucional da plataforma.

### 4.16 `/sistema-para-excursoes` — SystemForExcursionsPage
- **Arquivo:** `src/pages/public/SystemForExcursionsPage.tsx`
- **Objetivo:** landing/página temática de posicionamento comercial para excursões.

### 4.17 Tela existente sem rota ativa — LandingPage
- **Arquivo:** `src/pages/public/LandingPage.tsx`
- **Objetivo identificado no código:** tela pública de landing.
- **Estado de roteamento:** não importada em `src/App.tsx` atualmente.

## 5) Regras de consistência e segurança
- Páginas públicas não devem permitir acesso administrativo sem autenticação e autorização.
- Fluxos de compra/consulta devem seguir as regras centrais já implementadas (sem variações paralelas por tela).
- Quando houver relação com empresa específica, a resolução deve ocorrer por identificadores de rota (`id`, `nick`, `code`) e backend oficial.

## 6) Critérios de aceite deste catálogo
- [x] Todas as rotas públicas de `src/App.tsx` mapeadas.
- [x] Todas as páginas públicas em `src/pages/public` classificadas (ativas ou sem rota ativa).
- [x] Sem definição de regra de negócio nova fora do código.
