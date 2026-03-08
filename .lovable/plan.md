

## Plano: Nova funcionalidade — Parceiros Comerciais da Empresa

### Diagnóstico da Situação Atual

Confirmada a análise do código e banco:

| Entidade | Tabela no banco | Nomenclatura no front | Propósito |
|----------|-----------------|----------------------|-----------|
| **Sócios da Plataforma** | `partners` (legado) | "Sócios" em `/admin/socios` | Split de comissão via Stripe Connect |
| **Patrocinadores** | `sponsors` | "Patrocinadores" em `/admin/patrocinadores` | Cadastro base reutilizável, vinculado por evento |
| **Parceiros Comerciais** | ⚠️ **NÃO EXISTE** | — | Relacionamento institucional da empresa |

**Conclusão crítica**: A tabela `partners` do banco é **exclusivamente para Sócios** (split de receita). Não reutilizaremos essa estrutura para parceiros comerciais.

---

### 1. Nova Tabela: `commercial_partners`

Estrutura própria, multiempresa, semanticamente correta:

```sql
CREATE TABLE public.commercial_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Dados básicos
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ativo',
  display_order integer NOT NULL DEFAULT 1,
  partner_tier text NOT NULL DEFAULT 'basico', -- basico | destaque | premium
  
  -- Identidade visual
  logo_url text,
  
  -- Redirecionamento
  website_url text,
  instagram_url text,
  whatsapp_phone text,
  
  -- Contato
  contact_phone text,
  contact_email text,
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.commercial_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage commercial_partners"
  ON public.commercial_partners FOR ALL
  USING (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (is_admin(auth.uid()) AND user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "Public can view active commercial_partners"
  ON public.commercial_partners FOR SELECT
  USING (status = 'ativo' AND EXISTS (
    SELECT 1 FROM companies c WHERE c.id = commercial_partners.company_id AND c.is_active = true
  ));
```

---

### 2. Tipos TypeScript

**Arquivo**: `src/types/database.ts`

```typescript
export type CommercialPartnerStatus = 'ativo' | 'inativo';
export type CommercialPartnerTier = 'basico' | 'destaque' | 'premium';

export interface CommercialPartner {
  id: string;
  company_id: string;
  name: string;
  status: CommercialPartnerStatus;
  display_order: number;
  partner_tier: CommercialPartnerTier;
  logo_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  whatsapp_phone: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
```

---

### 3. Nova Tela: `/admin/parceiros`

**Arquivo**: `src/pages/admin/CommercialPartners.tsx`

- **Título**: "Parceiros Comerciais"
- **Descrição**: "Gerencie empresas parceiras que mantêm relacionamento institucional com sua empresa. Restaurantes, hotéis, lojas e demais parceiros recorrentes."

**Estrutura padrão admin**:
- PageHeader com título, descrição e botão "Novo Parceiro"
- Cards de KPI: Total, Ativos, Por nível (Premium/Destaque)
- FilterCard: busca por nome, filtro por status/nível
- Tabela com colunas: Logo, Nome, Nível, Status, Ações (...)
- Modal wizard em 4 etapas (padrão Patrocinadores):
  1. **Dados**: Nome, Status, Ordem, Nível
  2. **Logo**: Upload de imagem
  3. **Redirecionamento**: Site, Instagram, WhatsApp
  4. **Contato**: Telefone, Email, Observações

---

### 4. Rotas e Navegação

**Arquivo**: `src/App.tsx`
- Adicionar rota `/admin/parceiros` → `CommercialPartners`
- Remover redirect antigo `/admin/parceiros → /admin/socios`

**Arquivo**: `src/components/layout/AdminSidebar.tsx`
- Adicionar item "Parceiros" no grupo "Cadastros"
- Ícone: `Briefcase` (diferencia de Sócios que usa `Handshake`)
- Visível para: `gerente` (não é área técnica de developer)

---

### 5. Storage Bucket

Reutilizar bucket existente `company-logos` para logos de parceiros (já público).

---

### Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| Migration SQL | Criar tabela `commercial_partners` |
| `src/types/database.ts` | Adicionar tipos |
| `src/pages/admin/CommercialPartners.tsx` | **CRIAR** tela completa |
| `src/App.tsx` | Adicionar rota, remover redirect antigo |
| `src/components/layout/AdminSidebar.tsx` | Adicionar item no menu |

---

### Separação Conceitual Garantida

| Funcionalidade | Tabela | Rota | Menu | Acesso |
|----------------|--------|------|------|--------|
| **Sócios** | `partners` | `/admin/socios` | "Sócios" | developer |
| **Patrocinadores** | `sponsors` | `/admin/patrocinadores` | "Patrocinadores" | gerente |
| **Parceiros Comerciais** | `commercial_partners` | `/admin/parceiros` | "Parceiros" | gerente |

