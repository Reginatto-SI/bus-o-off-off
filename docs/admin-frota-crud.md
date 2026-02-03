# CRUD da Frota (/admin/frota)

> **Objetivo:** documentar a lógica e o fluxo do CRUD de frota para aprendizado, seguindo o padrão Lovable já existente.

## Visão geral

- **Rota:** `/admin/frota`.
- **Arquivo principal:** `src/pages/admin/Fleet.tsx`.
- **Layout:** `AdminLayout` (mantém sidebar/header do admin).
- **Fonte de dados:** tabela `vehicles` no Supabase.

## Estrutura da UI (padrão Lovable)

- **Topo da página:** título “Frota” e botão “Adicionar Veículo”.
- **Listagem:** tabela com colunas básicas (tipo, placa, proprietário, capacidade e status) e ações.
- **Empty State:** exibido quando não há veículos cadastrados.
- **Modal de cadastro/edição:** `Dialog` com abas (`Tabs`) para organizar campos:
  - Identificação
  - Capacidade
  - Dados Técnicos
  - Operação/Comunicação

> Observação: a estrutura de modal, tabs e tabela reaproveita componentes existentes do projeto (não cria novos padrões de UI).

## Dados e estado local

- **`vehicles`:** lista atual exibida na tabela.
- **`loading`:** controla o estado de carregamento inicial.
- **`dialogOpen`:** controla abertura/fechamento do modal.
- **`saving`:** evita duplo submit no modal.
- **`editingId`:** quando definido, o modal está em modo edição.
- **`form`:** estado do formulário (campos do veículo).

## Fluxo de leitura (Listagem)

1. Ao montar a tela (`useEffect`), chama `fetchVehicles()`.
2. `fetchVehicles()` realiza `select('*')` em `vehicles` e ordena por `created_at` descendente.
3. Em caso de erro, registra log e mostra toast amigável.
4. Em sucesso, popula `vehicles` e renderiza a tabela.

## Fluxo de criação (Create)

1. Usuário clica em **Adicionar Veículo**.
2. Modal abre com `form` vazio.
3. Ao salvar:
   - Valida se há `activeCompanyId`.
   - Verifica permissão (somente gerente/operador).
   - Normaliza placa (trim + uppercase).
   - Valida capacidade numérica.
4. Monta `vehicleData` com `company_id` e campos do formulário.
5. Executa `insert` no Supabase.
6. Em sucesso, fecha modal, limpa formulário e recarrega lista.

## Fluxo de edição (Update)

1. Usuário clica no ícone de lápis na tabela.
2. `handleEdit` preenche o formulário com os dados do veículo e abre o modal.
3. Ao salvar:
   - Mesmas validações do create.
   - Executa `update` filtrando por `id`.
   - **Importante:** não atualiza `company_id` na edição.
4. Em sucesso, fecha modal, limpa formulário e recarrega lista.

## Fluxo de inativação/ativação (Update de status)

1. Usuário clica no ícone de status.
2. `handleToggleStatus` alterna entre `ativo` e `inativo`.
3. Executa `update` por `id`.
4. Em sucesso, recarrega a lista.

## Regras de permissão e segurança

- A tela usa `useAuth` para obter:
  - `activeCompanyId` (multi-tenant)
  - `isGerente` e `isOperador` (controle de acesso)
- Se o usuário **não** for gerente/operador, bloqueia escrita.
- Se `activeCompanyId` estiver ausente, bloqueia criação/edição.
- Mensagens de erro são tratadas com `logSupabaseError` e `buildDebugToastMessage`.

## Mapeamento de campos (form ↔ tabela `vehicles`)

- `type` → tipo da frota (`onibus`/`van`).
- `plate` → placa (normalizada para uppercase).
- `owner` → proprietário.
- `brand`, `model`, `year_model`, `capacity` → dados básicos.
- `chassis`, `renavam`, `color` → dados técnicos.
- `whatsapp_group_link`, `notes` → comunicação/observações.
- `company_id` → tenant ativo (multi-tenant).

## Validações principais

- **Placa obrigatória** (vazio bloqueia submit).
- **Capacidade válida** (evita NaN e tipos inválidos).
- **Permissão de escrita** (somente gerente/operador).
- **Empresa ativa** (`activeCompanyId`).

## Pontos de extensão (seguindo o padrão existente)

- Novos campos devem ser adicionados no `form`, no `vehicleData` e nas abas do modal, reutilizando componentes já usados.
- Qualquer alteração de regra deve respeitar RLS/multi-tenant.
- Não criar novos layouts; manter `AdminLayout`, `Dialog`, `Tabs` e `Table`.

## Resumo rápido do CRUD

- **Listar:** `fetchVehicles()` → tabela.
- **Criar:** abrir modal → validar → `insert` → recarregar lista.
- **Editar:** `handleEdit()` → modal → validar → `update` → recarregar lista.
- **Excluir:** não existe delete físico; usa **toggle de status** (ativo/inativo).
