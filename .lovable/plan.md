
# Plano: Exportacao Excel - Tela Piloto /admin/frota

## Visao Geral

Implementar exportacao Excel com modal de selecao de colunas e preferencias salvas em localStorage, servindo como padrao reutilizavel para outras telas administrativas.

---

## 1. Dependencia Nova

Instalar biblioteca `xlsx` para geracao de arquivos Excel:

```
xlsx (SheetJS)
```

Esta biblioteca e leve, nao requer backend e gera arquivos .xlsx nativos.

---

## 2. Componente Reutilizavel: ExportExcelModal

**Arquivo:** `src/components/admin/ExportExcelModal.tsx`

### Props do Componente

| Prop | Tipo | Descricao |
|------|------|-----------|
| open | boolean | Controla visibilidade do modal |
| onOpenChange | function | Callback para fechar o modal |
| columns | ExportColumn[] | Lista de colunas disponiveis |
| data | any[] | Dados filtrados para exportar |
| storageKey | string | Chave para salvar preferencia (ex: "export_frota") |
| fileName | string | Nome do arquivo gerado (ex: "frota") |

### Interface ExportColumn

```typescript
interface ExportColumn {
  key: string;        // Chave do campo no objeto (ex: "plate")
  label: string;      // Nome em portugues (ex: "Placa")
  format?: (value: any) => string; // Formatador opcional
}
```

### Comportamento do Modal

1. Ao abrir, carrega preferencias do localStorage
2. Exibe lista de colunas com checkboxes
3. Botoes: "Marcar Todos", "Desmarcar Todos"
4. Ao confirmar:
   - Salva selecao no localStorage
   - Gera arquivo Excel com colunas selecionadas
   - Faz download automatico

---

## 3. Estrutura do Modal

```text
+----------------------------------------------+
| Exportar para Excel                     [X]  |
+----------------------------------------------+
| Selecione as colunas que deseja exportar:    |
|                                              |
| [Marcar Todos] [Desmarcar Todos]             |
|                                              |
| [x] Tipo                                     |
| [x] Marca                                    |
| [x] Modelo                                   |
| [x] Placa                                    |
| [x] Proprietario                             |
| [x] Capacidade                               |
| [x] Status                                   |
| [ ] Ano do Modelo                            |
| [ ] Cor                                      |
| [ ] Renavam                                  |
| [ ] Chassi                                   |
| [ ] Link WhatsApp                            |
| [ ] Observacoes                              |
+----------------------------------------------+
|                          [Cancelar] [Gerar]  |
+----------------------------------------------+
```

---

## 4. Colunas Disponiveis para Frota

| Coluna | Campo | Formato |
|--------|-------|---------|
| Tipo | type | "Onibus" ou "Van" |
| Marca | brand | texto |
| Modelo | model | texto |
| Placa | plate | texto |
| Proprietario | owner | texto |
| Capacidade | capacity | numero |
| Status | status | "Ativo" ou "Inativo" |
| Ano do Modelo | year_model | numero |
| Cor | color | texto |
| Renavam | renavam | texto |
| Chassi | chassis | texto |
| Link WhatsApp | whatsapp_group_link | texto |
| Observacoes | notes | texto |

---

## 5. Logica de Preferencias (localStorage)

### Chave de Armazenamento

```
export_columns_frota
```

### Estrutura Salva

```json
{
  "selectedColumns": ["type", "brand", "model", "plate", "owner", "capacity", "status"]
}
```

### Comportamento

1. Primeira vez: todas as colunas principais selecionadas por padrao
2. Proximas vezes: carrega selecao salva
3. Ao exportar: atualiza preferencia automaticamente

---

## 6. Geracao do Excel

### Processo

1. Filtrar dados conforme colunas selecionadas
2. Criar array de objetos com labels em portugues
3. Usar xlsx para gerar workbook
4. Fazer download como `frota.xlsx`

### Formato do Arquivo

- Uma unica aba chamada "Frota"
- Cabecalho na linha 1 com nomes em portugues
- Dados a partir da linha 2
- Sem formulas ou formatacao especial

---

## 7. Alteracoes no Fleet.tsx

### Novos Estados

```typescript
const [exportModalOpen, setExportModalOpen] = useState(false);
```

### Configuracao de Colunas

```typescript
const exportColumns: ExportColumn[] = [
  { key: 'type', label: 'Tipo', format: (v) => v === 'onibus' ? 'Onibus' : 'Van' },
  { key: 'brand', label: 'Marca' },
  { key: 'model', label: 'Modelo' },
  { key: 'plate', label: 'Placa' },
  { key: 'owner', label: 'Proprietario' },
  { key: 'capacity', label: 'Capacidade' },
  { key: 'status', label: 'Status', format: (v) => v === 'ativo' ? 'Ativo' : 'Inativo' },
  { key: 'year_model', label: 'Ano do Modelo' },
  { key: 'color', label: 'Cor' },
  { key: 'renavam', label: 'Renavam' },
  { key: 'chassis', label: 'Chassi' },
  { key: 'whatsapp_group_link', label: 'Link WhatsApp' },
  { key: 'notes', label: 'Observacoes' },
];
```

### Botao Excel

Alterar de `toast.info` para abrir o modal:

```typescript
const handleExportExcel = () => {
  setExportModalOpen(true);
};
```

---

## 8. Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| `package.json` | Adicionar dependencia xlsx |
| `src/components/admin/ExportExcelModal.tsx` | Criar componente |
| `src/pages/admin/Fleet.tsx` | Integrar modal de exportacao |

---

## 9. Reutilizacao para Outras Telas

Para usar em outra tela (ex: Motoristas):

```tsx
<ExportExcelModal
  open={exportModalOpen}
  onOpenChange={setExportModalOpen}
  columns={driverColumns}
  data={filteredDrivers}
  storageKey="export_motoristas"
  fileName="motoristas"
/>
```

Cada tela define suas proprias colunas e o componente gerencia todo o resto.

---

## Resultado Esperado

1. Usuario clica em "Excel" e ve modal de selecao
2. Usuario escolhe colunas desejadas
3. Sistema salva preferencia automaticamente
4. Arquivo Excel gerado com dados filtrados
5. Proxima exportacao ja vem com colunas pre-selecionadas
6. Componente pronto para reuso em outras telas
