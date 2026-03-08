

## Diagnóstico: Por que a lista de embarque está vazia

**Causa raiz encontrada: problema de permissão no banco de dados (RLS).**

A tabela `tickets` possui apenas duas policies RLS:
1. **"Admins can manage tickets"** — usa `is_admin()`, que aceita apenas `gerente`, `operador` e `developer`
2. **"Public can create tickets"** — apenas INSERT

O perfil `motorista` **não é admin** segundo a função `is_admin()`. Portanto, quando o motorista faz `SELECT` na tabela tickets, o banco retorna **array vazio** `[]` — exatamente o que os logs de rede confirmam.

O scanner QR funciona porque a RPC `validate_ticket_scan` é `SECURITY DEFINER`, ignorando RLS.

### Correção

**1. Adicionar policy RLS na tabela `tickets` para motoristas/ajudantes**

```sql
CREATE POLICY "Drivers can view tickets of their company"
ON public.tickets
FOR SELECT
TO authenticated
USING (user_belongs_to_company(auth.uid(), company_id));
```

Isso permite que qualquer usuário vinculado à empresa (incluindo motoristas) visualize os tickets. A função `user_belongs_to_company` já é usada em várias outras tabelas (trips, sales, boarding_locations, etc.) e garante o isolamento multi-tenant.

**Nenhuma alteração de código é necessária.** O front-end já está correto — a query em DriverBoarding e DriverHome retornará dados assim que a policy for aplicada.

### Arquivos alterados
- Apenas migração SQL (nova policy RLS)

