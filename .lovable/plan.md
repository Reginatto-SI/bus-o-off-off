

# Plano: Tela de Gestao de Usuarios (/admin/usuarios)

## Visao Geral

Criar uma nova tela administrativa para criacao e gerenciamento de usuarios do sistema, seguindo exatamente o padrao visual e comportamental da tela piloto /admin/frota, incluindo obrigatoriamente o modal com abas.

---

## Parte 1: Alteracoes no Banco de Dados

### 1.1 Adicionar Role 'motorista' ao Enum

```sql
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'motorista';
```

### 1.2 Adicionar Coluna driver_id na Tabela user_roles

Para permitir vinculo de usuarios com role motorista aos cadastros de motoristas:

```sql
ALTER TABLE public.user_roles 
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.user_roles.driver_id IS 'Vinculo com cadastro de motorista (quando role = motorista)';
```

### 1.3 Adicionar Coluna status na Tabela profiles

```sql
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo';

COMMENT ON COLUMN public.profiles.status IS 'Status do usuario: ativo ou inativo';
```

### 1.4 Adicionar Coluna notes na Tabela profiles

```sql
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.profiles.notes IS 'Observacoes internas sobre o usuario';
```

### 1.5 Atualizar RLS Policies para profiles

Permitir que gerentes gerenciem usuarios:

```sql
-- Gerentes podem visualizar todos os perfis da empresa
CREATE POLICY "Gerentes can view company profiles"
  ON public.profiles FOR SELECT
  USING (
    has_role(auth.uid(), 'gerente'::user_role) AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = profiles.id
        AND ur.company_id IN (
          SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
        )
    )
  );

-- Gerentes podem atualizar perfis da empresa
CREATE POLICY "Gerentes can update company profiles"
  ON public.profiles FOR UPDATE
  USING (has_role(auth.uid(), 'gerente'::user_role))
  WITH CHECK (has_role(auth.uid(), 'gerente'::user_role));
```

---

## Parte 2: Atualizacao de Tipos TypeScript

### Arquivo: src/types/database.ts

```typescript
// Adicionar 'motorista' ao tipo UserRole
export type UserRole = 'gerente' | 'operador' | 'vendedor' | 'motorista';

// Atualizar interface Profile
export interface Profile {
  id: string;
  name: string;
  email: string;
  status: 'ativo' | 'inativo'; // NOVO
  notes: string | null;        // NOVO
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

// Atualizar interface UserRoleRecord
export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  seller_id: string | null;
  driver_id: string | null;    // NOVO
  company_id: string;
}

// Interface auxiliar para tela de usuarios
export interface UserWithRole extends Profile {
  role?: UserRole;
  seller_id?: string | null;
  driver_id?: string | null;
  seller?: Seller | null;
  driver?: Driver | null;
}
```

---

## Parte 3: Estrutura da Nova Tela

### 3.1 Cabecalho (PageHeader)

Identico ao padrao da frota:

```text
+------------------------------------------------------------------+
| Usuarios                            [Excel] [PDF] [+ Adicionar]  |
| Gerencie os usuarios do sistema                                  |
+------------------------------------------------------------------+
```

### 3.2 Cards de Indicadores (StatsCards)

| Card | Label | Icone | Variante |
|------|-------|-------|----------|
| 1 | Total de usuarios | Users | default |
| 2 | Usuarios ativos | CheckCircle | success |
| 3 | Usuarios inativos | XCircle | destructive |
| 4 | Gerentes | Shield | default |
| 5 | Operadores | Settings | default |
| 6 | Vendedores | UserCheck | default |
| 7 | Motoristas | Car | default |

Layout: grid de 4 colunas no desktop

### 3.3 Card de Filtros (FilterCard)

**Filtros Simples:**
- Campo de busca: pesquisar por nome ou email
- Select de status: Todos / Ativo / Inativo
- Select de role: Todos / Gerente / Operador / Vendedor / Motorista
- Botao "Limpar"

### 3.4 Tabela de Listagem

Colunas:

| Coluna | Conteudo |
|--------|----------|
| Nome | user.name (font-medium) |
| E-mail | user.email + icone Mail |
| Role | Badge colorido por role |
| Vinculo | Nome do vendedor/motorista ou "-" |
| Status | StatusBadge ativo/inativo |
| Acoes | ActionsDropdown |

### 3.5 Menu de Acoes (ActionsDropdown)

| Acao | Icone | Comportamento |
|------|-------|---------------|
| Editar | Pencil | Abre modal de edicao |
| Ativar/Desativar | Power | Alterna status |

---

## Parte 4: Modal de Cadastro/Edicao (OBRIGATORIO COM ABAS)

Seguindo exatamente o padrao do modal da tela /admin/frota:

### Estrutura do Modal

```text
+------------------------------------------------------------------+
| Novo Usuario / Editar Usuario                              [X]   |
+------------------------------------------------------------------+
| [Acesso] [Vinculos] [Observacoes]                                 |
+------------------------------------------------------------------+
| [Conteudo da aba ativa com scroll interno]                       |
|                                                                  |
|                                                                  |
+------------------------------------------------------------------+
| [Cancelar]                                    [Salvar]           |
+------------------------------------------------------------------+
```

### Aba 1 - Acesso

| Campo | Tipo | Obrigatorio | Observacao |
|-------|------|-------------|------------|
| Nome | text | Sim | Nome completo |
| E-mail | email | Sim | Unico no sistema |
| Role | select | Sim | gerente/operador/vendedor/motorista |
| Status | select | Sim | ativo/inativo |

### Aba 2 - Vinculos (Dinamica por Role)

**Se role = vendedor:**
```text
+--------------------------------------------------+
| Vincular Vendedor                                |
+--------------------------------------------------+
| [Select: Selecione um vendedor v]                |
| Lista de vendedores ativos da empresa            |
+--------------------------------------------------+
| [+ Criar vendedor e vincular]                    |
| Abre modal de vendedores em segundo plano        |
+--------------------------------------------------+
```

**Se role = motorista:**
```text
+--------------------------------------------------+
| Vincular Motorista                               |
+--------------------------------------------------+
| [Select: Selecione um motorista v]               |
| Lista de motoristas ativos da empresa            |
+--------------------------------------------------+
| [+ Criar motorista e vincular]                   |
| Abre modal de motoristas em segundo plano        |
+--------------------------------------------------+
```

**Se role = gerente ou operador:**
```text
+--------------------------------------------------+
| Nenhum vinculo necessario                        |
| Este perfil nao requer vinculo com cadastros.    |
+--------------------------------------------------+
```

### Aba 3 - Observacoes

| Campo | Tipo | Obrigatorio |
|-------|------|-------------|
| Observacoes | textarea | Nao |

---

## Parte 5: Logica de Criacao de Usuario

### Fluxo de Criacao (Novo Usuario)

1. Gerente preenche modal
2. Ao salvar:
   - Criar usuario no Supabase Auth (email + senha temporaria)
   - Profile e criado automaticamente pelo trigger `handle_new_user`
   - Atualizar profile com status e notes
   - Criar/atualizar user_roles com role, seller_id, driver_id
3. Usuario recebe email de confirmacao

### Consideracao Importante

Para criar usuarios via Supabase Auth, sera necessario:
- Usar Supabase Admin API (service_role key) via Edge Function
- OU solicitar que o proprio usuario faca signup e depois o gerente ajuste a role

**Recomendacao para MVP:** Usar Edge Function para criacao controlada.

---

## Parte 6: Restricao de Acesso

### Sidebar

O item "Usuarios" sera adicionado no grupo "Configuracoes" com restricao:

```typescript
{
  name: 'Usuarios',
  href: '/admin/usuarios',
  icon: UsersIcon,
  roles: ['gerente'],  // Somente gerentes
}
```

### Na Pagina

```typescript
// No inicio do componente
const { isGerente } = useAuth();

// Guard de acesso
if (!isGerente) {
  return <Navigate to="/admin/eventos" replace />;
}
```

---

## Parte 7: Configuracao de Exportacao

### Colunas para Excel/PDF

```typescript
const exportColumns: ExportColumn[] = [
  { key: 'name', label: 'Nome' },
  { key: 'email', label: 'E-mail' },
  { key: 'role', label: 'Perfil', format: (v) => formatRole(v) },
  { key: 'vinculo', label: 'Vinculo' },
  { key: 'status', label: 'Status', format: (v) => v === 'ativo' ? 'Ativo' : 'Inativo' },
  { key: 'notes', label: 'Observacoes' },
];
```

---

## Parte 8: Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| Migracao SQL | Adicionar motorista ao enum, driver_id, status e notes |
| `src/types/database.ts` | Atualizar tipos |
| `src/pages/admin/Users.tsx` | Criar nova pagina |
| `src/components/layout/AdminSidebar.tsx` | Adicionar item de menu |
| `src/App.tsx` | Adicionar rota /admin/usuarios |
| `supabase/functions/create-user/index.ts` | Edge function para criar usuarios (opcional MVP) |

---

## Parte 9: Estados Especiais

### Estado Vazio (sem usuarios)

```text
[Icone Users]
Nenhum usuario cadastrado
Adicione usuarios para gerenciar acessos ao sistema
[+ Adicionar Usuario]
```

### Estado Vazio (filtro sem resultados)

```text
[Icone Users]
Nenhum usuario encontrado
Ajuste os filtros para encontrar usuarios
[Limpar filtros]
```

---

## Parte 10: Detalhes do Modal com Abas

### Classes CSS do Modal (seguindo Fleet.tsx)

```jsx
<DialogContent className="admin-modal flex h-[90vh] max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 p-0">
  <DialogHeader className="admin-modal__header px-6 py-4">
    ...
  </DialogHeader>
  <form className="flex h-full flex-col">
    <Tabs defaultValue="acesso" className="flex h-full flex-col">
      <TabsList className="admin-modal__tabs flex h-auto w-full flex-wrap justify-start gap-1 px-6 py-2">
        <TabsTrigger value="acesso">
          <Key className="h-4 w-4" /> Acesso
        </TabsTrigger>
        <TabsTrigger value="vinculos">
          <Link className="h-4 w-4" /> Vinculos
        </TabsTrigger>
        <TabsTrigger value="observacoes">
          <FileText className="h-4 w-4" /> Observacoes
        </TabsTrigger>
      </TabsList>
      <div className="admin-modal__body flex-1 overflow-y-auto px-6 py-4">
        <TabsContent value="acesso">...</TabsContent>
        <TabsContent value="vinculos">...</TabsContent>
        <TabsContent value="observacoes">...</TabsContent>
      </div>
    </Tabs>
    <div className="admin-modal__footer px-6 py-4">
      <Button variant="outline">Cancelar</Button>
      <Button type="submit">Salvar</Button>
    </div>
  </form>
</DialogContent>
```

---

## Parte 11: Formatacao de Role

Funcao auxiliar para exibir roles com cores:

```typescript
const roleConfig: Record<UserRole, { label: string; color: string }> = {
  gerente: { label: 'Gerente', color: 'bg-purple-100 text-purple-800' },
  operador: { label: 'Operador', color: 'bg-blue-100 text-blue-800' },
  vendedor: { label: 'Vendedor', color: 'bg-green-100 text-green-800' },
  motorista: { label: 'Motorista', color: 'bg-orange-100 text-orange-800' },
};
```

---

## Ordem de Implementacao

1. Executar migracao SQL (enum, colunas, RLS)
2. Atualizar tipos TypeScript
3. Adicionar item no sidebar (restrito a gerente)
4. Adicionar rota no App.tsx
5. Criar pagina Users.tsx seguindo estrutura da Fleet.tsx
6. Implementar modal com 3 abas
7. Implementar logica de CRUD
8. Implementar exportacao Excel/PDF
9. Testar restricao de acesso
10. Testar fluxo completo

---

## Resultado Esperado

1. Tela visualmente identica ao padrao /admin/frota
2. Modal obrigatoriamente com abas (Acesso, Vinculos, Observacoes)
3. Restricao de acesso somente para gerentes
4. CRUD completo de usuarios
5. Vinculacao dinamica para vendedores e motoristas
6. Exportacao Excel e PDF funcionais
7. KPIs e filtros padronizados

