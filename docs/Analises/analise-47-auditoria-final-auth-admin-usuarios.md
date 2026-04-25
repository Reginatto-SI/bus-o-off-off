# Auditoria final — suporte auth em `/admin/usuarios`

## 1. Resumo executivo
- **Status:** implementação **parcialmente aprovada**.
- **Risco crítico encontrado:** configuração da função `admin-user-auth-support` estava com `verify_jwt = false`, enquanto a função apenas decodificava `sub` manualmente do JWT (sem validação criptográfica). Isso permitia risco real de forja de token.
- **Ação crítica aplicada nesta auditoria:** ajuste de configuração para `verify_jwt = true`.
- **Recomendação final:** após esse ajuste, a base de segurança fica adequada para aprovação, com uma inconsistência não-crítica de UX/permissão do perfil `developer` no frontend.

---

## 2. Validação da Edge Function
- A função lê o header `Authorization`, extrai o token e decodifica `sub` manualmente (`decodeJwtSub`).
- Em seguida valida permissões via `user_roles` (`gerente`/`developer`) e escopo por `company_id`.
- Também bloqueia operação em alvo fora da empresa (`target_user_id` + `company_id` em `user_roles`).

### Conclusão
- A **autorização por role e escopo multiempresa** está correta.
- O ponto fraco era a **autenticação do token** quando `verify_jwt` estava desativado.

---

## 3. Análise do `verify_jwt`
- Configuração encontrada inicialmente: `verify_jwt = false` para `admin-user-auth-support`.
- Com essa configuração, a validação de assinatura/expiração do JWT não era garantida no gateway da função.
- Como a função apenas lia `sub` do payload Base64, havia brecha de spoofing.

### Conclusão
- Para esta função, o correto é **`verify_jwt = true`**.
- **Correção crítica já aplicada** nesta auditoria para eliminar o risco.

---

## 4. Validação do perfil `developer`
### Backend
- `developer` está permitido e operacional (role check explícito na função).

### Frontend
- A rota `/admin/usuarios` continua com gate `if (!isGerente) redirect`, então `developer` não acessa a tela.
- No menu lateral, “Usuários” também está restrito a `gerente`.

### Conclusão
- `developer` está **permitido no backend**, mas **bloqueado na UI**.
- Comportamento atual é inconsistente entre backend e frontend, porém não é falha crítica de segurança.

---

## 5. Auditoria do magic link
- O link não aparece em toast de sucesso/erro (apenas mensagens textuais genéricas).
- A função não registra `action_link` nos logs (`console.error` loga erro/contexto, não o link em sucesso).
- O frontend exibe o link apenas em modal dedicado e cópia explícita por botão.

### Conclusão
- Não foi encontrada exposição indevida crítica no fluxo atual.
- O risco operacional residual é humano (compartilhamento inadequado pelo operador), já mitigado por aviso no modal.

---

## 6. Auditoria do status auth
- Fonte de dados:
  - `auth.users` via `supabaseAdmin.auth.admin.getUserById` (dados reais de confirmação e último login).
  - `email_send_log` para último evento de e-mail.
- Não há fallback inventado para “confirmado/último login”; quando ausente, a UI informa indisponível.

### Conclusão
- O status auth usa fontes reais e confiáveis.
- Limitação: “último evento de e-mail” depende de haver registro em `email_send_log` no ambiente.

---

## 7. Inconsistências encontradas
1. **Crítica (corrigida):** `verify_jwt = false` vs necessidade de validação forte de JWT.
2. **Não-crítica:** backend permite `developer`, frontend bloqueia `developer` em `/admin/usuarios` e no menu.

---

## 8. Correções críticas necessárias antes da aprovação
- ✅ **Aplicada nesta auditoria:** alterar `admin-user-auth-support` para `verify_jwt = true`.
- Não foram encontradas outras correções críticas obrigatórias.

---

## 9. Conclusão final
- **Posso aprovar agora?** Sim, **com a correção crítica aplicada** de `verify_jwt`.
- **Preciso pedir ajuste antes?** Apenas se você quiser consistência de operação do perfil `developer` também no frontend (não-crítico).
- **Ajustes obrigatórios:** nenhum adicional crítico após o `verify_jwt = true`.
- **Ajustes de melhoria futura:** alinhar política de acesso do `developer` entre backend e UI/menu de `/admin/usuarios`.
