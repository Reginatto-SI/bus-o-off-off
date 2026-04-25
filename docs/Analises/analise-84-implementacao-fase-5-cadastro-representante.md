# Implementação Fase 5 — Cadastro público do representante

## 1. O que foi implementado
Foi implementada a porta pública de entrada do representante com cadastro simplificado e ativação imediata do painel:
- nova rota pública dedicada para captação comercial;
- formulário mínimo (nome, e-mail, telefone, senha);
- nova edge function backend para criar usuário autenticado + registro em `representatives` no mesmo fluxo;
- rollback do usuário de auth quando o registro em `representatives` falha, evitando estado “meio criado”;
- auto login após cadastro e redirecionamento para `/representante/painel`.

## 2. Qual rota pública foi criada
Rota criada: `/seja-representante`.

Escolha:
- curta;
- clara para uso comercial;
- consistente com URLs públicas já usadas no projeto (`/cadastro`, `/eventos`, etc.);
- separa semanticamente o onboarding de representante do onboarding de empresa, sem criar auth paralelo.

## 3. Quais campos entram no formulário
Campos do MVP implementado:
- nome;
- e-mail;
- telefone;
- senha.

Não foi incluído CPF/CNPJ neste passo para manter baixo atrito e seguir escopo mínimo seguro da fase.

## 4. Como o usuário é criado
Fluxo resumido:
1. frontend envia payload para `register-representative`;
2. backend valida campos essenciais e formato de e-mail/senha;
3. backend valida duplicidade de e-mail via `auth.admin.listUsers`;
4. backend cria usuário em `auth.users` com `email_confirm: true`;
5. frontend executa login com `signInWithPassword` no fluxo de auth já existente.

## 5. Como o registro em representatives é criado
Após criar usuário de auth:
1. backend insere em `public.representatives` com `user_id`, nome, e-mail, telefone e status ativo;
2. se a criação do representante falhar, backend remove o usuário auth recém-criado (`deleteUser`) para não deixar inconsistência;
3. backend atualiza `profiles` (nome/telefone) para manter consistência de sessão e UX.

## 6. Como o representative_code é garantido
A garantia permanece no backend do banco (sem geração no frontend):
- trigger `trg_ensure_representative_code_and_link` em `public.representatives`;
- função `ensure_representative_code_and_link` gera/normaliza `representative_code`;
- função também padroniza `referral_link` oficial (`/cadastro?representative_code=...`).

Ou seja, esta fase reaproveita a garantia já existente e não cria lógica paralela.

## 7. Como o acesso ao painel foi resolvido
Após cadastro:
- frontend tenta login automático com e-mail/senha recém-criados;
- em sucesso, redireciona para `/representante/painel`;
- o `AuthContext` já identifica representante por `representatives.user_id`, então não foi necessária mudança estrutural de auth.

Fallback:
- se login automático falhar, usuário recebe mensagem clara e é enviado para `/login`.

## 8. Como foram tratados erros e mensagens
Mensagens implementadas para cenários principais:
- campos obrigatórios ausentes;
- e-mail inválido;
- senha curta;
- e-mail já existente;
- erro na criação do usuário;
- erro na criação do representante;
- sucesso com login automático;
- sucesso sem login automático (orientação para login manual).

Linguagem adotada: direta, comercial e não técnica.

## 9. O que ficou fora do escopo
Conforme restrições da fase, não foi implementado:
- aprovação manual;
- mudanças de split;
- mudanças no checkout;
- payout;
- CRUD administrativo completo de representantes;
- onboarding complexo multi-etapas;
- refatoração geral de auth.

## 10. Riscos residuais
- A checagem de e-mail duplicado por `listUsers` é simples e consistente com fluxo de empresa, mas pode ser otimizada no futuro para cenários de altíssimo volume.
- Não foi adicionada coleta de CPF/CNPJ neste MVP para preservar baixo atrito comercial.

## 11. Próximo passo recomendado
Próxima etapa segura: criar trilha leve de qualificação do representante no próprio painel (ex.: checklist de wallet e materiais de divulgação), sem alterar núcleo financeiro nem auth.
