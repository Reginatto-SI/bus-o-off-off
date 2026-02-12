

# Evolucao da Tela /admin/vendas — Central de Gerenciamento

## Visao Geral

Transformar a tela de vendas em uma central operacional completa, seguindo o padrao visual da tela piloto (/admin/frota). Inclui mudancas no banco de dados, novos componentes e reescrita completa da pagina.

---

## Parte 1: Alteracoes no Banco de Dados

### 1.1 Adicionar status "cancelado" ao enum sale_status

```sql
ALTER TYPE sale_status ADD VALUE 'cancelado';
```

### 1.2 Criar tabela sale_logs (historico/auditoria)

```sql
CREATE TABLE public.sale_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  action text NOT NULL,  -- 'criacao', 'status_alterado', 'passageiro_editado', 'assento_trocado', 'cancelamento'
  description text NOT NULL,
  old_value text,
  new_value text,
  performed_by uuid,  -- user id de quem fez a acao
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sale_logs ENABLE ROW LEVEL SECURITY;

-- RLS: admins da empresa podem ver e criar logs
CREATE POLICY "Admins can manage sale_logs"
  ON public.sale_logs FOR ALL
  USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));
```

### 1.3 Adicionar coluna cancel_reason na tabela sales

```sql
ALTER TABLE public.sales ADD COLUMN cancel_reason text;
ALTER TABLE public.sales ADD COLUMN cancelled_at timestamptz;
ALTER TABLE public.sales ADD COLUMN cancelled_by uuid;
```

---

## Parte 2: Atualizar Tipos TypeScript

### Arquivo: `src/types/database.ts`

- Adicionar `'cancelado'` ao tipo `SaleStatus`
- Adicionar campos `cancel_reason`, `cancelled_at`, `cancelled_by` ao interface `Sale`
- Criar interface `SaleLog`

---

## Parte 3: Atualizar StatusBadge

### Arquivo: `src/components/ui/StatusBadge.tsx`

Adicionar mapeamento para `cancelado`:
```
cancelado: { label: 'Cancelado', className: 'status-badge-cancelled' }
```

Adicionar estilo CSS correspondente (vermelho) no index.css.

---

## Parte 4: Reescrita Completa da Pagina Sales.tsx

### Estrutura (seguindo padrao Fleet.tsx)

```text
+------------------------------------------------------+
| PageHeader: "Vendas" + botoes Excel/PDF/Atualizar    |
+------------------------------------------------------+
| StatsCards: Total | Arrecadado | Pagas | Reservadas  |
|            | Canceladas                               |
+------------------------------------------------------+
| FilterCard: Busca + Selects + Filtros Avancados      |
+------------------------------------------------------+
| Tabela com ActionsDropdown por linha                  |
+------------------------------------------------------+
| ExportExcelModal + ExportPDFModal                    |
+------------------------------------------------------+
```

### 4.1 KPIs (StatsCards)

Calculos sobre `filteredSales`:
- **Total de vendas**: contagem
- **Total arrecadado**: soma (quantity * unit_price) — visivel apenas para Gerente (canViewFinancials)
- **Vendas pagas**: contagem onde status = 'pago'
- **Vendas reservadas**: contagem onde status = 'reservado'
- **Canceladas**: contagem onde status = 'cancelado'

### 4.2 Filtros

Interface `SalesFilters`:
```typescript
interface SalesFilters {
  search: string;         // busca por nome ou CPF do cliente
  status: 'all' | SaleStatus;
  eventId: string;        // 'all' ou UUID do evento
  sellerId: string;       // 'all' ou UUID do vendedor
  dateFrom: string;       // data inicial
  dateTo: string;         // data final
}
```

Filtros simples (grid principal):
- Busca (nome/CPF)
- Status
- Evento (select carregado do banco)

Filtros avancados (collapsible):
- Vendedor
- Data inicial
- Data final

### 4.3 Colunas da Tabela

| Coluna | Dados |
|--------|-------|
| Data | created_at formatado dd/MM/yy HH:mm |
| Evento | event.name |
| Cliente | customer_name + customer_cpf (sublinhado) |
| Veiculo | trip.vehicle (tipo + placa) |
| Local Embarque | boarding_location.name |
| Qtd | quantity |
| Valor | quantity * unit_price (apenas Gerente) |
| Vendedor | seller.name ou "-" |
| Status | StatusBadge |
| Acoes | ActionsDropdown |

### 4.4 Query de Dados

```typescript
supabase
  .from('sales')
  .select(`
    *,
    event:events(*),
    trip:trips(*, vehicle:vehicles(*)),
    boarding_location:boarding_locations(*),
    seller:sellers(*)
  `)
  .order('created_at', { ascending: false });
```

Nota: a query atual nao busca `trip` com `vehicle`. Precisamos adicionar para mostrar veiculo na tabela.

### 4.5 Exportacao

Colunas de exportacao:
```typescript
const exportColumns: ExportColumn[] = [
  { key: 'created_at', label: 'Data', format: (v) => format(...) },
  { key: 'event_name', label: 'Evento' },
  { key: 'customer_name', label: 'Cliente' },
  { key: 'customer_cpf', label: 'CPF' },
  { key: 'customer_phone', label: 'Telefone' },
  { key: 'vehicle_info', label: 'Veiculo' },
  { key: 'boarding_location_name', label: 'Local Embarque' },
  { key: 'quantity', label: 'Quantidade' },
  { key: 'total_value', label: 'Valor Total' },
  { key: 'seller_name', label: 'Vendedor' },
  { key: 'status', label: 'Status' },
];
```

Os dados para export precisam ser "achatados" (flat) a partir dos objetos aninhados.

---

## Parte 5: Menu de Acoes (ActionsDropdown)

Para cada venda, o menu tera as seguintes opcoes:

### 5.1 Ver Detalhes

Abre modal com abas (padrao piloto):

**Aba "Dados da Venda":**
- Cliente (nome, CPF, telefone)
- Evento
- Veiculo
- Local de embarque
- Quantidade / Valor unitario / Valor total
- Status atual
- Data da compra
- Vendedor (se houver)

**Aba "Passageiros":**
- Lista de tickets vinculados (query `tickets` WHERE `sale_id`)
- Cada passageiro: Nome, CPF, Assento, Status de embarque
- Botao "Editar" em cada passageiro (abre sub-modal)

**Aba "Historico":**
- Lista de `sale_logs` ordenados por data
- Cada entrada: data, acao, descricao, usuario responsavel

### 5.2 Editar Passageiro

Sub-modal com:
- Nome completo (editavel)
- CPF (editavel, com validacao)
- Ao salvar: atualiza registro em `tickets`, cria log em `sale_logs`

Nota: troca de assento NAO sera implementada neste momento (complexidade alta, requer verificacao de disponibilidade em tempo real). Fica como evolucao futura.

### 5.3 Cancelar Venda

Fluxo:
1. Confirmar via AlertDialog
2. Campo obrigatorio: motivo do cancelamento
3. Ao confirmar:
   - Atualizar `sales.status` para `cancelado`, preencher `cancel_reason`, `cancelled_at`, `cancelled_by`
   - Deletar tickets vinculados (libera assentos)
   - Criar log em `sale_logs`
   - Toast de sucesso
4. Regra: nao permitir cancelar se algum ticket tiver `boarding_status` diferente de `pendente`

### 5.4 Alterar Status (somente Gerente)

Opcoes:
- Marcar como Pago (se status atual = 'reservado')
- Reverter para Reservado (se status atual = 'pago')

Ao alterar: cria log em `sale_logs` com old_value/new_value.

Visibilidade: este item so aparece no menu se `isGerente === true`.

### 5.5 Copiar Link da Passagem

- Gera URL `/confirmacao/{sale_id}` e copia para clipboard
- Toast "Link copiado!"

---

## Parte 6: Arquivos Envolvidos

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| Migracao SQL | Criar | Enum cancelado, tabela sale_logs, colunas em sales |
| `src/types/database.ts` | Editar | SaleStatus + Sale + SaleLog |
| `src/components/ui/StatusBadge.tsx` | Editar | Adicionar cancelado |
| `src/index.css` | Editar | Adicionar status-badge-cancelled |
| `src/pages/admin/Sales.tsx` | Reescrever | Pagina completa seguindo padrao Fleet |

Tudo em um unico arquivo `Sales.tsx` (modais inline como no Fleet.tsx), sem criar componentes separados para manter o padrao do projeto.

---

## Regras de Seguranca

- Todas as queries respeitam RLS (empresa ativa via user_belongs_to_company)
- sale_logs protegido por RLS (admins da empresa)
- Operador nao visualiza valores financeiros (canViewFinancials = false)
- Apenas Gerente pode alterar status manualmente
- Cancelamento protegido contra vendas ja embarcadas

---

## Resumo das Entregas

1. Status "cancelado" no banco + campos de cancelamento
2. Tabela sale_logs com RLS
3. PageHeader + StatsCards + FilterCard padrao piloto
4. Tabela reestruturada com todas as colunas solicitadas
5. ActionsDropdown funcional com: Ver Detalhes, Editar Passageiro, Cancelar, Alterar Status, Copiar Link
6. Modal de detalhes com 3 abas (Dados, Passageiros, Historico)
7. Exportacao Excel/PDF padrao
8. StatusBadge com "Cancelado" (vermelho)

