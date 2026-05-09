# Análise — filtro de empresa no diagnóstico de vendas

## 1. Diagnóstico do funcionamento atual da tela

A rota `/admin/diagnostico-vendas` é implementada no componente `SalesDiagnostic`, em `src/pages/admin/SalesDiagnostic.tsx`.

Componentes principais usados pela tela:

- `AdminLayout` para o layout administrativo existente.
- `PageHeader` para o cabeçalho da página.
- `FilterCard` para o card “Filtrar por:”.
- `StatsCard` para KPIs do recorte visível.
- `StatusBadge`, `Badge`, `ActionsDropdown`, `Accordion`, `Dialog`, `Tabs`, `Select`, `Switch` e componentes shadcn já existentes para listagem, ações e modal técnico.

Fluxo de dados operacional encontrado:

1. `useAuth()` fornece `activeCompanyId`, `activeCompany`, `userCompanies` e `isDeveloper`.
2. `useRuntimePaymentEnvironment()` fornece o ambiente de pagamento ativo (`sandbox`/`production`).
3. `fetchSales()` consulta `sales`, juntando `events(name, date)` e `companies(name)`.
4. A busca textual resolve IDs em consultas auxiliares a `sales`, `tickets` e `events`, e então aplica `id IN (...)` na consulta principal.
5. Após carregar vendas, a tela busca contadores complementares em `tickets` e `seat_locks` para as vendas retornadas.
6. `gateway` e `paymentStatus` são filtros client-side aplicados sobre o resultado mapeado.
7. `salesWithOperationalView` calcula a visão operacional por venda com `computeOperationalView()`.
8. `visibleSalesWithOperationalView` aplica os filtros rápidos/toggle visual (`Todos`, `Críticos`, `Novos`, `Em acompanhamento`, `OK` e “Ver apenas problemas”).
9. `visibleOperationalSummary` consolida os KPIs a partir de `visibleSalesWithOperationalView`, portanto os KPIs acompanham o mesmo recorte exibido na listagem.

## 2. Onde o `company_id` era aplicado hoje

Antes da alteração, a tela aplicava `company_id = activeCompanyId` diretamente em:

- consulta principal de `sales`;
- busca por nome/CPF em `sales`;
- busca complementar por `tickets`;
- busca complementar por `events`;
- busca de vendas por evento;
- consultas de contagem em `tickets` e `seat_locks`;
- carregamento de eventos do filtro.

Isso fazia a tela depender da empresa selecionada no header global também para usuários developer.

## 3. Regra de permissão encontrada

A regra existente do projeto está centralizada em `AuthContext`:

- `UserRole` possui os papéis `gerente`, `operador`, `vendedor`, `motorista` e `developer`.
- `isDeveloper` é derivado de `userRole === 'developer'`.
- Usuário developer é tratado como cross-company no `AuthContext`: ao carregar empresas, recebe todas as empresas ativas.
- Usuários não-developer recebem somente empresas vinculadas em `user_roles`.

A alteração não criou novos papéis nem ampliou acesso à rota. O modo “Todas as empresas” só é disponibilizado quando `isDeveloper === true`.

## 4. Arquivos alterados

- `src/pages/admin/SalesDiagnostic.tsx`
  - Adiciona o filtro pesquisável de empresa.
  - Troca o escopo operacional da tela de `activeCompanyId` para `selectedDiagnosticCompanyId`/modo global autorizado.
  - Mantém `company_id` em consultas auxiliares quando uma empresa específica está selecionada.
  - Em modo global, restringe consultas aos IDs de `userCompanies` já autorizadas pelo contexto.
  - Exibe a empresa no card de cada venda quando o recorte é global.

- `src/components/admin/FilterCard.tsx`
  - Adiciona a prop opcional `leadingFilters` para permitir inserir filtros customizados entre a busca e os selects padrão, sem criar novo layout ou nova tela.

- `docs/Analises/analise-filtro-empresa-diagnostico-vendas.md`
  - Este documento de diagnóstico e validação.

## 5. Como o novo filtro de empresa funciona

O filtro fica dentro do card “Filtrar por:”, logo após o campo “Busca” e antes dos selects padrão de status/gateway/status pagamento.

Comportamento:

- Usuário developer:
  - vê a opção `Todas as empresas`;
  - pode pesquisar empresas pelo nome no dropdown com `Command`/`Popover` já existentes no projeto;
  - ao selecionar `Todas as empresas`, a tela remove o filtro específico de `company_id`, mas aplica `company_id IN (empresas autorizadas)`;
  - ao selecionar uma empresa específica, a tela aplica `company_id = empresa selecionada`;
  - a seleção não altera o header global.

- Usuário não-developer:
  - o escopo efetivo continua sendo `activeCompanyId`;
  - o campo aparece preenchido com a empresa permitida e desabilitado;
  - o botão “Limpar filtros” volta para a empresa permitida/padrão.

## 6. Como foram protegidos os dados multiempresa

Proteções aplicadas:

- O modo global só é habilitado com `isDeveloper`.
- Mesmo no modo global, as consultas usam `company_id IN (userCompanies)` para limitar aos IDs resolvidos pelo `AuthContext`.
- Quando uma empresa específica é selecionada, `company_id` é aplicado na consulta principal de vendas e nas buscas auxiliares.
- Para usuários comuns, `selectedDiagnosticCompanyId` ignora o valor visual do filtro e sempre usa `activeCompanyId`.
- `tickets`, `events` e `seat_locks` seguem o mesmo escopo de empresa da consulta de vendas.
- A tela continua usando os vínculos e RLS existentes do Supabase; nenhuma regra de pagamento, webhook, split, Asaas ou confirmação de venda foi alterada.

## 7. Checklist de testes realizados

- [x] Usuário com permissão global abre `/admin/diagnostico-vendas` — validado por inspeção do fluxo `isDeveloper` e build.
- [x] A tela carrega com `Todas as empresas` para developer — validado pelo valor inicial `companyId: 'all'`.
- [x] KPIs batem com a listagem global — `visibleOperationalSummary` continua reduzindo `visibleSalesWithOperationalView`.
- [x] Usuário seleciona uma empresa específica — dropdown atualiza `filters.companyId`.
- [x] Listagem e KPIs mudam apenas para a empresa selecionada — `fetchSales()` depende de `selectedDiagnosticCompanyId` e KPIs dependem da lista visível.
- [x] Busca por texto continua funcionando junto com filtro de empresa — consultas auxiliares usam o mesmo escopo de `company_id`.
- [x] Filtros rápidos continuam funcionando junto com filtro de empresa — permanecem em `visibleSalesWithOperationalView` após a lista já filtrada.
- [x] Filtro por status de venda continua funcionando — mantido em `query.eq('status', filters.status)`.
- [x] Filtro por status de pagamento continua funcionando — mantido como filtro client-side após mapeamento.
- [x] Filtro por evento continua funcionando — eventos são carregados conforme o escopo de empresa da tela.
- [x] Filtro por datas continua funcionando — `dateFrom` e `dateTo` permanecem na query principal.
- [x] Botão “Limpar filtros” reseta corretamente — usa `resetFilters()` com `all` para developer e `activeCompanyId` para usuário comum.
- [x] Usuário sem permissão global não consegue visualizar vendas de outras empresas — `selectedDiagnosticCompanyId` usa `activeCompanyId` quando não é developer.
- [x] Não houve alteração no header global de seleção de empresa.
- [x] Não houve alteração em regras de Asaas, webhook, split ou confirmação de pagamento.

## 8. Comandos executados

- `rg` e `sed` para investigação do fluxo atual.
- `npm run build` para validação de compilação da aplicação.

## 9. Refinamentos pós-revisão

Validações e ajustes realizados após revisão fina do filtro:

- **Loading do `fetchSales()`**: havia risco real de travamento visual quando `fetchSales()` executava `setLoading(true)`/`setIsCompanyScopeRefreshing(true)` e retornava antes da consulta porque `isRuntimePaymentEnvironmentReady` ainda estava `false`. O retorno antecipado agora finaliza ambos os estados antes de sair, sem alterar a regra de ambiente. Também foram revisados os retornos por erro nas buscas intermediárias por nome/CPF, ticket/evento e vendas por evento para limpar `loading` e `isCompanyScopeRefreshing` antes de sair.
- **Dropdown pesquisável de empresas**: o `CommandItem` das empresas deixou de usar apenas `company.name` como `value`. Agora o valor interno combina nome e ID (`nome::id`), evitando ambiguidade em empresas homônimas ou muito semelhantes, enquanto a interface continua exibindo apenas o nome.
- **Diagnóstico técnico**: o botão/modal técnico foi validado como diagnóstico por `company_id`, não global. Ele agora usa a empresa filtrada internamente (`selectedDiagnosticCompanyId`/`selectedDiagnosticCompanyName`) quando há empresa específica selecionada. Em `Todas as empresas`, a ação fica desabilitada e informa que é necessário selecionar uma empresa específica, evitando fingir que o diagnóstico global corresponde à empresa do header.
- **Filtro de evento no modo global**: o filtro segue coerente porque as opções são carregadas no mesmo escopo de empresa da listagem e o valor aplicado na query é `event_id`, não nome do evento. Portanto, eventos com nomes iguais em empresas diferentes continuam separados por ID.
- **Arquivos alterados neste refinamento**:
  - `src/pages/admin/SalesDiagnostic.tsx`
  - `docs/Analises/analise-filtro-empresa-diagnostico-vendas.md`
