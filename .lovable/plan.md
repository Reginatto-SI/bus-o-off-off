
# Plano: Padronizacao da Tela /admin/motoristas

## Visao Geral

Ajustar a tela de Motoristas para seguir exatamente o padrao visual, estrutural e comportamental da tela piloto /admin/frota, incluindo KPIs, filtros padronizados, menu de acoes e exportacao Excel/PDF.

---

## Analise Comparativa: Atual vs Esperado

| Aspecto | Tela Atual | Padrao Esperado |
|---------|------------|-----------------|
| Cabecalho | DIV manual com flex | PageHeader |
| KPIs | Nenhum | 4 StatsCards |
| Filtros | Nenhum | FilterCard com busca e selects |
| Acoes de linha | 3 botoes soltos (Editar, Toggle, Delete) | ActionsDropdown (menu "...") |
| Delete | Botao de lixeira | Removido (usar toggle status) |
| Exportacao | Nenhuma | Excel + PDF |
| Estado vazio | Basico | Dois estados (sem dados / sem resultados) |

---

## Parte 1: Novos Imports Necessarios

Adicionar imports para componentes reutilizaveis:

```typescript
import { PageHeader } from '@/components/admin/PageHeader';
import { StatsCard } from '@/components/admin/StatsCard';
import { FilterCard, FilterInput } from '@/components/admin/FilterCard';
import { ActionsDropdown, ActionItem } from '@/components/admin/ActionsDropdown';
import { ExportExcelModal, ExportColumn } from '@/components/admin/ExportExcelModal';
import { ExportPDFModal } from '@/components/admin/ExportPDFModal';
import {
  FileSpreadsheet,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Power,
} from 'lucide-react';
```

---

## Parte 2: Novos Estados

### Interface de Filtros

```typescript
interface DriverFilters {
  search: string;
  status: 'all' | 'ativo' | 'inativo';
  cnhCategory: string;
}

const initialFilters: DriverFilters = {
  search: '',
  status: 'all',
  cnhCategory: '',
};
```

### Estados Adicionais

```typescript
const [filters, setFilters] = useState<DriverFilters>(initialFilters);
const [exportModalOpen, setExportModalOpen] = useState(false);
const [pdfModalOpen, setPdfModalOpen] = useState(false);
```

---

## Parte 3: Calculos Memoizados

### Stats (KPIs)

```typescript
const stats = useMemo(() => {
  const total = drivers.length;
  const ativos = drivers.filter((d) => d.status === 'ativo').length;
  const inativos = drivers.filter((d) => d.status === 'inativo').length;
  
  // CNHs vencidas ou a vencer em 30 dias
  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);
  
  const cnhsAtencao = drivers.filter((d) => {
    if (!d.cnh_expires_at) return false;
    const expiresAt = new Date(d.cnh_expires_at);
    return expiresAt <= thirtyDaysFromNow;
  }).length;
  
  return { total, ativos, inativos, cnhsAtencao };
}, [drivers]);
```

### Filtros Aplicados

```typescript
const filteredDrivers = useMemo(() => {
  return drivers.filter((driver) => {
    // Busca por nome, CPF ou telefone
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      const matchesSearch =
        driver.name.toLowerCase().includes(searchLower) ||
        (driver.cpf?.includes(filters.search) ?? false) ||
        driver.phone.includes(filters.search);
      if (!matchesSearch) return false;
    }

    // Filtro de status
    if (filters.status !== 'all' && driver.status !== filters.status) {
      return false;
    }

    // Filtro de categoria CNH
    if (filters.cnhCategory && driver.cnh_category !== filters.cnhCategory) {
      return false;
    }

    return true;
  });
}, [drivers, filters]);

const hasActiveFilters = useMemo(() => {
  return (
    filters.search !== '' ||
    filters.status !== 'all' ||
    filters.cnhCategory !== ''
  );
}, [filters]);
```

---

## Parte 4: Configuracao de Exportacao

### Colunas para Excel/PDF

```typescript
const exportColumns: ExportColumn[] = [
  { key: 'name', label: 'Nome' },
  { key: 'cpf', label: 'CPF', format: (v) => formatCpfInput(v ?? '') },
  { key: 'phone', label: 'Telefone', format: (v) => formatPhoneInput(v) },
  { key: 'cnh', label: 'CNH' },
  { key: 'cnh_category', label: 'Categoria CNH' },
  { 
    key: 'cnh_expires_at', 
    label: 'Validade CNH',
    format: (v) => v ? new Date(v).toLocaleDateString('pt-BR') : ''
  },
  { key: 'status', label: 'Status', format: (v) => v === 'ativo' ? 'Ativo' : 'Inativo' },
  { key: 'notes', label: 'Observacoes' },
];
```

---

## Parte 5: Menu de Acoes

### Funcao para Gerar Acoes

```typescript
const getDriverActions = (driver: Driver): ActionItem[] => [
  {
    label: 'Editar',
    icon: Pencil,
    onClick: () => handleEdit(driver),
  },
  {
    label: driver.status === 'ativo' ? 'Desativar' : 'Ativar',
    icon: Power,
    onClick: () => handleToggleStatus(driver),
    variant: driver.status === 'ativo' ? 'destructive' : 'default',
  },
];
```

### Remocao do handleDelete

A funcao `handleDelete` sera removida completamente. O sistema usara apenas toggle de status.

---

## Parte 6: Estrutura do JSX

### 6.1 Cabecalho (PageHeader)

```jsx
<PageHeader
  title="Motoristas"
  description="Gerencie os motoristas cadastrados"
  actions={
    <>
      <Button variant="outline" size="sm" onClick={() => setExportModalOpen(true)}>
        <FileSpreadsheet className="h-4 w-4 mr-2" />
        Excel
      </Button>
      <Button variant="outline" size="sm" onClick={() => setPdfModalOpen(true)}>
        <FileText className="h-4 w-4 mr-2" />
        PDF
      </Button>
      <Dialog open={dialogOpen} onOpenChange={...}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Motorista
          </Button>
        </DialogTrigger>
        {/* Modal existente */}
      </Dialog>
    </>
  }
/>
```

### 6.2 Cards de Indicadores (StatsCards)

```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  <StatsCard
    label="Total de motoristas"
    value={stats.total}
    icon={Users}
  />
  <StatsCard
    label="Motoristas ativos"
    value={stats.ativos}
    icon={CheckCircle}
    variant="success"
  />
  <StatsCard
    label="Motoristas inativos"
    value={stats.inativos}
    icon={XCircle}
    variant="destructive"
  />
  <StatsCard
    label="CNHs atenção"
    value={stats.cnhsAtencao}
    icon={AlertTriangle}
    variant="warning"
  />
</div>
```

### 6.3 Card de Filtros (FilterCard)

```jsx
<FilterCard
  className="mb-6"
  searchValue={filters.search}
  onSearchChange={(value) => setFilters({ ...filters, search: value })}
  searchPlaceholder="Pesquisar por nome, CPF ou telefone..."
  selects={[
    {
      id: 'status',
      label: 'Status',
      placeholder: 'Status',
      value: filters.status,
      onChange: (value) => setFilters({ ...filters, status: value as DriverFilters['status'] }),
      options: [
        { value: 'all', label: 'Todos' },
        { value: 'ativo', label: 'Ativo' },
        { value: 'inativo', label: 'Inativo' },
      ],
    },
    {
      id: 'cnhCategory',
      label: 'Categoria',
      placeholder: 'Categoria CNH',
      value: filters.cnhCategory,
      onChange: (value) => setFilters({ ...filters, cnhCategory: value }),
      options: [
        { value: '', label: 'Todas' },
        { value: 'A', label: 'A' },
        { value: 'B', label: 'B' },
        { value: 'C', label: 'C' },
        { value: 'D', label: 'D' },
        { value: 'E', label: 'E' },
        { value: 'AB', label: 'AB' },
        { value: 'AC', label: 'AC' },
        { value: 'AD', label: 'AD' },
        { value: 'AE', label: 'AE' },
      ],
    },
  ]}
  onClearFilters={() => setFilters(initialFilters)}
  hasActiveFilters={hasActiveFilters}
/>
```

### 6.4 Tabela com ActionsDropdown

Colunas da tabela:

| Coluna | Conteudo |
|--------|----------|
| Nome | driver.name (font-medium) |
| CPF | formatCpfInput + icone IdCard |
| Telefone | formatPhoneInput + icone Phone |
| Categoria CNH | driver.cnh_category |
| Validade CNH | Data formatada + alerta visual se vencida |
| Status | StatusBadge |
| Acoes | ActionsDropdown |

### 6.5 Estados Vazios

**Sem motoristas:**
```jsx
<EmptyState
  icon={<Users className="h-8 w-8 text-muted-foreground" />}
  title="Nenhum motorista cadastrado"
  description="Adicione motoristas para atribuir às viagens"
  action={
    <Button onClick={() => setDialogOpen(true)}>
      <Plus className="h-4 w-4 mr-2" />
      Adicionar Motorista
    </Button>
  }
/>
```

**Filtros sem resultados:**
```jsx
<EmptyState
  icon={<Users className="h-8 w-8 text-muted-foreground" />}
  title="Nenhum motorista encontrado"
  description="Ajuste os filtros para encontrar motoristas"
  action={
    <Button variant="outline" onClick={() => setFilters(initialFilters)}>
      Limpar filtros
    </Button>
  }
/>
```

### 6.6 Modais de Exportacao

```jsx
<ExportExcelModal
  open={exportModalOpen}
  onOpenChange={setExportModalOpen}
  columns={exportColumns}
  data={filteredDrivers}
  storageKey="motoristas"
  fileName="motoristas"
  sheetName="Motoristas"
/>

<ExportPDFModal
  open={pdfModalOpen}
  onOpenChange={setPdfModalOpen}
  columns={exportColumns}
  data={filteredDrivers}
  storageKey="motoristas"
  fileName="motoristas"
  title="Motoristas"
  company={activeCompany}
/>
```

---

## Parte 7: Formatacao de Validade CNH

Adicionar indicador visual para CNHs vencidas ou a vencer:

```jsx
<TableCell>
  {driver.cnh_expires_at ? (
    <span className={cn(
      new Date(driver.cnh_expires_at) < new Date() && 'text-destructive font-medium',
      new Date(driver.cnh_expires_at) <= thirtyDaysFromNow && 'text-warning font-medium'
    )}>
      {new Date(driver.cnh_expires_at).toLocaleDateString('pt-BR')}
    </span>
  ) : '-'}
</TableCell>
```

---

## Arquivos a Modificar

| Arquivo | Acao |
|---------|------|
| `src/pages/admin/Drivers.tsx` | Refatorar completamente |

---

## Remocoes

1. **handleDelete** - Funcao removida (usar toggle status)
2. **Botao de lixeira** - Removido da coluna de acoes
3. **Botoes soltos** - Substituidos por ActionsDropdown
4. **Cabecalho DIV manual** - Substituido por PageHeader

---

## Resultado Esperado

1. Tela visualmente identica ao padrao /admin/frota
2. KPIs exibindo metricas relevantes de motoristas
3. Filtros funcionais para busca, status e categoria CNH
4. Menu de acoes padronizado com "..."
5. Exportacao Excel e PDF funcionais
6. Indicador visual para CNHs vencidas ou a vencer
7. Estados vazios padronizados

---

## Ordem de Implementacao

1. Adicionar imports necessarios
2. Criar interface de filtros e estados
3. Implementar calculos memoizados (stats, filteredDrivers)
4. Configurar colunas de exportacao
5. Criar funcao getDriverActions
6. Refatorar JSX seguindo estrutura da frota
7. Remover handleDelete e botoes soltos
8. Adicionar modais de exportacao
9. Testar operacoes CRUD e exportacoes
