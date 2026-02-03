
# Plano de Correção: Vínculo Usuário-Empresa Ausente

## Diagnóstico

O erro `active_company_id ausente` ocorre porque:

1. **user_roles está vazia**: Não existe nenhum registro vinculando usuários a empresas
2. **Usuário existe**: `27add21e-ade9-436a-9ec2-185a3d7819cc` (edimarreginato@gmail.com)
3. **Empresa existe**: `a0000000-0000-0000-0000-000000000001` (Empresa Padrão)
4. **Falta o vínculo**: Sem registro em `user_roles`, o AuthContext não consegue determinar a empresa ativa

O fluxo do AuthContext está correto - ele busca em `user_roles`, mas como não há registros, retorna null.

---

## Solução

### Etapa 1: Criar vínculo do usuário existente com a empresa padrão

Inserir registro em `user_roles` com:
- `user_id`: ID do usuário atual
- `company_id`: ID da empresa padrão
- `role`: gerente (acesso total)
- `seller_id`: null (não é vendedor)

### Etapa 2: Ajustar trigger para novos usuários

Atualizar a função `handle_new_user()` para criar automaticamente um vínculo inicial quando um novo usuário se cadastrar, evitando esse problema no futuro.

---

## Detalhes Técnicos

**Migration SQL a ser criada:**

```sql
-- Inserir vínculo do usuário existente
INSERT INTO user_roles (user_id, company_id, role)
SELECT 
  p.id as user_id,
  'a0000000-0000-0000-0000-000000000001' as company_id,
  'gerente' as role
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id
);

-- Atualizar trigger para criar vínculo automático
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id UUID := 'a0000000-0000-0000-0000-000000000001';
BEGIN
  -- Criar perfil
  INSERT INTO public.profiles (id, name, email, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    v_company_id
  );

  -- Criar vínculo inicial como gerente na empresa padrão
  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (NEW.id, v_company_id, 'gerente')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
```

---

## Resultado Esperado

Após a correção:
1. Usuário terá vínculo com a empresa padrão
2. AuthContext carregará corretamente o `activeCompanyId`
3. Cadastro de veículos funcionará normalmente
4. Novos usuários terão vínculo criado automaticamente
