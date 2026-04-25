# 1. Resumo do ajuste

Foi aplicado endurecimento de autorização na RPC `public.correct_sale_passenger` para exigir não apenas autenticação + pertencimento à empresa, mas também perfil administrativo autorizado.

# 2. Risco que existia antes

Antes, um usuário autenticado vinculado à empresa podia passar pelo guard principal, mesmo sem perfil administrativo, dependendo do contexto de uso da função.

# 3. Padrão de permissão encontrado no projeto

O padrão já consolidado no banco para ações administrativas é o uso de:
- `public.is_admin(_user_id)`
- `public.user_belongs_to_company(_user_id, _company_id)`

No projeto, `is_admin` cobre os perfis:
- `gerente`
- `operador`
- `developer`

# 4. Estratégia aplicada

Mudança mínima e direta:
- foi mantida toda a lógica transacional da RPC;
- foi adicionado `IF NOT public.is_admin(v_user_id) THEN RAISE EXCEPTION ...`;
- a checagem acontece no backend, dentro da operação sensível.

# 5. Arquivos alterados

- `supabase/migrations/20260328170000_add_role_guard_to_correct_sale_passenger.sql`
- `analise-5-role-guard-rpc-correcao-passageiro.md`

# 6. Perfis autorizados

Via `public.is_admin`, permanecem autorizados:
- gerente
- operador
- developer

# 7. Limitações remanescentes

- A UX do frontend permanece igual e depende da mensagem de erro da RPC para feedback de acesso negado.
- Como é hardening de backend, não houve alteração de interface para esconder botão por role nesta etapa.

# 8. Conclusão objetiva

A RPC continua sendo a operação única e transacional, com multiempresa preservada, mas agora com blindagem adicional de perfil autorizado no backend.
