

# Novo Perfil Developer -- Acesso Total Cross-Company

## Resumo

Adicionar a role `developer` ao sistema RBAC existente. O developer tera acesso total a todas as telas administrativas e a todas as empresas, sem restricoes de `company_id`. Os perfis atuais (gerente, operador, vendedor, motorista) nao serao afetados.

---

## 1. Migracao de Banco -- Enum e Funcoes

### 1.1 Adicionar `developer` ao enum `user_role`

```sql
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'developer';
```

### 1.2 Atualizar funcao `is_admin` para reconhecer developer

```sql
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('gerente', 'operador', 'developer')
  )
$$;
```

### 1.3 Nova funcao `is_developer` (security definer)

```sql
CREATE OR REPLACE FUNCTION public.is_developer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'developer'
  )
$$;
```

### 1.4 Atualizar funcao `user_belongs_to_company` para bypass do developer

```sql
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    -- Developer tem acesso cross-company automatico
    public.is_developer(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.companies c ON c.id = ur.company_id
      WHERE ur.user_id = _user_id
        AND ur.company_id = _company_id
        AND c.is_active = true
    )
$$;
```

Isso e o ponto central: como todas as policies RLS ja usam `user_belongs_to_company()` ou `is_admin()`, o developer herdara acesso automaticamente a todas as tabelas sem precisar alterar cada policy individualmente.

### 1.5 Atualizar funcao `get_user_active_company` para developer

A funcao atual retorna apenas a primeira empresa vinculada. Para o developer, isso continua funcionando normalmente (ele tera pelo menos uma empresa vinculada). O bypass cross-company e feito via `user_belongs_to_company`, nao via esta funcao.

---

## 2. Politicas RLS -- Ajustes Pontuais

### 2.1 Tabela `companies` -- Developer pode ver e gerenciar todas

A policy "Gerentes can manage companies" usa join direto com `user_roles`. Precisamos adicionar uma policy separada para developer:

```sql
CREATE POLICY "Developer can manage all companies"
  ON public.companies FOR ALL
  USING (public.is_developer(auth.uid()))
  WITH CHECK (public.is_developer(auth.uid()));
```

### 2.2 Tabela `partners` -- Developer tambem pode gerenciar

A policy atual usa `has_role('gerente')`. Precisamos incluir developer:

```sql
DROP POLICY IF EXISTS "Gerentes can manage partners" ON public.partners;

CREATE POLICY "Gerentes and developers can manage partners"
  ON public.partners FOR ALL
  USING (
    has_role(auth.uid(), 'gerente'::user_role)
    OR has_role(auth.uid(), 'developer'::user_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'gerente'::user_role)
    OR has_role(auth.uid(), 'developer'::user_role)
  );
```

### 2.3 Tabela `sponsors` -- Developer tambem pode gerenciar

A policy "Admins can manage sponsors" usa `is_admin()`, que ja incluira developer apos a alteracao da funcao. OK, nenhuma alteracao necessaria.

### 2.4 Demais tabelas

As tabelas `boarding_locations`, `drivers`, `events`, `event_boarding_locations`, `fleet`, `sales`, `sale_logs`, `seats`, `tickets`, `trips`, `vehicles`, `sellers` usam `is_admin()` e/ou `user_belongs_to_company()`. Com as alteracoes nas funcoes, o developer ja tera acesso automaticamente. Nenhuma policy adicional necessaria.

### 2.5 Tabela `user_roles` -- Developer pode ver tudo

A policy "Admins can view all user_roles" usa `is_admin()`, que ja incluira developer. OK.

### 2.6 Tabela `profiles` -- Developer pode ver e editar

As policies de profiles usam `is_admin()` para UPDATE e `has_role('gerente')` para SELECT/UPDATE de profiles da empresa. Developer precisa de acesso:

```sql
CREATE POLICY "Developer can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_developer(auth.uid()));

CREATE POLICY "Developer can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_developer(auth.uid()))
  WITH CHECK (public.is_developer(auth.uid()));
```

---

## 3. Frontend -- AuthContext

### 3.1 Atualizar tipo `UserRole`

Em `src/types/database.ts`:
```typescript
export type UserRole = 'gerente' | 'operador' | 'vendedor' | 'motorista' | 'developer';
```

### 3.2 Atualizar AuthContext

Adicionar flags derivadas:

```typescript
const isDeveloper = userRole === 'developer';
const isGerente = userRole === 'gerente' || isDeveloper;
const isOperador = userRole === 'operador';
const isVendedor = userRole === 'vendedor';
const canViewFinancials = userRole === 'gerente' || isDeveloper;
```

Chave da implementacao: ao fazer `isGerente = gerente || developer`, o developer herda automaticamente todo o acesso que o gerente tem em todas as telas, sem precisar alterar cada pagina individualmente.

Adicionar `isDeveloper` ao contexto para uso em funcionalidades exclusivas (como seletor de empresa).

### 3.3 Carregamento de empresas para developer (cross-company)

No `fetchUserData`, quando o usuario for developer, buscar TODAS as empresas ativas (nao apenas as vinculadas via `user_roles`):

```typescript
// Se developer, buscar todas as empresas
if (rolesData.some(r => r.role === 'developer')) {
  const { data: allCompanies } = await supabase
    .from('companies')
    .select('*')
    .eq('is_active', true);
  // usar allCompanies em vez de filtrar por companyIds
}
```

---

## 4. Frontend -- Sidebar (Seletor Discreto de Empresa)

### 4.1 Seletor de empresa exclusivo para developer

No `AdminSidebar.tsx`, adicionar um seletor de empresa discreto, visivel APENAS quando `isDeveloper === true` e houver mais de 1 empresa:

- Posicionar acima do bloco de usuario (rodape do sidebar)
- Usar um `<select>` ou dropdown compacto com label "Empresa ativa"
- Ao trocar, chamar `switchCompany(companyId)`
- Para demais perfis: nada muda, nenhum seletor aparece

---

## 5. Frontend -- Ajustes em Telas com Restricao de Role

### 5.1 AdminSidebar -- Navegacao

Atualizar o tipo local `UserRole` no sidebar para incluir `developer`. O developer vera todos os itens de menu (como gerente).

### 5.2 Telas com guard `if (!isGerente)` 

Como `isGerente` passara a ser `true` para developer tambem, as seguintes telas ja funcionarao automaticamente:
- `Partners.tsx` -- `if (!isGerente) return Navigate`
- `Users.tsx` -- `if (!isGerente) return Navigate`
- `Sponsors.tsx` -- `if (!isGerente) return Navigate`
- `Company.tsx` -- `if (!isGerente && !isOperador) return Navigate`
- `Sales.tsx` -- KPIs financeiros condicionados a `isGerente` e `canViewFinancials`

Nenhuma alteracao necessaria nessas telas.

### 5.3 Edge function `create-user`

A verificacao `isGerente` na edge function usa query direta ao banco. Precisamos ajustar:

```typescript
const isAuthorized = roles.some(
  (r: any) => r.role === 'gerente' || r.role === 'developer'
);
```

---

## 6. Funcao handle_new_user (trigger)

A trigger atual atribui `gerente` como role padrao para novos usuarios. Isso NAO deve ser alterado -- developer sera atribuido manualmente.

---

## Arquivos a modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/types/database.ts` | Adicionar `developer` ao tipo `UserRole` |
| `src/contexts/AuthContext.tsx` | Adicionar `isDeveloper`, ajustar `isGerente`/`canViewFinancials`, busca cross-company |
| `src/components/layout/AdminSidebar.tsx` | Adicionar `developer` ao tipo local, seletor de empresa exclusivo |
| `supabase/functions/create-user/index.ts` | Incluir `developer` na verificacao de permissao |

## Migracoes de banco

| Alteracao | Descricao |
|-----------|-----------|
| Enum `user_role` | Adicionar valor `developer` |
| Funcao `is_admin` | Incluir `developer` |
| Nova funcao `is_developer` | Verificacao de perfil developer |
| Funcao `user_belongs_to_company` | Bypass para developer |
| Policy em `companies` | Developer pode gerenciar todas |
| Policy em `partners` | Developer pode gerenciar |
| Policies em `profiles` | Developer pode ver/editar todos |

## O que NAO sera alterado

- Fluxo publico (cliente sem login)
- Logica de pagamento, QR Code ou webhook
- Comportamento dos perfis gerente, operador, vendedor, motorista
- Trigger `handle_new_user` (novos usuarios continuam como gerente)
- Nao sera criado selector de empresa para usuarios comuns

