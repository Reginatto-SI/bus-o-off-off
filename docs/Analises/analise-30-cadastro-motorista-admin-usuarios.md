# 1. Objetivo da análise

Realizar uma investigação técnica completa, profunda e auditável do fluxo de cadastro de usuário do tipo **motorista** na tela **`/admin/usuarios`**, com foco no caso relatado para o e-mail **`smartbusbr@gmail.com`**, sem assumir comportamento não comprovado.

Esta análise cobre:
- front-end da tela `/admin/usuarios`;
- criação de usuário via edge function `create-user`;
- persistência em `profiles`, `user_roles` e vínculo com `drivers`;
- impacto multiempresa com `company_id`;
- fluxo real de onboarding/e-mail;
- divergência entre o que a UI comunica e o que o back-end realmente faz;
- risco de falhas silenciosas e cadastros parciais.

> **Importante:** não foi possível validar logs remotos nem consultar o banco/serviços em tempo real porque a tentativa de acesso externo ao projeto Supabase falhou no ambiente desta investigação com erro de rede `ENETUNREACH`. Portanto, os achados abaixo se dividem entre **confirmado em código** e **inconclusivo em produção**.

---

# 2. Caso real analisado

- **E-mail usado:** `smartbusbr@gmail.com`
- **Perfil:** `motorista`
- **Tela:** `/admin/usuarios`
- **Comportamento relatado:**
  - o usuário tentou cadastrar;
  - percebeu que “nada aconteceu”;
  - o motorista não apareceu na listagem;
  - o usuário não recebeu e-mail.

## Status da comprovação do caso específico

### Confirmado
- Existe um fluxo de criação de usuário na tela `/admin/usuarios` que chama a edge function `create-user`.
- Para o perfil `motorista`, o front exige seleção de um `driver_id` antes de enviar.
- A listagem da tela depende exclusivamente da existência de um registro em `user_roles` para a `activeCompanyId`.
- O fluxo de criação de **novo usuário** tem uma falha estrutural confirmada em código: para usuários novos, a edge function **não garante a criação do registro em `user_roles`** na empresa alvo.
- Sem `user_roles`, o usuário não aparece na listagem de `/admin/usuarios`, mesmo que exista `profile` e até conta no Auth.
- A UI sempre mostra sucesso com a mensagem **“Usuário criado! Um e-mail de confirmação foi enviado.”**, embora o back-end não tenha evidência explícita de envio real de e-mail.

### Sugerido pelo código, mas não comprovado no ambiente remoto
- O caso de `smartbusbr@gmail.com` é compatível exatamente com um cadastro parcial: criação no Auth e/ou `profiles`, sem `user_roles` válido na empresa ativa.
- O caso também é compatível com ausência de e-mail porque o fluxo usa `generateLink` mas não há integração explícita de envio de e-mail no repositório.

### Inconclusivo sem acesso remoto/logs
- Se a tentativa com `smartbusbr@gmail.com` realmente foi submetida em produção.
- Se a edge function foi de fato chamada naquele caso específico.
- Se o e-mail já existia previamente no Auth.
- Se houve criação parcial no Auth para esse e-mail específico.
- Se houve erro operacional em runtime diferente da falha estrutural identificada no código.

---

# 3. Fluxo atual identificado

## 3.1. Fluxo front-end em `/admin/usuarios`

1. O gerente abre a tela `/admin/usuarios`.
2. A tela carrega usuários consultando `user_roles` filtrado por `activeCompanyId`.
3. Para cada `user_role` retornado, a tela busca o `profile` correspondente em `profiles`.
4. Para perfis `vendedor` e `motorista`, a tela também resolve os vínculos em `sellers` e `drivers`.
5. Ao clicar em **Adicionar Usuário**, o modal abre com abas de:
   - Acesso
   - Vínculos
   - Observações
6. O formulário exige:
   - `name`
   - `email`
   - `role`
   - `status`
   - e, se `role = motorista`, exige `driver_id`.
7. No submit:
   - o front valida nome, e-mail e formato do e-mail;
   - se `motorista`, valida que existe `driver_id` selecionado;
   - se for criação, chama `supabase.functions.invoke('create-user')`.
8. Se a edge function retornar sem erro, o front executa `fetchUsers()` novamente.
9. Depois disso, o front mostra o toast fixo: **“Usuário criado! Um e-mail de confirmação foi enviado.”**.
10. A listagem exibida após o refresh depende de o novo usuário estar presente em `user_roles` com `company_id = activeCompanyId`.

## 3.2. Fluxo back-end para criação de novo usuário

A edge function `create-user` faz o seguinte:

1. Lê o token do usuário solicitante.
2. Busca seus papéis em `user_roles`.
3. Permite a operação apenas para `gerente` ou `developer`.
4. Valida `email`, `name`, `role` e `company_id`.
5. Verifica se a empresa informada pertence ao solicitante.
6. Faz `auth.admin.listUsers()` e procura o e-mail informado.

### Caminho A — se o e-mail já existir no Auth

1. Busca se já existe `user_roles` para aquele `user_id` e aquela `company_id`.
2. Se já existir, retorna erro: **“Usuário já existe nesta empresa”**.
3. Se não existir, faz `insert` em `user_roles` com:
   - `user_id`
   - `company_id`
   - `role`
   - `driver_id` ou `seller_id`, quando aplicável.
4. Retorna sucesso como “Usuário existente vinculado à empresa”.

### Caminho B — se o e-mail não existir no Auth

1. Gera senha temporária aleatória.
2. Cria o usuário no Auth com `auth.admin.createUser`.
3. Aguarda 500 ms.
4. Atualiza `profiles` com `name`, `status`, `notes` e `company_id`.
5. Tenta **atualizar** `user_roles` filtrando por `user_id` e `company_id`.
6. Só tenta fazer `insert` em `user_roles` se o `update` devolver **erro**.
7. Depois chama `auth.admin.generateLink` com `type: 'recovery'`.
8. Depois chama `auth.admin.generateLink` com `type: 'magiclink'`.
9. Retorna sucesso.

## 3.3. Fluxo real do trigger `handle_new_user`

Hoje, o trigger `handle_new_user` vigente cria apenas o `profile` do novo usuário.

Ele **não** cria mais o `user_role` automaticamente.

Isso é decisivo para o diagnóstico, porque a edge function `create-user` ainda está escrita como se o trigger criasse ou pudesse já ter criado o registro em `user_roles`.

---

# 4. Evidências técnicas encontradas

## 4.1. Tela `/admin/usuarios`

### Arquivo principal
- `src/pages/admin/Users.tsx`

### Evidências
- A listagem usa `user_roles` filtrado por `activeCompanyId` como fonte primária.
- Os `profiles` só são carregados depois de obter os `user_ids` vindos de `user_roles`.
- Se não houver `user_roles` para a empresa ativa, o usuário simplesmente não entra na tela.
- O formulário exige vínculo `driver_id` para `motorista`.
- O submit chama a edge function `create-user`.
- Em caso de sucesso, a UI mostra mensagem fixa dizendo que um e-mail de confirmação foi enviado.
- Não há texto visível no modal explicando o fluxo de convite, senha, aceite ou pendência.

## 4.2. Edge function de criação

### Arquivo principal
- `supabase/functions/create-user/index.ts`

### Evidências
- A função consulta `user_roles` do solicitante para autorização.
- Para usuário existente, ela faz `insert` explícito em `user_roles`.
- Para usuário novo, ela faz `createUser` no Auth e depois apenas `update` em `user_roles`, presumindo que já exista linha para a empresa.
- O fallback de `insert` só roda se `roleUpdateError` existir.
- Um `update` que não encontra linha normalmente devolve `0 rows affected`, mas **não necessariamente devolve erro**.
- Portanto, é possível — e pelo código, estruturalmente provável — que o usuário novo fique sem `user_roles`.
- A função chama `generateLink` para `recovery` e `magiclink`, mas descarta o retorno e não integra com nenhum mecanismo explícito de envio de e-mail no repositório.
- O log interno chama `resetError` de “Error sending reset email”, mas isso é apenas nomenclatura do código; não comprova que houve disparo real.

## 4.3. Trigger / persistência base

### Arquivos relevantes
- `supabase/migrations/20260203004351_19291536-5319-45f6-abb4-d7118a84f483.sql`
- `supabase/migrations/20260302000000_add_profiles_company_id.sql`

### Evidências
- Em uma migração anterior, o trigger `handle_new_user` criava `profiles` **e** `user_roles` na empresa padrão.
- Em migração posterior, o trigger foi redefinido para criar apenas `profiles` com `company_id` default/fallback.
- A edge function `create-user` não foi ajustada para essa mudança estrutural.
- Há, portanto, uma divergência objetiva entre o comportamento atual do trigger e a expectativa codificada na edge function.

## 4.4. Multiempresa

### Evidências
- A tela lista usuários pela `activeCompanyId` do contexto autenticado.
- O submit envia `company_id: activeCompanyId` para a edge function.
- O fluxo correto exige que o `user_roles` do novo usuário seja persistido exatamente nessa empresa.
- Se o `profile` for atualizado, mas `user_roles` não for criado para a empresa ativa, o usuário fica invisível na tela, ainda que tenha conta no Auth ou `profile` persistido.

## 4.5. Políticas RLS e visibilidade

### Arquivos relevantes
- `supabase/migrations/20260206012325_3c3f6d6c-e326-4ef6-8575-dd037a88ad7c.sql`
- `supabase/migrations/20260215111959_2d862364-369b-4902-9b32-ca9022498951.sql`
- `supabase/migrations/20260302000000_add_profiles_company_id.sql`

### Evidências
- `profiles` possui políticas para gerente visualizar/atualizar perfis da empresa, desde que exista relação via `user_roles`.
- `user_roles` é gerenciado por gerente/developer.
- Como a edge function usa service role, ela contorna RLS para escrita; portanto, o gargalo identificado **não é RLS** na gravação do cadastro novo.
- A invisibilidade na listagem decorre do fato de a tela depender de `user_roles` já persistido na empresa ativa.

## 4.6. Tentativa de validação remota do caso real

Foi tentada autenticação programática no projeto Supabase usando as credenciais fornecidas para consultar o estado remoto do caso real.

### Resultado
- Falha de rede no ambiente de investigação: `TypeError: fetch failed` com causa `ENETUNREACH`.

### Conclusão
- Não foi possível confirmar remotamente:
  - se `smartbusbr@gmail.com` já existe no Auth;
  - se já existe em `profiles`;
  - se ficou sem `user_roles`;
  - se houve chamada real da edge function no momento do incidente.

---

# 5. Causa raiz

## Causa raiz principal confirmada

**O fluxo de criação de novo usuário em `create-user` está estruturalmente quebrado para o cenário de usuário novo porque ele depende de um `user_roles` que o trigger atual não cria mais.**

### Mecanismo exato da falha

1. O usuário novo é criado no Auth.
2. O trigger atual cria `profiles`, mas não cria `user_roles`.
3. A edge function tenta `update` em `user_roles` para `(user_id, company_id)`.
4. Como a linha não existe, o `update` não grava nada.
5. Como não houve erro SQL explícito, o fallback de `insert` não roda.
6. O usuário fica sem vínculo em `user_roles` para a empresa.
7. A tela `/admin/usuarios` busca a listagem a partir de `user_roles` da empresa ativa.
8. Resultado: o usuário **não aparece na tela**, apesar de o fluxo poder ter retornado sucesso.

## Causa raiz secundária confirmada

**A comunicação de sucesso da interface está incorreta ou, no mínimo, não auditável.**

A UI sempre afirma que um e-mail de confirmação foi enviado, porém:
- o fluxo não usa `inviteUserByEmail`;
- o repositório não mostra integração explícita de envio de e-mail transacional;
- o retorno de `generateLink` é descartado;
- não existe persistência/auditoria do disparo;
- não existe estado visual de “convite enviado”, “pendente de aceite” ou “aguardando definição de senha”.

Logo, a interface promete um efeito que o código atual não comprova.

---

# 6. Problemas secundários encontrados

1. **Erro funcional silencioso no cadastro novo**
   - O fluxo pode retornar sucesso sem criar `user_roles`.

2. **Listagem dependente de `user_roles` sem proteção contra cadastro parcial**
   - Se o usuário ficar só em `profiles`/Auth, some da tela.

3. **Toast potencialmente enganoso**
   - A mensagem afirma envio de e-mail sem trilha auditável correspondente.

4. **Ausência de explicação no modal**
   - O usuário não é informado sobre:
     - como acessará o sistema;
     - se criará senha por e-mail;
     - se depende de aceite;
     - se o status aparecerá pendente;
     - o que acontece quando o e-mail já existe.

5. **Código desatualizado em relação ao trigger**
   - Comentários e estratégia da edge function ficaram incompatíveis com a migração mais nova.

6. **Risco de cadastro órfão/parcial**
   - Novo usuário pode ficar criado no Auth e em `profiles`, mas sem papel/vínculo operacional.

7. **Tratamento incompleto para e-mail já existente em escopo global**
   - A detecção usa `auth.admin.listUsers()` e procura o e-mail em memória.
   - Sem inspeção remota não foi possível validar paginação/escopo em produção, então essa parte merece auditoria adicional se a base crescer.

8. **Ausência de status operacional de onboarding**
   - Não há estado persistido que diferencie “acesso criado”, “convite enviado”, “convite aceito”, “senha definida”.

---

# 7. Impacto funcional

## Quem é afetado

### Confirmado
- O problema estrutural atinge **qualquer novo usuário** criado pelo caminho de “usuário novo” na edge function `create-user`, não apenas motoristas.
- O impacto em motorista fica mais visível porque existe expectativa operacional de vínculo com `drivers` e acesso ao app do motorista.

### Afeta apenas motorista?
- **Não.** O defeito principal está no fluxo genérico de criação de usuário novo.
- Porém, em `motorista`, o problema ganha impacto operacional maior porque o usuário espera ver vínculo com motorista e receber acesso.

### Afeta usuários já existentes no Auth?
- **Tende a não afetar da mesma forma**, porque nesse caminho a função faz `insert` explícito em `user_roles` quando o e-mail já existe e ainda não está vinculado à empresa.

### Afeta algumas empresas?
- O defeito é estrutural e independe da empresa, desde que o fluxo use `create-user` para usuário novo.
- Em contexto multiempresa, o sintoma sempre será “não aparece na empresa ativa” quando faltar `user_roles` daquela empresa.

### Produção ou sandbox?
- Pelo código, afeta qualquer ambiente em que a versão atual do trigger e da edge function esteja implantada simultaneamente.
- Sem acesso remoto, não foi possível comprovar em quais ambientes essa combinação já está em vigor.

### Há risco de registros órfãos?
- **Sim.** Há risco real de:
  - usuário criado no Auth;
  - `profile` criado/atualizado;
  - ausência de `user_roles`;
  - ausência de visibilidade/administração posterior pela tela.

---

# 8. Risco de negócio / operação

1. O gerente acredita que cadastrou o usuário, mas ele não aparece na tela.
2. O motorista não recebe instrução confiável para entrar no sistema.
3. O suporte pode precisar agir manualmente no Auth ou no banco.
4. Cadastros parciais reduzem auditabilidade e confiança operacional.
5. Em multiempresa, a ausência de `user_roles` torna impossível confirmar por interface se o vínculo foi criado na empresa correta.
6. A mensagem de sucesso incorreta pode levar o time a procurar problema no spam/lixeira quando o e-mail talvez nunca tenha sido disparado.
7. A inconsistência entre UI e back-end dificulta treinamento, suporte e documentação operacional.

---

# 9. Plano de correção mínima

## 9.1. Correção mínima segura recomendada

### Correção 1 — obrigatória
Ajustar `supabase/functions/create-user/index.ts` para, no caminho de **usuário novo**, fazer **`upsert` explícito em `user_roles`** com conflito em `(user_id, company_id)` em vez de depender de `update` presumindo linha prévia.

**Objetivo:** garantir que todo usuário novo criado fique vinculado à empresa e apareça na listagem de `/admin/usuarios`.

### Correção 2 — obrigatória
Remover ou ajustar o toast de sucesso em `src/pages/admin/Users.tsx` para não afirmar envio de e-mail sem confirmação auditável do back-end.

**Objetivo:** alinhar a UI ao comportamento real.

### Correção 3 — recomendada
Fazer a edge function retornar um payload explícito sobre onboarding, por exemplo:
- `user_created: true/false`
- `role_linked: true/false`
- `email_delivery_status: 'not_sent' | 'requested' | 'unknown'`
- `message`

**Objetivo:** permitir uma mensagem honesta e rastreável no front-end.

## 9.2. Correção de e-mail / onboarding

Aqui há duas possibilidades, mas a escolha depende de confirmação de produto e capacidade de runtime:

### Opção A — manter comportamento atual e comunicar corretamente
- Não prometer e-mail automático enquanto não houver prova técnica/auditoria do disparo.
- Exibir mensagem clara de que o acesso foi criado/vinculado, mas que o envio de credenciais depende do fluxo definido pela operação.

### Opção B — implementar convite real
- Substituir o mecanismo atual por um fluxo oficial e auditável de convite/reset com confirmação explícita de disparo.
- Essa opção exige validação do produto e de configuração do Auth, então **não recomendo implementar sem validar em ambiente real**.

## 9.3. Arquivos candidatos a alteração

Se a correção for executada:
- `supabase/functions/create-user/index.ts`
- `src/pages/admin/Users.tsx`

## 9.4. Risco da alteração

### Baixo risco
- trocar `update` por `upsert` explícito em `user_roles` no caminho de usuário novo.

### Médio risco
- alterar o fluxo de e-mail/onboarding sem validação do ambiente real.

## 9.5. Como validar sem quebrar outros perfis

1. Criar `operador` com e-mail novo.
2. Criar `motorista` com e-mail novo e `driver_id` válido.
3. Criar `vendedor` com e-mail novo e `seller_id` válido.
4. Criar usuário com e-mail já existente no Auth, em empresa ainda não vinculada.
5. Criar usuário com e-mail já vinculado à mesma empresa.
6. Confirmar que todos aparecem na listagem da empresa ativa.
7. Confirmar que o vínculo `driver_id`/`seller_id` persiste corretamente.
8. Confirmar que a mensagem exibida na UI corresponde exatamente ao que ocorreu.

---

# 10. Ajuste de UX recomendado

## Diagnóstico de UX atual

Hoje a tela **não orienta corretamente** o usuário final sobre o processo pós-cadastro. Ela não explica:
- se o acesso será enviado por e-mail;
- se a senha será criada depois;
- se o usuário entra imediatamente;
- se existe aceite pendente;
- o que acontece quando o e-mail já existe.

Além disso, o toast atual afirma algo que o fluxo não comprova com segurança.

## Texto recomendado para a tela

O texto final depende da decisão de produto sobre o onboarding. Considerando **o fluxo comprovado hoje**, a recomendação mínima segura é **não prometer envio automático de e-mail**.

### Texto sugerido antes do envio

> **Atenção:** este cadastro cria ou vincula o acesso do usuário à empresa selecionada. Para perfis de motorista e vendedor, o vínculo com o cadastro correspondente é obrigatório. Se o e-mail informado já existir, o sistema tentará apenas vincular o acesso à empresa atual.

### Texto sugerido após correção do vínculo e antes de confirmar o fluxo de e-mail

> **Importante:** confirme com a operação qual é o procedimento de primeiro acesso do usuário. Não informe ao usuário que um e-mail foi enviado enquanto esse disparo não estiver validado tecnicamente.

## Se o produto optar por convite real auditável

Só depois de validar o envio real, a tela poderia usar algo como:

> Ao salvar, o usuário receberá um e-mail para definir o acesso. Se o e-mail já existir, o sistema vinculará o usuário à empresa atual sem criar uma nova conta.

Neste momento, esse texto **não deve** ser adotado como fato sem corrigir e validar o back-end de e-mail.

---

# 11. Dúvidas em aberto

1. O e-mail `smartbusbr@gmail.com` já existia no Auth antes da tentativa?
2. Houve criação parcial desse usuário no Auth?
3. Existe registro em `profiles` para esse e-mail?
4. Existe `user_roles` para esse usuário em outra empresa, mas não na empresa ativa do gerente?
5. A edge function `create-user` atualmente implantada em produção corresponde exatamente ao código deste repositório?
6. O método `auth.admin.generateLink` no ambiente implantado está configurado para disparar e-mail automaticamente ou apenas gerar links? O código não prova isso.
7. Há logs da edge function para a tentativa com `smartbusbr@gmail.com`?
8. Há logs de Auth indicando criação, convite, recovery ou erro de duplicidade para esse e-mail?

---

# 12. Checklist de validação

## Fluxo funcional
- [ ] Criar motorista com e-mail novo.
- [ ] Confirmar criação de conta no Auth.
- [ ] Confirmar criação/atualização de `profile`.
- [ ] Confirmar criação de `user_roles` com `company_id` correto.
- [ ] Confirmar persistência de `driver_id` no `user_roles`.
- [ ] Confirmar que o usuário aparece imediatamente em `/admin/usuarios`.
- [ ] Confirmar que o vínculo exibido na coluna “Vínculo” corresponde ao motorista selecionado.

## Multiempresa
- [ ] Criar usuário em empresa A e confirmar que aparece em A.
- [ ] Trocar para empresa B e confirmar que não aparece indevidamente em B.
- [ ] Vincular e-mail já existente à empresa B e confirmar visibilidade apenas onde houver `user_roles`.

## Tratamento de erro
- [ ] Tentar criar usuário com e-mail já vinculado à mesma empresa e validar mensagem clara.
- [ ] Tentar criar motorista sem `driver_id` e validar bloqueio no front-end.
- [ ] Simular falha na edge function e validar toast com mensagem técnica suficiente.

## Onboarding / UX
- [ ] Validar se a tela explica corretamente o que acontece após salvar.
- [ ] Validar se a mensagem de sucesso corresponde ao comportamento real do back-end.
- [ ] Validar se o sistema diferencia “usuário criado”, “usuário vinculado” e “e-mail enviado”.
- [ ] Validar se o suporte consegue auditar o resultado sem consultar dados manualmente.

---

# Respostas objetivas às perguntas obrigatórias

## A. Fluxo atual

### Qual é o fluxo real de cadastro de motorista hoje?
- O gerente preenche nome, e-mail, perfil `motorista`, status e vínculo `driver_id`.
- O front chama `create-user` com `company_id` da empresa ativa.
- Se o e-mail já existir, a função tenta criar apenas o vínculo em `user_roles`.
- Se o e-mail não existir, a função cria o usuário no Auth, atualiza o `profile`, tenta atualizar `user_roles` e retorna sucesso.
- A tela só exibe o usuário se existir `user_roles` da empresa ativa.

### Quais etapas acontecem do clique em “salvar” até o usuário aparecer na tela?
- Validação front-end.
- Chamada da edge function.
- Persistência esperada no Auth + `profiles` + `user_roles`.
- Recarregamento da listagem via `fetchUsers()`.
- Exibição condicionada à presença em `user_roles` da empresa ativa.

## B. Causa do problema

### Por que o usuário percebeu que “nada aconteceu”?
Porque o fluxo pode retornar sucesso sem criar `user_roles`; nesse cenário o cadastro novo não entra na listagem. Além disso, o sistema promete e-mail sem comprovação de envio, reforçando a percepção de falha total.

### Onde está o problema?
- **Principal:** back-end/edge function `create-user`.
- **Secundário:** comunicação incorreta da UI.
- **Consequência visível:** listagem da tela `/admin/usuarios`.
- **Não há evidência principal de RLS como causa raiz** nesse caso.

## C. Impacto

### Isso afeta só motorista?
Não. Afeta qualquer usuário novo criado por `/admin/usuarios`.

### Afeta qualquer usuário criado em `/admin/usuarios`?
Afeta o caminho de **usuário novo**. O caminho de **e-mail já existente** tende a funcionar melhor porque faz `insert` explícito em `user_roles`.

### Afeta só algumas empresas?
Não há evidência de restrição por empresa. O defeito é estrutural.

### Afeta só produção ou também sandbox?
Afeta qualquer ambiente com esta combinação de código/migrações implantada.

### Existe risco de registros órfãos ou cadastros incompletos?
Sim, risco real de Auth + `profiles` sem `user_roles`.

## D. Comunicação da interface

### A tela hoje orienta corretamente o usuário sobre o que vai acontecer?
Não.

### O processo de criação de senha está claro?
Não.

### O sistema deveria mostrar instruções antes do envio?
Sim.

### O sistema deveria mostrar confirmação explícita depois do envio?
Sim, mas apenas com base em um retorno auditável do back-end.

### O sistema deveria avisar quando o e-mail já existir?
Sim, de forma explícita e sem ambiguidade, distinguindo:
- “usuário já vinculado à empresa”;
- “usuário existente vinculado com sucesso”;
- “novo usuário criado”.

## E. Correção mínima recomendada

### Qual é a menor correção segura?
- Garantir `upsert` explícito de `user_roles` no caminho de usuário novo.
- Ajustar a mensagem da UI para não afirmar envio de e-mail sem confirmação auditável.

### Quais arquivos devem ser alterados?
- `supabase/functions/create-user/index.ts`
- `src/pages/admin/Users.tsx`

### Qual o risco da alteração?
- Baixo para o vínculo em `user_roles`.
- Médio para qualquer mudança no onboarding/e-mail.

### Como validar sem quebrar os demais perfis?
- Executando o checklist acima para gerente, operador, vendedor e motorista, com e-mail novo e e-mail já existente, sempre conferindo `company_id` e visibilidade na listagem.
