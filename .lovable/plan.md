
# Comissionamento Variavel por Empresa + Repasse Automatico para Parceiro via Stripe

## Resumo

Implementar taxa de plataforma variavel por empresa, cadastro de parceiro com conta Stripe Connect, e repasse automatico da parte do parceiro via Stripe Transfer apos confirmacao de pagamento.

---

## 1. Migracao de Banco de Dados

### 1.1 Novos campos na tabela `companies`

```sql
ALTER TABLE public.companies
  ADD COLUMN platform_fee_percent numeric NOT NULL DEFAULT 7.5,
  ADD COLUMN partner_split_percent numeric NOT NULL DEFAULT 50;
```

- `platform_fee_percent`: taxa total da plataforma sobre a venda (ex: 7%, 9%, 6.5%)
- `partner_split_percent`: percentual da comissao da plataforma que vai para o parceiro (ex: 50 = metade)

### 1.2 Nova tabela `partners`

```sql
CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  stripe_account_id text,
  stripe_onboarding_complete boolean NOT NULL DEFAULT false,
  split_percent numeric NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'ativo',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- Somente gerentes podem gerenciar parceiros
CREATE POLICY "Gerentes can manage partners"
  ON public.partners FOR ALL
  USING (has_role(auth.uid(), 'gerente'::user_role))
  WITH CHECK (has_role(auth.uid(), 'gerente'::user_role));
```

Nota: A tabela `partners` nao possui `company_id` porque o parceiro e unico da plataforma (socio), nao vinculado a uma empresa especifica. O `split_percent` em `partners` e o default global, mas o campo `partner_split_percent` em `companies` permite customizacao por empresa.

### 1.3 Novos campos na tabela `sales` (registro financeiro)

```sql
ALTER TABLE public.sales
  ADD COLUMN gross_amount numeric,
  ADD COLUMN platform_fee_total numeric,
  ADD COLUMN partner_fee_amount numeric,
  ADD COLUMN platform_net_amount numeric,
  ADD COLUMN stripe_transfer_id text;
```

Todos nullable porque serao preenchidos somente apos confirmacao de pagamento.

### 1.4 Trigger updated_at para partners

```sql
CREATE TRIGGER set_partners_updated_at
  BEFORE UPDATE ON public.partners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
```

---

## 2. Edge Function: create-checkout-session (modificacao)

### Alteracoes:
- Remover constante fixa `PLATFORM_FEE_PERCENT = 0.075`
- Buscar `platform_fee_percent` da empresa no SELECT da company
- Calcular `applicationFeeCents` usando a taxa variavel da empresa
- Corrigir import do supabase (usar `"https://esm.sh/@supabase/supabase-js@2"` em vez de `npm:`)

```text
Antes:  const PLATFORM_FEE_PERCENT = 0.075;
Depois: const feePercent = company.platform_fee_percent / 100;
        const applicationFeeCents = Math.round(totalAmountCents * feePercent);
```

---

## 3. Edge Function: stripe-webhook (modificacao principal)

### Alteracoes no evento `checkout.session.completed`:

Apos marcar a venda como `pago`, adicionar logica de:

1. Buscar dados completos da venda (unit_price, quantity, company_id)
2. Buscar `platform_fee_percent` e `partner_split_percent` da empresa
3. Buscar parceiro ativo na tabela `partners`
4. Calcular:
   - `gross_amount` = unit_price * quantity
   - `platform_fee_total` = gross_amount * (platform_fee_percent / 100)
   - `partner_fee_amount` = platform_fee_total * (partner_split_percent / 100)
   - `platform_net_amount` = platform_fee_total - partner_fee_amount
5. Se parceiro ativo com `stripe_account_id`:
   - Criar `stripe.transfers.create()` com `partner_fee_amount` para a conta do parceiro
   - Registrar `stripe_transfer_id` na venda
6. Atualizar a venda com todos os campos financeiros

### Regras de seguranca:
- Se parceiro inativo ou sem Stripe: nao fazer transfer, `partner_fee_amount = 0`, `platform_net_amount = platform_fee_total`
- Logar erro mas nao falhar o webhook se transfer falhar

---

## 4. Nova pagina: /admin/parceiros

### Tela simples com CRUD basico seguindo padrao piloto:

- PageHeader com titulo "Parceiros"
- Listagem em tabela com colunas: Nome, Stripe Account, Status, Split %
- Modal de criacao/edicao com campos:
  - Nome
  - Stripe Account ID (texto, preenchido manualmente)
  - Status (ativo/inativo)
  - Notas
- Acesso exclusivo para perfil `gerente`

### Nota importante:
O `split_percent` do parceiro na tabela `partners` serve como referencia. O valor efetivo usado no calculo e o `partner_split_percent` da empresa. Isso permite flexibilidade por empresa.

---

## 5. Tela /admin/vendas (modificacao)

### Novas colunas na tabela (visiveis apenas para Gerente):
- Valor Bruto (`gross_amount`)
- Comissao Total (`platform_fee_total`)
- Comissao Parceiro (`partner_fee_amount`)
- Liquido Plataforma (`platform_net_amount`)

### Tooltip explicativo:
Ao passar o mouse sobre o cabecalho da coluna "Comissao", exibir:
"Comissao = Valor Bruto x Taxa da Empresa. Parceiro recebe X% da comissao. Plataforma retém o restante."

### Novos KPIs (somente Gerente):
- Total Comissao Plataforma (soma de `platform_fee_total` das vendas pagas)
- Total Parceiro (soma de `partner_fee_amount`)
- Liquido Plataforma (soma de `platform_net_amount`)

---

## 6. Tela /admin/empresa (modificacao)

### Adicionar campos na aba de dados da empresa:
- `platform_fee_percent` -- "Taxa da Plataforma (%)"
- `partner_split_percent` -- "Repasse ao Parceiro (%)"

Editavel apenas pelo Gerente.

---

## 7. Tipos TypeScript

### Atualizar `src/types/database.ts`:

```typescript
// Em Company:
platform_fee_percent: number;
partner_split_percent: number;

// Em Sale:
gross_amount: number | null;
platform_fee_total: number | null;
partner_fee_amount: number | null;
platform_net_amount: number | null;
stripe_transfer_id: string | null;

// Novo tipo:
export type PartnerStatus = 'ativo' | 'inativo';

export interface Partner {
  id: string;
  name: string;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  split_percent: number;
  status: PartnerStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
```

---

## 8. Navegacao

### AdminSidebar:
- Adicionar item "Parceiros" no grupo de configuracoes, com icone `Handshake` ou `Users`, visivel apenas para `gerente`
- Rota: `/admin/parceiros`

### App.tsx:
- Adicionar rota `/admin/parceiros` apontando para o novo componente

---

## 9. Build error fix

Corrigir o import nas edge functions de `npm:@supabase/supabase-js@2.57.2` para `https://esm.sh/@supabase/supabase-js@2` em todas as 3 edge functions (create-checkout-session, stripe-webhook, create-connect-account) para resolver o erro de build atual.

---

## Arquivos a criar

| Arquivo | Descricao |
|---------|-----------|
| `src/pages/admin/Partners.tsx` | Tela CRUD de parceiros |

## Arquivos a modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/create-checkout-session/index.ts` | Taxa variavel por empresa, fix import |
| `supabase/functions/stripe-webhook/index.ts` | Calculo de split, transfer para parceiro, registro financeiro, fix import |
| `supabase/functions/create-connect-account/index.ts` | Fix import |
| `src/pages/admin/Sales.tsx` | Novas colunas e KPIs financeiros |
| `src/pages/admin/Company.tsx` | Campos de taxa e split |
| `src/types/database.ts` | Novos tipos e campos |
| `src/App.tsx` | Nova rota /admin/parceiros |
| `src/components/layout/AdminSidebar.tsx` | Link Parceiros no menu |

## Migracoes de banco

| Alteracao | Descricao |
|-----------|-----------|
| Campos em `companies` | `platform_fee_percent`, `partner_split_percent` |
| Tabela `partners` | CRUD de parceiros com RLS |
| Campos em `sales` | `gross_amount`, `platform_fee_total`, `partner_fee_amount`, `platform_net_amount`, `stripe_transfer_id` |

## O que NAO sera alterado

- Logica de QR Code e passagens
- Telas publicas
- Regra de nao estorno da taxa (mantida)
- Arquitetura multiempresa existente
