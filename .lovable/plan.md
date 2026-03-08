

## Plano: Renomear "Parceiros" → "Sócios da Plataforma"

Alteração puramente de nomenclatura/textos em 3 arquivos + rota. Sem mudança de lógica.

### 1. `src/App.tsx`
- Rota `/admin/parceiros` → `/admin/socios`
- Adicionar redirect `/admin/parceiros` → `/admin/socios` para links antigos

### 2. `src/components/layout/AdminSidebar.tsx`
- `name: 'Parceiros'` → `name: 'Sócios'`
- `href: '/admin/parceiros'` → `href: '/admin/socios'`

### 3. `src/pages/admin/Partners.tsx`
Textos a atualizar:
- Título: "Parceiros" → "Sócios da Plataforma"
- Descrição: atualizar para texto sobre divisão de receita da comissão
- Toast erro: "parceiros" → "sócios"
- Empty state: "Nenhum parceiro cadastrado" → "Nenhum sócio cadastrado"
- Empty state descrição: atualizar para contexto de divisão de comissão
- Modal título: "Novo/Editar Parceiro" → "Novo/Editar Sócio"
- Placeholder nome: "Nome do parceiro" → "Nome do sócio"
- Descrição Stripe: atualizar para mencionar participação na comissão
- Descrição Split: atualizar para "Percentual da comissão da plataforma repassado ao sócio"
- Redirect guard comentário: atualizar
- Botão: "Novo Parceiro" → "Novo Sócio"

