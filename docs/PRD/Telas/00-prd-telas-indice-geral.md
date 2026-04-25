# 00 — PRD Telas SmartBus BR: Índice Geral (estado atual do código)

## 1) Objetivo
Consolidar o inventário oficial de **todas as telas identificadas no frontend** (rotas ativas e páginas existentes sem rota ativa), mantendo rastreabilidade por arquivo e sem inferir comportamento fora do código.

## 2) Fonte de verdade utilizada
- Mapeamento de rotas em `src/App.tsx`.
- Implementações de página em `src/pages/**`.
- PRD específico já existente para `/admin/empresa`.

## 3) Regras transversais (válidas para os PRDs de telas)
- Isolamento multiempresa por `company_id` deve ser respeitado no backend/RLS quando houver leitura/escrita de dados por tenant.
- Não criar fluxo paralelo: os PRDs descrevem somente comportamentos já suportados no código atual.
- Quando a tela depende de APIs/Edge Functions, o PRD referencia o uso já existente sem redefinir regra de negócio.

## 4) Pacote de PRDs de telas
- `01-prd-telas-publicas.md` — portal público e páginas institucionais.
- `02-prd-telas-admin.md` — painel administrativo e relatórios.
- `03-prd-telas-operacionais.md` — vendedor, motorista, representante, login e páginas de suporte técnico.
- `prd-admin-empresa.md` — documento detalhado dedicado à tela `/admin/empresa`.

## 5) Cobertura consolidada
### 5.1 Rotas públicas
- `/`, `/eventos`, `/eventos/:id`, `/eventos/:id/checkout`, `/confirmacao/:id`, `/consultar-passagens`, `/v/:code`, `/cadastro`, `/cadastro-empresa`, `/seja-representante`, `/i/:code`, `/empresa/:nick`, `/:nick`, `/politica-de-intermediacao`, `/sobre-smartbus-br`, `/sistema-para-excursoes`.

### 5.2 Rotas privadas/operacionais
- `/login`.
- `/vendedor/minhas-vendas`.
- `/motorista`, `/motorista/validar`, `/motorista/embarque`, `/motorista/preferencias`.
- `/representante/painel`.

### 5.3 Rotas administrativas
- `/admin`, `/admin/dashboard`, `/admin/eventos`, `/admin/eventos/:id`, `/admin/frota`, `/admin/motoristas`, `/admin/auxiliares-embarque`, `/admin/locais`, `/admin/vendedores`, `/admin/vendas`, `/admin/usuarios`, `/admin/empresa`, `/admin/indicacoes`, `/admin/minha-conta`, `/admin/patrocinadores`, `/admin/socios`, `/admin/parceiros`, `/admin/programas-beneficio`, `/admin/programas-beneficio/novo`, `/admin/programas-beneficio/:id`, `/admin/relatorios/vendas`, `/admin/relatorios/eventos`, `/admin/relatorios/comissao-vendedores`, `/admin/relatorios/lista-embarque`, `/admin/templates-layout`, `/admin/diagnostico-vendas`.

### 5.4 Rota de exceção
- `*` (fallback para página 404).

### 5.5 Telas existentes sem rota ativa em `App.tsx`
- `src/pages/public/LandingPage.tsx`.
- `src/pages/admin/MySales.tsx`.

## 6) Critério de atualização deste índice
Atualizar este índice sempre que:
1. uma nova rota for adicionada/removida em `src/App.tsx`;
2. uma página em `src/pages/**` passar a ter/retirar rota;
3. houver mudança estrutural de escopo (público/admin/operacional).

## Status da documentação por tela

### PRDs comportamentais concluídos
- `/eventos/:id/checkout`
- `/confirmacao/:id`
- `/eventos`
- `/admin/vendas`
- `/admin/empresa`
- `/representante/painel`

### Telas mapeadas, mas ainda pendentes de PRD comportamental
- `/`
- `/eventos/:id`
- `/consultar-passagens`
- `/v/:code`
- `/cadastro`
- `/cadastro-empresa`
- `/seja-representante`
- `/i/:code`
- `/empresa/:nick`
- `/:nick`
- `/politica-de-intermediacao`
- `/sobre-smartbus-br`
- `/sistema-para-excursoes`
- `/login`
- `/vendedor/minhas-vendas`
- `/admin/minhas-vendas` (redirect legado)
- `/motorista`
- `/motorista/validar`
- `/motorista/embarque`
- `/motorista/preferencias`
- `/admin` (redirect para dashboard)
- `/admin/dashboard`
- `/admin/eventos`
- `/admin/eventos/:id`
- `/admin/frota`
- `/admin/motoristas`
- `/admin/auxiliares-embarque`
- `/admin/locais`
- `/admin/vendedores`
- `/admin/usuarios`
- `/admin/indicacoes`
- `/admin/minha-conta`
- `/admin/patrocinadores`
- `/admin/socios`
- `/admin/parceiros`
- `/admin/programas-beneficio`
- `/admin/programas-beneficio/novo`
- `/admin/programas-beneficio/:id`
- `/admin/relatorios/vendas`
- `/admin/relatorios/eventos`
- `/admin/relatorios/comissao-vendedores`
- `/admin/relatorios/lista-embarque`
- `/admin/templates-layout`
- `/admin/diagnostico-vendas`
- `*` (fallback NotFound)
- `src/pages/public/LandingPage.tsx` (sem rota ativa)
- `src/pages/admin/MySales.tsx` (sem rota ativa)
