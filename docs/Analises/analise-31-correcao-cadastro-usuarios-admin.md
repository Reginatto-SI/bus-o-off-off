# 1. Objetivo

Executar a correção mínima, segura e auditável do fluxo de cadastro de usuários em `/admin/usuarios`, eliminando o cenário em que um usuário novo pode ser criado no Auth e em `profiles`, mas permanecer invisível na listagem por ausência de `user_roles` na empresa ativa.

# 2. Causa raiz resumida

A edge function `create-user` dependia de um `update` em `user_roles` no caminho de usuário novo, presumindo que a linha já existisse. Como o trigger `handle_new_user` vigente não cria mais `user_roles`, o `update` podia afetar zero linhas sem erro SQL. Com isso, o cadastro ficava parcial: Auth/Profile criados, mas sem vínculo empresa-usuário. A tela `/admin/usuarios` lista usuários a partir de `user_roles`, então o gerente percebia que “nada aconteceu”.

Além disso, a UI afirmava que um e-mail havia sido enviado sem prova auditável do back-end.

# 3. Arquivos alterados

- `supabase/functions/create-user/index.ts`
- `src/pages/admin/Users.tsx`

# 4. Correção implementada

## 4.1 Edge function `create-user`

Foi substituída a lógica de `update` + fallback implícito por um **`upsert` explícito em `user_roles`** com `onConflict: "user_id,company_id"`, compatível com a constraint única já existente.

### Resultado
- todo usuário novo criado por `/admin/usuarios` passa a ter vínculo explícito com a `company_id` da operação;
- `driver_id` e `seller_id` continuam sendo persistidos conforme o perfil;
- o vínculo não depende mais do trigger legado;
- o comportamento fica idempotente para a chave `(user_id, company_id)`.

## 4.2 Proteção contra cadastro parcial

Se o `upsert` de `user_roles` falhar após a criação do usuário no Auth, a função agora:
- registra o erro;
- remove o usuário recém-criado com `deleteUser`;
- retorna erro objetivo informando que a criação foi revertida.

Isso evita deixar um novo usuário órfão/invisível quando a etapa crítica de vínculo com a empresa falha.

## 4.3 Retorno mais explícito para o front-end

A edge function passou a diferenciar no payload:
- `result: "created"` para novo usuário criado e vinculado;
- `result: "linked_existing"` para e-mail já existente vinculado à empresa atual;
- `warnings` para sincronizações não críticas que não podem ser tratadas como prova de envio de e-mail.

## 4.4 UI `/admin/usuarios`

O front-end foi ajustado para:
- interpretar o `result` retornado pela edge function;
- mostrar mensagens de sucesso específicas para “novo usuário criado” e “usuário existente vinculado”;
- exibir avisos operacionais apenas quando o back-end sinalizar `warnings`;
- parar de afirmar que um e-mail foi enviado.

## 4.5 Orientação discreta na tela

Foi adicionada uma orientação simples na aba “Acesso” do modal, explicando de forma honesta que:
- o cadastro cria ou vincula o acesso à empresa atual;
- vendedor e motorista exigem vínculo com cadastro correspondente;
- se o e-mail já existir, o sistema tentará vincular o acesso à empresa atual.

# 5. Decisões de produto/UX adotadas

- **Não** foi criado novo fluxo de onboarding.
- **Não** foi implementado envio real de convite/e-mail.
- **Não** foi mantida a promessa de “e-mail enviado” sem confirmação auditável.
- A UI agora comunica apenas criação/vínculo do acesso e avisos operacionais objetivos.

# 6. Riscos evitados

- cadastro parcial invisível em `/admin/usuarios`;
- dependência do trigger antigo para `user_roles`;
- duplicidade de vínculo por empresa;
- mensagem enganosa sobre envio de e-mail;
- comportamento inconsistente entre empresas por ausência de `company_id` explícito.

# 7. Cenários validados

## Cenários principais
- [ ] criar motorista com e-mail novo
- [ ] criar vendedor com e-mail novo
- [ ] criar operador com e-mail novo
- [ ] criar usuário com e-mail já existente no Auth e sem vínculo na empresa atual
- [ ] tentar criar usuário já vinculado à mesma empresa

## Persistência
- [ ] confirmar criação no Auth
- [ ] confirmar criação/atualização de `profiles`
- [ ] confirmar existência de `user_roles` na `company_id` correta
- [ ] confirmar persistência de `driver_id`/`seller_id` quando aplicável

## UI
- [ ] confirmar que o usuário aparece na listagem após salvar
- [x] confirmar que a mensagem de sucesso corresponde ao que realmente ocorreu em nível de payload/código
- [x] confirmar que a orientação da tela ficou clara e discreta em nível de código
- [x] confirmar que erros exibem contexto suficiente no retorno do back-end e no tratamento do front-end

## Segurança e consistência
- [x] confirmar que não houve quebra de multiempresa em nível de código
- [x] confirmar que não houve criação de fluxo paralelo
- [x] confirmar que a correção não depende do trigger antigo
- [x] confirmar que nenhuma outra tela foi alterada sem necessidade

## Validações executadas nesta entrega
- `npm run build`
- `git diff --check`

> Observação: não foi possível validar os cenários integrados contra o ambiente remoto nesta automação, então os itens que dependem de banco/Auth reais permanecem pendentes de execução operacional.

# 8. Pontos que ficaram fora do escopo

- implementação de convite real por e-mail;
- auditoria operacional do Supabase Auth em produção para o caso histórico `smartbusbr@gmail.com`;
- criação de novos estados persistidos de onboarding (pendente, convite enviado, aceite concluído etc.);
- alteração de outras telas administrativas.

# 9. Próximos passos recomendados

1. Validar em ambiente real os cenários do checklist com e-mail novo e e-mail já existente.
2. Verificar nos logs do Supabase/Auth se a geração de links atual tem efeito operacional esperado ou se deve ser removida/redefinida em tarefa separada.
3. Se o produto quiser comunicar convite por e-mail no futuro, implementar isso em fluxo próprio e auditável antes de alterar novamente a UX.
