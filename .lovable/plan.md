
# Plano: Tela Piloto de Cadastros - /admin/frota

## Visao Geral

Evoluir a tela de Frota para ser o modelo oficial de cadastros administrativos, com UX aprimorada, filtros inteligentes e componentes reutilizaveis.

---

## Estrutura de Componentes a Criar

### Componentes Reutilizaveis (novos)

```text
src/components/admin/
  +-- StatsCard.tsx          # Card de indicador individual
  +-- StatsCardsGrid.tsx     # Grid de cards de indicadores
  +-- FilterCard.tsx         # Card de filtros com expansao
  +-- ActionsDropdown.tsx    # Menu de acoes padrao (ellipsis)
  +-- PageHeader.tsx         # Header padrao de paginas admin
  +-- ExportButtons.tsx      # Botoes Excel/PDF
```

---

## 1. Header da Pagina (PageHeader)

**Estrutura:**
- Lado esquerdo: Titulo + Descricao
- Lado direito: Acoes globais + Botao primario

**Acoes globais:**
- Gerar Excel (outline)
- Gerar PDF (outline)
- Adicionar Veiculo (primary)

**Codigo esperado:**
```text
+----------------------------------------------------------+
|  Frota                           [Excel] [PDF] [+ Adicionar]
|  Gerencie os veiculos disponiveis                        |
+----------------------------------------------------------+
```

---

## 2. Cards de Indicadores (StatsCardsGrid)

**4 cards em grid responsivo:**

| Card | Valor | Icone |
|------|-------|-------|
| Total de veiculos | count(*) | Bus |
| Veiculos ativos | count(status=ativo) | CheckCircle |
| Veiculos inativos | count(status=inativo) | XCircle |
| Capacidade total | sum(capacity) | Users |

**Layout:**
- Desktop: 4 colunas
- Tablet: 2 colunas
- Mobile: 1 coluna

---

## 3. Card de Filtros (FilterCard)

### Filtros Simples (sempre visiveis)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| Pesquisa | Input texto | Busca por placa, proprietario, marca ou modelo |
| Status | Select | Todos / Ativo / Inativo |
| Tipo | Select | Todos / Onibus / Van |

### Filtros Avancados (expansiveis)

| Campo | Tipo |
|-------|------|
| Marca | Input |
| Modelo | Input |
| Ano modelo | Input numerico |
| Capacidade minima | Input numerico |
| Capacidade maxima | Input numerico |

**Comportamento:**
- Botao "Filtros avancados" expande/recolhe a secao
- Botao "Limpar filtros" sempre visivel
- Filtros aplicados em tempo real (debounce)

---

## 4. Tabela de Listagem (ajustes)

### Colunas Atualizadas

| Coluna | Conteudo | Observacao |
|--------|----------|------------|
| Tipo | Icone + "Onibus" ou "Van" | Mantido |
| **Marca / Modelo** | "Mercedes / O-500" | **NOVA** |
| Placa | ABC-1234 | Font mono |
| Proprietario | Nome | - |
| Capacidade | 46 passageiros | Com unidade |
| Status | Badge colorido | StatusBadge |
| Acoes | Menu ellipsis | **ALTERADO** |

### Nova Coluna Marca/Modelo
- Exibe os dois valores concatenados
- Se vazio, exibe "-"
- Ajuda identificacao rapida sem abrir modal

---

## 5. Menu de Acoes (ActionsDropdown)

**Padrao oficial para todas as telas:**

```text
[ ... ]  <-- Botao ellipsis
  +----------------+
  | Editar         |
  | Ativar/Desativar|
  +----------------+
```

**Componente reutilizavel:**
- Recebe lista de acoes
- Cada acao: label, icone, onClick, variant (opcional)
- Usa DropdownMenu do shadcn/ui

---

## 6. Logica de Filtragem

### Estado dos Filtros
```text
filters: {
  search: string,        // texto livre
  status: 'all' | 'ativo' | 'inativo',
  type: 'all' | 'onibus' | 'van',
  brand: string,
  model: string,
  yearModel: string,
  capacityMin: string,
  capacityMax: string
}
```

### Aplicacao
- Filtragem client-side (dados ja carregados)
- useMemo para lista filtrada
- Debounce de 300ms no campo de pesquisa

---

## 7. Exportacao (Excel/PDF)

**Comportamento:**
- Exporta apenas os dados filtrados
- Excel: usa biblioteca xlsx ou similar
- PDF: usa jsPDF ou similar

**Nota:** No MVP, os botoes podem estar presentes mas desabilitados com tooltip "Em breve", ou implementados basicamente.

---

## 8. CSS/Estilos Adicionais

Adicionar ao `index.css`:

```css
/* Cards de indicadores */
.stats-card {
  @apply bg-card rounded-lg border p-4 shadow-sm;
}

.stats-card__value {
  @apply text-2xl font-bold text-foreground;
}

.stats-card__label {
  @apply text-sm text-muted-foreground;
}

/* Card de filtros */
.filter-card {
  @apply bg-card rounded-lg border p-4 shadow-sm;
}
```

---

## 9. Arquivos a Modificar/Criar

| Arquivo | Acao |
|---------|------|
| `src/components/admin/StatsCard.tsx` | Criar |
| `src/components/admin/FilterCard.tsx` | Criar |
| `src/components/admin/ActionsDropdown.tsx` | Criar |
| `src/components/admin/PageHeader.tsx` | Criar |
| `src/pages/admin/Fleet.tsx` | Refatorar |
| `src/index.css` | Adicionar estilos |

---

## 10. Estrutura Final da Tela

```text
+----------------------------------------------------------+
| HEADER                                                    |
| Frota                         [Excel] [PDF] [+ Adicionar] |
| Gerencie os veiculos disponiveis                          |
+----------------------------------------------------------+

+------------+ +------------+ +------------+ +------------+
| Total      | | Ativos     | | Inativos   | | Capacidade |
| 12         | | 10         | | 2          | | 540        |
+------------+ +------------+ +------------+ +------------+

+----------------------------------------------------------+
| FILTROS                                                   |
| [Pesquisar...        ] [Status v] [Tipo v] [Limpar]       |
|                                                           |
| [Filtros avancados v]                                     |
|   Marca: [____] Modelo: [____] Ano: [____]                |
|   Capacidade min: [____] Capacidade max: [____]           |
+----------------------------------------------------------+

+----------------------------------------------------------+
| TABELA                                                    |
| Tipo | Marca/Modelo | Placa | Proprietario | Cap | Status | Acoes |
|------|--------------|-------|--------------|-----|--------|-------|
| Bus  | Mercedes/500 | ABC.. | Joao Silva   | 46  | Ativo  | [...] |
+----------------------------------------------------------+
```

---

## Resultado Esperado

1. Tela `/admin/frota` como referencia visual e funcional
2. Componentes reutilizaveis para proximas telas
3. UX aprimorada com filtros inteligentes
4. Usuario localiza veiculos sem abrir modal
5. Padrao de acoes (ellipsis menu) definido

