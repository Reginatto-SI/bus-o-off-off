

# Plano: Correcao definitiva do fluxo de criacao e listagem de usuarios

## Diagnostico confirmado

Investigacao dos dados em producao revelou **4 usuarios orfaos** (profiles sem nenhum registro em `user_roles`), todos criados nas ultimas horas. Isso confirma que o bug e real e ativo.

**Causa raiz**: o codigo no repositorio (`create-user/index.ts`) ja contem a correcao correta (upsert em `user_roles` + rollback se falhar), porem a **edge function deployada no runtime** provavelmente e uma versao anterior que nao faz o upsert corretamente. Os logs da edge function mostram apenas `shutdown`, sem evidencia de execucao da versao com `runtime_version`.

Em resumo: o codigo esta correto no repositorio, mas o runtime ainda roda uma versao antiga.

## Evidencias

```
Usuarios orfaos (profiles sem user_roles):
- homolog2.motorista.20260324000355@example.com  (role_count: 0)
- homolog2.vendedor.20260324000355@example.com   (role_count: 0)
- homolog2.gerente.20260324000355@example.com     (role_count: 0)
- homolog.gerente.20260323235139@example.com      (role_count: 0)
```

O restante do sistema (RLS, AuthContext, listagem em Users.tsx) esta correto:
- `user_roles` tem constraint `UNIQUE (user_id, company_id)` confirmada
- RLS de `user_roles` ja usa `user_belongs_to_company` com escopo por empresa
- `AuthContext` ja resolve empresa ativa via `user_roles` (nao `profiles.company_id`)
- `Users.tsx` ja lista via `user_roles.eq('company_id', activeCompanyId)`

## Acoes necessarias

### 1. Redeployar a edge function `create-user`

O codigo no repositorio ja esta correto. Precisa ser redeployado para que o runtime use a versao atual. Isso resolve o bug principal.

### 2. Limpar usuarios orfaos

Remover os 4 usuarios de teste/homologacao que ficaram sem vínculo (profiles + auth.users), via migration com `service_role`. Sao claramente usuarios de teste (emails `@example.com` e homologacao).

### 3. Pequeno ajuste defensivo no frontend

Adicionar um retry/verificacao pos-criacao no `Users.tsx`: apos `supabase.functions.invoke('create-user')`, antes de chamar `fetchUsers()`, verificar se o `user_id` retornado realmente tem um registro em `user_roles` para a empresa ativa. Se nao tiver, exibir erro claro ao inves de "sucesso" silencioso.

## Detalhes tecnicos

### Redeploy da edge function
A ferramenta `deploy_edge_functions` sera usada para forcar o deploy de `create-user`.

### Migration para limpeza de orfaos
```sql
-- Remover usuarios de homologacao orfaos (sem user_roles)
DELETE FROM public.profiles 
WHERE id IN (
  'c0b866ee-c6f8-48df-98d9-793a2ee3f975',
  '465b357c-9731-4b6f-a2e5-6711fd8651c0',
  '99a180e1-8a58-4b9e-bf54-99bdfc842c36',
  '8145f278-7eb8-4bc2