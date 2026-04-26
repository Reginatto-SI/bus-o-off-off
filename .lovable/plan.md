## 🎯 Escopo desta etapa (conforme PRD)

Implementar **apenas** a base do módulo: cadastro de serviços reutilizáveis pela Agência (empresa) e vínculo desses serviços a eventos com preço e capacidade. **Sem venda, sem checkout, sem QR, sem validação.**

> ⚠️ Reutiliza a entidade `companies` existente como "Agência". **Nenhuma nova entidade `agencia` será criada.**

---

## 🗄️ 1. Migrations (Banco de Dados)

### Tabela `services` (cadastro base por empresa)
Campos:
- `id` uuid PK
- `company_id` uuid NOT NULL — isolamento multiempresa
- `name` text NOT NULL
- `description` text NULL
- `unit_type` text NOT NULL CHECK IN (`'pessoa'`, `'veiculo'`, `'unitario'`)
- `control_type` text NOT NULL CHECK IN (`'validacao_obrigatoria'`, `'sem_validacao'`)
- `status` text NOT NULL DEFAULT `'ativo'` (`'ativo'` | `'inativo'`)
- `created_at`, `updated_at` timestamptz com trigger de update

**RLS** (mesmo padrão de `commercial_partners`):
- `Admins can manage services` → ALL — `is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id)`
- `Users can view services of their company` → SELECT — `user_belongs_to_company(auth.uid(), company_id)`

Índice em `(company_id, status)`.

---

### Tabela `event_services` (vínculo serviço ↔ evento)
Campos:
- `id` uuid PK
- `event_id` uuid NOT NULL
- `service_id` uuid NOT NULL → referência a `services`
- `company_id` uuid NOT NULL — redundante para RLS rápido (padrão do projeto)
- `base_price` numeric(10,2) NOT NULL DEFAULT 0
- `total_capacity` integer NOT NULL DEFAULT 0
- `sold_quantity` integer NOT NULL DEFAULT 0 — preparado, mas **não usado** nesta etapa
- `allow_checkout` boolean NOT NULL DEFAULT false
- `allow_standalone_sale` boolean NOT NULL DEFAULT false
- `is_active` boolean NOT NULL DEFAULT true
- `created_at`, `updated_at`
- UNIQUE `(event_id, service_id)`

> `available_quantity` = `total_capacity - sold_quantity` será calculado em tempo de exibição (não é coluna).

**RLS**:
- `Admins can manage event_services` → ALL — mesma regra dos demais vínculos de evento
- `Users can view event_services of their company` → SELECT — por `company_id`

---

## 🧩 2. Tipos TypeScript

Adicionar em `src/types/database.ts`:
- `ServiceUnitType`, `ServiceControlType`, `ServiceStatus`
- `interface Service` (com todos os campos)
- `interface EventService` (com `service?: Service` para join opcional)

---

## 🖥️ 3. Tela `/admin/servicos` (CRUD de Serviços)

Arquivo novo: **`src/pages/admin/Services.tsx`**

Padrão visual idêntico ao de **`/admin/parceiros`** (`CommercialPartners.tsx`) e **`/admin/auxiliares-embarque`**:
- `AdminLayout` + `PageHeader` + `FilterCard` + `Card` + `Table`
- **Modal** (`Dialog`) com formulário simples para criar/editar (não criar página separada)
- Ações por linha via `ActionsDropdown` (botão "…"): Editar, Ativar/Inativar, Excluir
- Botão "+ Novo serviço" no header
- Filtro por busca (nome) e por status (Todos / Ativo / Inativo)
- `EmptyState` quando vazio
- `StatusBadge` para status

**Campos do modal:**
- Nome (obrigatório)
- Descrição (textarea opcional)
- Tipo de unidade (`Select`: Pessoa / Veículo / Unitário)
- Tipo de controle (`Select`: Com validação obrigatória / Sem validação)
- Status (Ativo/Inativo) — apenas no modo edição

**Isolamento:** todas as queries filtram por `.eq('company_id', activeCompanyId)` (regra obrigatória do projeto).

**Acesso:** restrito a `gerente`/`developer` (via guard padrão; consistente com Parceiros).

---

## 🛣️ 4. Rota e Navegação

### `src/App.tsx`
Adicionar:
```tsx
<Route path="/admin/servicos" element={<Services />} />
```

### `src/components/layout/AdminSidebar.tsx`
No grupo **Cadastros**, adicionar item:
```ts
{ name: 'Serviços', href: '/admin/servicos', icon: Sparkles, roles: ['gerente'] }
```
(Ícone `Sparkles` do lucide-react para evocar "passeios/experiências"; pode ser ajustado depois.)

---

## 🧩 5. Aba "Serviços" no Evento

Arquivo: **`src/pages/admin/EventDetail.tsx`** (modificar; abas existentes: Viagens / Locais de Embarque / Vendas).

Adicionar:
- Nova `<TabsTrigger value="services">Serviços</TabsTrigger>`
- Novo `<TabsContent value="services">` com:
  - Tabela dos `event_services` já vinculados (colunas: Serviço, Tipo unidade, Preço base, Capacidade total, Vendidos, Disponível, Permite checkout, Permite avulsa, Status, Ações)
  - Botão "+ Vincular serviço" → abre `Dialog` com:
    - `Select` listando os `services` ativos da empresa que **ainda não estão vinculados** ao evento
    - Campo `Valor base` (R$)
    - Campo `Capacidade total` (numérico, ≥ 0)
    - Switch "Permite venda no checkout"
    - Switch "Permite venda avulsa"
    - Switch "Ativo"
  - Linha existente → `ActionsDropdown` com Editar (mesmo modal, pré-preenchido) e Remover vínculo
  - `sold_quantity` exibido como **0 (somente leitura)** nesta etapa
  - `available_quantity` calculado client-side como `total_capacity - sold_quantity`

Estado isolado dentro do componente `EventDetail` (mesma estratégia de `trips`/`eventLocations`); fetch incluído no `Promise.all` existente do `fetchData`.

---

## 🚫 6. Fora de escopo (não implementar)

Conforme PRD e instruções do usuário:
- ❌ Tabela `sale_items` / venda de serviços
- ❌ Checkout com serviços
- ❌ Tela `/vendas/servicos` (venda avulsa)
- ❌ Geração de QR / validação / consumo parcial
- ❌ Lógica que altera `sold_quantity` (campo existe, sempre 0)
- ❌ Relatórios, repasse, split, guias, fornecedores, horários
- ❌ Qualquer alteração no fluxo de checkout atual

---

## ✅ 7. Resultado Esperado

Após esta entrega, a Agência (empresa) consegue:
1. Acessar `/admin/servicos` no menu lateral (Cadastros → Serviços)
2. Cadastrar, editar, inativar e excluir serviços
3. Abrir um evento existente em `/admin/eventos/:id`
4. Acessar a nova aba **Serviços**
5. Vincular serviços ao evento, definir preço base e capacidade
6. Editar/remover vínculos
7. Tudo isolado por `company_id` (nenhuma empresa enxerga dados de outra)

---

## 📋 Arquivos afetados

**Migrations:**
- Nova migration: cria `services`, `event_services`, RLS, índices, triggers de `updated_at`

**Novos arquivos:**
- `src/pages/admin/Services.tsx`

**Arquivos modificados:**
- `src/App.tsx` — adiciona rota `/admin/servicos`
- `src/components/layout/AdminSidebar.tsx` — adiciona item de menu
- `src/pages/admin/EventDetail.tsx` — adiciona aba "Serviços"
- `src/types/database.ts` — adiciona tipos `Service` e `EventService`

> 🔒 **Não tocar** em: `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, fluxo de checkout, qualquer arquivo de venda/pagamento.