
# Plano: Evolucao da Empresa + Cabecalho Institucional do PDF

## Visao Geral

Evoluir a estrutura de dados da entidade Empresa para representar identidade institucional completa e ajustar o cabecalho do PDF para exibir esses dados de forma profissional.

---

## Parte 1: Evolucao da Estrutura da Empresa (Banco de Dados)

### Estrutura Atual da Tabela `companies`

| Campo | Tipo | Observacao |
|-------|------|------------|
| id | uuid | PK |
| name | text | Nome unico |
| document | text | Documento generico |
| phone | text | Telefone |
| email | text | Email |
| address | text | Endereco |
| notes | text | Observacoes |
| is_active | boolean | Status |
| created_at | timestamp | Criacao |
| updated_at | timestamp | Atualizacao |

### Novos Campos a Adicionar

#### Identidade Institucional

| Campo | Tipo | Descricao |
|-------|------|-----------|
| trade_name | text | Nome fantasia (exibicao principal) |
| legal_name | text | Razao social |
| cnpj | text | CNPJ formatado |
| city | text | Cidade sede |
| state | text | UF (2 caracteres) |

#### Identidade Visual

| Campo | Tipo | Descricao |
|-------|------|-----------|
| logo_url | text | URL da logo para PDFs |
| primary_color | text | Cor primaria hex (ex: #F97316) |

#### Contato Institucional

| Campo | Tipo | Descricao |
|-------|------|-----------|
| whatsapp | text | WhatsApp institucional |
| website | text | Site da empresa |

### Migracao SQL

```sql
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS trade_name text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state char(2),
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#F97316',
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS website text;

COMMENT ON COLUMN companies.trade_name IS 'Nome fantasia para exibicao em documentos';
COMMENT ON COLUMN companies.legal_name IS 'Razao social oficial';
COMMENT ON COLUMN companies.cnpj IS 'CNPJ formatado';
COMMENT ON COLUMN companies.primary_color IS 'Cor primaria hex para PDFs';
```

### Estrategia de Compatibilidade

- Campo `name` continua existindo como nome principal/fallback
- Campo `trade_name` e o nome fantasia para documentos
- Se `trade_name` estiver vazio, usar `name` como fallback
- Se `legal_name` estiver vazio, nao exibir razao social no PDF

---

## Parte 2: Atualizacao do Tipo TypeScript

### Arquivo: `src/types/database.ts`

```typescript
export interface Company {
  id: string;
  name: string;
  // Identidade institucional
  trade_name: string | null;
  legal_name: string | null;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  // Identidade visual
  logo_url: string | null;
  primary_color: string | null;
  // Contato institucional
  document: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
  // Sistema
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

---

## Parte 3: Evolucao do Componente ExportPDFModal

### Alteracoes nas Props

```typescript
interface ExportPDFModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ExportColumn[];
  data: any[];
  storageKey: string;
  fileName: string;
  title: string;
  company: Company | null;  // NOVO: objeto completo da empresa
}
```

### Nova Estrutura do Cabecalho PDF

```text
+------------------------------------------------------------------+
| BLOCO ESQUERDO                      |    BLOCO DIREITO           |
+------------------------------------------------------------------+
| [LOGO]  Nome Fantasia               |    Sistema: Busao Off Off  |
|         Razao Social Ltda           |                            |
|         CNPJ: 00.000.000/0001-00    |    FROTA DE VEICULOS       |
|         Cidade - UF                 |                            |
|                                     |    Gerado em: 04/02/2026   |
|                                     |    as 14:30                |
+------------------------------------------------------------------+
```

### Logica de Fallback

1. Logo: se `logo_url` vazio, usar logo padrao do sistema
2. Nome fantasia: se `trade_name` vazio, usar `name`
3. Razao social: se `legal_name` vazio, nao exibir linha
4. CNPJ: se `cnpj` vazio, nao exibir linha
5. Cidade/UF: se ambos vazios, nao exibir linha
6. Cor primaria: se `primary_color` vazio, usar `#F97316`

---

## Parte 4: Atualizacao do Fleet.tsx

### Alteracoes Necessarias

1. Obter `activeCompany` do contexto de autenticacao
2. Passar objeto empresa completo para o modal PDF

```typescript
// Importar activeCompany do contexto
const { activeCompany } = useAuth();

// No JSX
<ExportPDFModal
  open={pdfModalOpen}
  onOpenChange={setPdfModalOpen}
  columns={exportColumns}
  data={filteredVehicles}
  storageKey="frota"
  fileName="frota"
  title="Frota de Veiculos"
  company={activeCompany}  // Passar empresa completa
/>
```

---

## Parte 5: Utilidades de PDF Atualizadas

### Arquivo: `src/lib/pdfUtils.ts`

Adicionar funcoes para:

1. Obter cor primaria da empresa (com fallback)
2. Formatar CNPJ para exibicao
3. Renderizar cabecalho institucional

```typescript
// Cor primaria com fallback
export function getCompanyPrimaryColor(company: Company | null): string {
  return company?.primary_color || BRAND_ORANGE;
}

// Obter nome para exibicao
export function getCompanyDisplayName(company: Company | null): string {
  return company?.trade_name || company?.name || 'Empresa';
}
```

---

## Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| Migracao SQL | Adicionar campos na tabela companies |
| `src/types/database.ts` | Atualizar interface Company |
| `src/lib/pdfUtils.ts` | Adicionar funcoes utilitarias |
| `src/components/admin/ExportPDFModal.tsx` | Cabecalho institucional |
| `src/pages/admin/Fleet.tsx` | Passar empresa para modal |

---

## Hierarquia Visual do Cabecalho

```text
BLOCO ESQUERDO (identidade da empresa)
  - Logo (destaque visual)
  - Nome fantasia (fonte maior, bold)
  - Razao social (fonte menor, regular)
  - CNPJ (fonte menor, cinza)
  - Cidade - UF (fonte menor, cinza)

BLOCO DIREITO (identidade do documento)
  - "Sistema: Busao Off Off" (texto pequeno)
  - Titulo do documento (fonte grande, cor primaria)
  - Data e hora de geracao (fonte pequena)
```

---

## Cores e Tipografia

### Cores

- Cor primaria: usar `company.primary_color` ou `#F97316`
- Textos principais: preto `#000000` ou cinza escuro `#333333`
- Textos secundarios: cinza `#666666`
- Cabecalho da tabela: cor primaria com texto branco

### Fontes

- Nome fantasia: Helvetica Bold, 14pt
- Razao social: Helvetica, 10pt
- CNPJ/Cidade: Helvetica, 9pt, cinza
- Titulo do documento: Helvetica Bold, 16pt
- Data geracao: Helvetica, 9pt

---

## Resultado Esperado

1. Tabela `companies` com campos institucionais completos
2. PDF com cabecalho profissional e dados reais da empresa
3. Fallbacks para quando dados nao estiverem preenchidos
4. Padrao reutilizavel para todos os PDFs futuros
5. Identidade visual da empresa refletida nos documentos

---

## Ordem de Implementacao

1. Executar migracao SQL para adicionar campos
2. Atualizar tipo TypeScript da Company
3. Atualizar pdfUtils com funcoes auxiliares
4. Refatorar ExportPDFModal com novo cabecalho
5. Atualizar Fleet.tsx para passar empresa
6. Testar geracao de PDF com dados reais
