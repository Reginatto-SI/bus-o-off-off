

# Correcao de Isolamento Multi-Tenant e Build Error

## Diagnostico da Causa Raiz

1. **Build Error (TS2339)**: `NewSaleModal.tsx` linha 333 usa `feeBreakdown.appliedFees` mas a interface `FeeBreakdown` tem o campo chamado `fees`. Correcao: trocar `.appliedFees` por `.fees`.

2. **Vazamento de dados entre empresas para Developer**: As queries frontend em **Fleet.tsx**, **Events.tsx**, **Drivers.tsx** e **BoardingLocations.tsx** fazem `SELECT *` sem filtro `.eq('company_id', activeCompanyId)`. O isolamento depende apenas do RLS. Para usuarios normais (gerente/operador), o RLS filtra corretamente. Porem, para o role `developer`, a funcao `user_belongs_to_company()` retorna `true` para todas as empresas ativas — entao o developer ve dados de todas as empresas.

3. **Sellers.tsx e Sales.tsx ja filtram corretamente** com `.eq('company_id', activeCompanyId)`.

4. **Dados no banco estao limpos**: nenhum registro com `company_id` NULL, e a empresa nova (3838e687) tem zero registros em todas as tabelas. Nao ha dados contaminados.

5. **Nao existe trigger/seed que copia dados** ao criar empresa. A empresa nasce vazia conforme esperado.

---

## Correcoes Necessarias

### 1. Build Error — `NewSaleModal.tsx`

Linha 333: trocar `feeBreakdown.appliedFees` por `feeBreakdown.fees`.

### 2. Frontend — Adicionar filtro `company_id` nas listagens admin

Aplicar o mesmo padrao que `Sellers.tsx` ja usa: adicionar `.eq('company_id', activeCompanyId)` e um guard para nao buscar enquanto `activeCompanyId` nao estiver disponivel.

**Arquivos afetados:**

| Arquivo | Query | Correcao |
|---------|-------|----------|
| `src/pages/admin/Fleet.tsx` | `fetchVehicles()` — sem filtro | Adicionar `.eq('company_id', activeCompanyId)` + guard |
| `src/pages/admin/Events.tsx` | `fetchEvents()` — sem filtro | Adicionar `.eq('company_id', activeCompanyId)` + guard |
| `src/pages/admin/Drivers.tsx` | `fetchDrivers()` — sem filtro | Adicionar `.eq('company_id', activeCompanyId)` + guard |
| `src/pages/admin/BoardingLocations.tsx` | `fetchLocations()` — sem filtro | Adicionar `.eq('company_id', activeCompanyId)` + guard |

**Padrao da correcao (exemplo Fleet.tsx):**

```typescript
// Guard: nao buscar sem empresa ativa
const fetchVehicles = async () => {
  if (!activeCompanyId) return;
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('company_id', activeCompanyId) // <-- filtro obrigatorio
    .order('created_at', { ascending: false });
  // ...
};

// useEffect deve reagir a mudanca de empresa
useEffect(() => {
  if (activeCompanyId) fetchVehicles();
}, [activeCompanyId]);
```

Tambem verificar `fetchVehiclesAndDrivers()` e `fetchSalesData()` em Events.tsx para garantir que filtram por empresa.

### 3. Nenhuma alteracao de banco necessaria

- RLS esta correto para usuarios normais
- Nao ha dados orfaos ou contaminados
- Nao ha triggers de clonagem

---

## Checklist de Validacao

- Criar empresa nova -> admin deve estar vazio em todas as telas
- Developer trocando empresa ativa -> ve somente dados daquela empresa
- Gerente/Operador -> ve somente dados da sua empresa (ja funciona via RLS, agora tambem via frontend)
- Build sem erros TypeScript

---

## Arquivos a Modificar

| Arquivo | Tipo |
|---------|------|
| `src/components/admin/NewSaleModal.tsx` | Fix build error (appliedFees -> fees) |
| `src/pages/admin/Fleet.tsx` | Adicionar filtro company_id + guard |
| `src/pages/admin/Events.tsx` | Adicionar filtro company_id + guard |
| `src/pages/admin/Drivers.tsx` | Adicionar filtro company_id + guard |
| `src/pages/admin/BoardingLocations.tsx` | Adicionar filtro company_id + guard |

