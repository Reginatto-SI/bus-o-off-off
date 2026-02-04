

# Plano: Exportacao PDF - Tela Piloto /admin/frota

## Visao Geral

Implementar exportacao PDF com estrutura profissional e identidade visual do sistema, seguindo o mesmo padrao reutilizavel estabelecido na exportacao Excel.

---

## 1. Dependencia Nova

Instalar bibliotecas para geracao de PDF:

```
jspdf (geracao de PDF)
jspdf-autotable (tabelas automaticas)
```

Essas bibliotecas sao leves, funcionam 100% no cliente e geram PDFs nativos.

---

## 2. Componente Reutilizavel: ExportPDFModal

**Arquivo:** `src/components/admin/ExportPDFModal.tsx`

### Props do Componente

| Prop | Tipo | Descricao |
|------|------|-----------|
| open | boolean | Controla visibilidade do modal |
| onOpenChange | function | Callback para fechar o modal |
| columns | ExportColumn[] | Lista de colunas disponiveis (mesmo tipo do Excel) |
| data | any[] | Dados filtrados para exportar |
| storageKey | string | Chave para salvar preferencia (ex: "export_pdf_frota") |
| fileName | string | Nome do arquivo gerado (ex: "frota") |
| title | string | Titulo do documento (ex: "Frota de Veiculos") |
| companyName | string | Nome da empresa para o cabecalho |

### Comportamento do Modal

1. Ao abrir, carrega preferencias do localStorage
2. Exibe lista de colunas com checkboxes (identico ao Excel)
3. Botoes: "Marcar Todos", "Desmarcar Todos"
4. Ao confirmar:
   - Salva selecao no localStorage
   - Gera PDF com colunas selecionadas
   - Faz download automatico

---

## 3. Estrutura do PDF

### Cabecalho (Topo de cada pagina)

```text
+----------------------------------------------------------+
| [LOGO]  Busao Off Off                                    |
|         Empresa: [Nome da Empresa Ativa]                 |
|                                                          |
|         FROTA DE VEICULOS                                |
|         Gerado em: 04/02/2026 as 14:30                   |
+----------------------------------------------------------+
```

Detalhes:
- Logo do sistema (formato base64 para incorporar no PDF)
- Nome do sistema
- Nome da empresa ativa
- Titulo do documento em destaque
- Data e hora de geracao

### Tabela de Dados

```text
+----------------------------------------------------------+
| TIPO   | MARCA/MODELO  | PLACA  | PROPRIETARIO | STATUS  |
+----------------------------------------------------------+
| Onibus | Mercedes/500  | ABC... | Joao Silva   | Ativo   |
| Van    | Fiat/Ducato   | XYZ... | Maria Costa  | Inativo |
+----------------------------------------------------------+
```

Estilo:
- Cabecalho da tabela com fundo laranja institucional (#F97316)
- Texto do cabecalho em branco
- Linhas alternadas em cinza claro para leitura
- Bordas finas e discretas
- Fonte legivel (tamanho 10-11pt)

### Rodape (Em todas as paginas)

```text
+----------------------------------------------------------+
| Documento gerado pelo sistema Busao Off Off    Pagina 1/2|
+----------------------------------------------------------+
```

---

## 4. Cor Laranja Institucional

A cor primaria do sistema e:
- CSS: `hsl(25, 95%, 53%)`
- HEX: `#F97316`
- RGB: `249, 115, 22`

Esta cor sera usada no cabecalho da tabela do PDF.

---

## 5. Configuracao das Colunas (Frota)

Reutilizar a mesma interface `ExportColumn` do Excel:

```typescript
const pdfColumns: ExportColumn[] = [
  { key: 'type', label: 'Tipo', format: (v) => v === 'onibus' ? 'Onibus' : 'Van' },
  { key: 'brand', label: 'Marca' },
  { key: 'model', label: 'Modelo' },
  { key: 'plate', label: 'Placa' },
  { key: 'owner', label: 'Proprietario' },
  { key: 'capacity', label: 'Capacidade' },
  { key: 'status', label: 'Status', format: (v) => v === 'ativo' ? 'Ativo' : 'Inativo' },
  // ... demais colunas
];
```

---

## 6. Logica de Preferencias (localStorage)

### Chave de Armazenamento

```
export_pdf_columns_frota
```

### Estrutura Salva

```json
{
  "selectedColumns": ["type", "brand", "model", "plate", "owner", "status"]
}
```

### Comportamento

- Preferencias de PDF sao independentes das de Excel
- Primeira vez: colunas principais selecionadas por padrao
- Proximas vezes: carrega selecao salva

---

## 7. Geracao do PDF (Processo Tecnico)

### Fluxo

1. Criar instancia do jsPDF (orientacao paisagem para mais colunas)
2. Converter logo para base64 e adicionar ao cabecalho
3. Adicionar textos do cabecalho (empresa, titulo, data)
4. Gerar tabela com jspdf-autotable
5. Adicionar rodape com paginacao
6. Fazer download do arquivo

### Orientacao do Documento

- Paisagem (landscape) para acomodar mais colunas
- Tamanho A4

---

## 8. Alteracoes no Fleet.tsx

### Novos Imports

```typescript
import { ExportPDFModal } from '@/components/admin/ExportPDFModal';
```

### Novos Estados

```typescript
const [pdfModalOpen, setPdfModalOpen] = useState(false);
```

### Botao PDF

Alterar de `toast.info` para abrir o modal:

```typescript
const handleExportPDF = () => {
  setPdfModalOpen(true);
};
```

### Renderizacao do Modal

```tsx
<ExportPDFModal
  open={pdfModalOpen}
  onOpenChange={setPdfModalOpen}
  columns={exportColumns}
  data={filteredVehicles}
  storageKey="frota"
  fileName="frota"
  title="Frota de Veiculos"
  companyName="Busao Off Off" // ou nome dinamico da empresa
/>
```

---

## 9. Utilitario para Logo Base64

Criar funcao utilitaria para converter a logo em base64:

**Arquivo:** `src/lib/pdfUtils.ts`

```typescript
// Funcao para obter logo em base64
export async function getLogoBase64(): Promise<string> {
  // Converte a imagem para base64 para uso no PDF
}

// Cor institucional para uso no PDF
export const BRAND_ORANGE = '#F97316';
```

---

## 10. Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| `package.json` | Adicionar jspdf e jspdf-autotable |
| `src/lib/pdfUtils.ts` | Criar utilitarios de PDF |
| `src/components/admin/ExportPDFModal.tsx` | Criar componente |
| `src/pages/admin/Fleet.tsx` | Integrar modal de PDF |

---

## 11. Reutilizacao para Outras Telas

Para usar em outra tela (ex: Motoristas):

```tsx
<ExportPDFModal
  open={pdfModalOpen}
  onOpenChange={setPdfModalOpen}
  columns={driverColumns}
  data={filteredDrivers}
  storageKey="motoristas"
  fileName="motoristas"
  title="Motoristas Cadastrados"
  companyName={companyName}
/>
```

Cada tela define suas proprias colunas e titulo, o componente gerencia todo o resto.

---

## 12. Resultado Esperado

1. Usuario clica em "PDF" e ve modal de selecao de colunas
2. Usuario escolhe colunas desejadas
3. Sistema salva preferencia automaticamente
4. PDF gerado com:
   - Cabecalho profissional com logo
   - Tabela organizada com dados filtrados
   - Estilo visual coerente com a marca
   - Rodape com paginacao
5. Proxima exportacao ja vem com colunas pre-selecionadas
6. Componente pronto para reuso em outras telas

---

## Resumo Visual do PDF Final

```text
+------------------------------------------------------------------+
| [LOGO] Busao Off Off                                              |
|        Empresa: Empresa Demo                                      |
|                                                                   |
|        FROTA DE VEICULOS                                          |
|        Gerado em: 04/02/2026 as 14:30                             |
+------------------------------------------------------------------+
|                                                                   |
| +--------------------------------------------------------------+ |
| | TIPO   | MARCA  | MODELO | PLACA   | PROPRIETARIO | STATUS   | |
| +--------------------------------------------------------------+ |
| | Onibus | Merc.  | O-500  | ABC1234 | Joao Silva   | Ativo    | |
| | Van    | Fiat   | Ducato | XYZ5678 | Maria Costa  | Inativo  | |
| | Onibus | Volvo  | B10M   | DEF9012 | Pedro Santos | Ativo    | |
| +--------------------------------------------------------------+ |
|                                                                   |
+------------------------------------------------------------------+
| Documento gerado pelo sistema Busao Off Off          Pagina 1/1  |
+------------------------------------------------------------------+
```

