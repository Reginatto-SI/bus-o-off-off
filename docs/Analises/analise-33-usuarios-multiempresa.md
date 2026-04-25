## 1. Resumo executivo

A investigação confirmou que a tela `/admin/usuarios` usa `user_roles` como fonte primária da listagem, filtrando pelo `activeCompanyId` resolvido no `AuthContext`. Portanto, o frontend atual **não está montando uma lista “global” por engano**; ele exibe os usuários que efetivamente possuem vínculo em `user_roles` com a empresa ativa. O problema grave observado decorre de duas camadas diferentes: **(a)** um fluxo legado de criação que inseria todo usuário novo como `gerente` na empresa padrão/teste e **(b)** uma divergência entre o código corrigido localmente e o comportamento homologado/remoto, que ainda continuava gravando usuários novos na empresa padrão, fazendo cadastros “sumirem” da empresa alvo e aparecerem na empresa errada. Em paralelo, a auditoria de segurança encontrou uma falha independente de RLS em `user_roles`: hoje um gerente autenticado tem política ampla demais para consultar/gerenciar vínculos de qualquer empresa, o que viola a diretriz multiempresa do projeto. O quadro geral é de **alta gravidade**, porque mistura contaminação histórica de dados, criação potencialmente inconsistente e isolamento de segurança incompleto.

## 2. Sintomas confirmados

- A rota `/admin/usuarios` existe e é acessível no menu Administração apenas para contexto de gerente via `UsersPage`, dentro do layout administrativo padrão. 
- A listagem da tela é construída a partir de `user_roles.company_id = activeCompanyId`; depois o código busca os `profiles` apenas dos `user_id` retornados por esse primeiro passo. Isso confirma que a tela depende de vínculo empresa-usuário para exibir alguém. 
- Se um usuário existir no Auth e em `profiles`, mas **não** tiver `user_roles` na empresa ativa, ele “some” da tela. 
- Houve um fluxo legado explícito que criava automaticamente `user_roles` como `gerente` na empresa padrão `a0000000-0000-0000-0000-000000000001` para qualquer novo usuário criado no Auth. 
- O trigger mais novo deixou de criar `user_roles`, mas continuou preenchendo `profiles.company_id` com a empresa padrão quando ela existir. Ou seja: o repositório mostra histórico de comportamento legado residual e contraditório. 
- A homologação anterior já registrada no repositório confirmou, em ambiente remoto, que novos usuários estavam sendo criados com `profile.company_id` e `user_roles.company_id` na empresa padrão, não na empresa solicitada; por isso não apareciam na empresa correta. 
- O fluxo “usuário existente no Auth, mas ainda sem vínculo na empresa atual” funciona de modo diferente: ele insere novo `user_roles` explicitamente na empresa solicitada. 
- A política RLS de `user_roles` continua ampla demais: `Admins can view all user_roles` usa `is_admin(auth.uid())` sem escopo de `company_id`, e `Gerente and developer can manage user_roles` também não restringe por empresa. 
- O campo visual “Vínculo” da tela não vem de `profiles`; ele é derivado de `seller_id`/`driver_id` armazenados em `user_roles` e resolvidos depois via `sellers`/`drivers`. 
- Há um fluxo paralelo/legado confirmado: criação de conta de empresa via `register-company` ainda remove o vínculo padrão criado por trigger e reinsere o gerente na empresa nova, o que prova que o sistema foi desenhado em torno desse legado da empresa padrão.

## 3. Fluxo atual da tela `/admin/usuarios`

1. A rota `/admin/usuarios` aponta para `UsersPage` em `src/App.tsx`, e o item do menu “Usuários” no sidebar também referencia essa rota. 
2. `UsersPage` usa `useAuth()` para obter `isGerente`, `activeCompanyId`, `activeCompany` e `user`. Se `isGerente` for falso, a tela redireciona para `/admin/eventos`. 
3. Ao montar ou trocar `activeCompanyId`, a página chama `fetchUsers()` e `fetchSellersAndDrivers()`. 
4. `fetchUsers()` consulta `user_roles` com filtro obrigatório `.eq('company_id', activeCompanyId)`, retornando `id`, `user_id`, `role`, `seller_id`, `driver_id` e `company_id`. 
5. Com a lista de `user_id` retornada do passo anterior, a página consulta `profiles` usando `.in('id', userIds)`. Ou seja: `profiles` entra como tabela complementar, não como origem primária. 
6. Se existirem `seller_id` ou `driver_id` nos vínculos, a página consulta `sellers` e `drivers` pelos IDs encontrados para montar o texto de “Vínculo”. 
7. O array final da tela é montado em memória combinando `role`/`seller_id`/`driver_id` de `user_roles` com `name`/`email`/`status`/`notes` de `profiles`. O `company_id` que o frontend preserva no objeto final vem de `profile.company_id`, não de `user_roles.company_id`, mas isso não altera quem entra na lista porque a porta de entrada já foi `user_roles`. 
8. `fetchSellersAndDrivers()` carrega apenas vendedores e motoristas ativos da empresa ativa para alimentar os selects do modal. 
9. Ao criar um usuário, o formulário valida nome, e-mail e, quando aplicável, exige `seller_id` para vendedor ou `driver_id` para motorista. 
10. No fluxo de criação, o frontend chama a edge function `create-user`, enviando `company_id: activeCompanyId`, `role`, `status`, `notes`, `seller_id` e `driver_id`. 
11. No fluxo de edição, o frontend atualiza `profiles` e `user_roles` separadamente; a role e os vínculos operacionais ficam em `user_roles`, enquanto nome/status/notas ficam em `profiles`. 
12. O papel/perfil exibido vem diretamente do campo `role` retornado de `user_roles`. 
13. O “Vínculo” exibido segue a regra: se `role = vendedor`, mostra `seller.name`; se `role = motorista`, mostra `driver.name`; para gerente, operador e developer, mostra `-`. 
14. A empresa ativa é resolvida no `AuthContext` com prioridade `localStorage -> profiles.company_id -> primeira empresa disponível`, usando a lista de empresas derivada de `user_roles`. Para developer, o contexto permite selecionar qualquer empresa ativa. 

## 4. Fonte real da listagem

A fonte real de verdade da listagem é a tabela `public.user_roles`, não `profiles`.

### Como a tela monta os dados

- Primeiro, a tela lê `user_roles` filtrado por `company_id = activeCompanyId`. 
- Depois, ela busca `profiles` apenas dos usuários retornados nesse conjunto. 
- Em seguida, faz resolução opcional de `seller_id` e `driver_id` consultando `sellers` e `drivers`. 

### Respostas objetivas às hipóteses solicitadas

- **Usa `profiles`?** Sim, mas apenas como fonte complementar de dados cadastrais. 
- **Usa `user_roles`?** Sim, e esta é a fonte primária da listagem. 
- **Usa join entre múltiplas tabelas?** Não no SQL; o “join” é feito no frontend em múltiplas chamadas separadas. 
- **Usa tabela legada?** Indiretamente, sim: o comportamento histórico da empresa padrão influencia os registros presentes em `user_roles` e `profiles`. 
- **Usa dados sem `company_id`?** A listagem depende explicitamente de `user_roles.company_id`. O `profile.company_id` não decide a presença na tabela, apenas é carregado junto no objeto final. 
- **Usa relação indireta por `seller_id` ou `driver_id`?** Apenas para preencher o campo “Vínculo”; isso não altera o escopo da listagem. 
- **Existe fallback perigoso que amplia resultados?** Na tela `/admin/usuarios`, não há `or`, `left join` ou fallback de consulta que amplie o conjunto retornado. O risco de ampliação está no banco/RLS e no legado de criação, não no filtro da tela. 

### Por que aparecem usuários “indevidos” na empresa visualizada

Os usuários “indevidos” não aparecem por erro de renderização da tela; eles aparecem porque **há evidência de que receberam ou mantiveram `user_roles` nessa empresa**, especialmente na empresa padrão/teste. A migração legada de fevereiro inseriu `user_roles` como `gerente` na empresa padrão para todo `profile` sem vínculo, e o trigger então passou a repetir essa lógica para novos usuários. Quando o ambiente remoto ainda executa esse comportamento legado, qualquer usuário novo acaba “pertencendo” formalmente à empresa padrão, mesmo que o cadastro tenha sido feito a partir de outra empresa. É isso que explica o print com gerentes inesperados em uma empresa de teste: a tela está lendo `user_roles` contaminado, não inventando usuários. 

## 5. Fluxo real de criação de usuário

### Fluxo atual em código local

1. O modal da tela envia o payload para a edge function `create-user`. 
2. A function valida o JWT do solicitante, consulta `user_roles` via service role e só autoriza `gerente` ou `developer`. 
3. O payload é validado (`email`, `name`, `role`, `company_id`). 
4. Se o solicitante não for developer, a function garante que o `company_id` enviado esteja entre as empresas do solicitante. 
5. A function faz `auth.admin.listUsers()` para verificar se o e-mail já existe no Auth. 
6. **Se o usuário já existir no Auth:** verifica se já há `user_roles` para `(user_id, company_id)`; se não houver, faz `insert` explícito em `user_roles` com `role`, `seller_id` ou `driver_id`. 
7. **Se o usuário não existir no Auth:** cria o usuário no Auth, espera o trigger de `handle_new_user`, atualiza `profiles` com `name`, `status`, `notes` e `company_id`, e depois faz `upsert` explícito em `user_roles` com conflito em `(user_id, company_id)`. 
8. Se o `upsert` em `user_roles` falhar, a function reverte o usuário recém-criado usando `auth.admin.deleteUser`, justamente para impedir cadastro parcial invisível. 
9. Ao final, a function ainda gera links de `recovery` e `magiclink`, mas trata falhas nisso apenas como `warnings`, não como prova auditável de envio de e-mail. 

### Fluxo legado/histórico identificado no repositório

1. Inicialmente, `handle_new_user` criava apenas `profiles`. 
2. Depois, a migração de 2026-02-03 mudou o trigger para criar `profiles` **e** `user_roles` como `gerente` na empresa padrão. 
3. Mais tarde, a migração de 2026-03-02 redefiniu o trigger novamente para criar somente `profiles`, mas ainda com `company_id` default na empresa padrão. 
4. Esse histórico mostra que a criação de usuário passou por fluxos divergentes e que o sistema ficou por um tempo dependente do trigger para criar vínculo empresa-usuário. 

### O que a homologação já registrada provou em ambiente remoto

O relatório `analise-32-homologacao-cadastro-usuarios-admin.md` demonstrou que, no ambiente homologado daquela data, novos usuários criados como motorista, vendedor e operador continuavam recebendo `profile.company_id` e `user_roles.company_id` na empresa padrão, com payload remoto antigo (`"Usuário criado com sucesso"`), sem refletir o código local corrigido. Isso prova que havia divergência entre o repositório e o runtime efetivo, mantendo ativo o fluxo quebrado/legado justamente no caminho “usuário novo”. 

### Diferença entre gerente, vendedor, motorista e outros perfis

- `gerente`, `operador` e `developer` não exigem vínculo operacional extra. 
- `vendedor` exige `seller_id`. 
- `motorista` exige `driver_id`. 
- O armazenamento do perfil de acesso fica em `user_roles.role`; o vínculo operacional também fica em `user_roles`, não em `profiles`. 

## 6. Auditoria de multiempresa e `company_id`

### Onde o isolamento está correto

- A diretriz oficial do projeto exige que toda lógica considere `company_id` e proíbe mistura entre empresas. 
- A tela `/admin/usuarios` filtra `user_roles` por `activeCompanyId`, o que está alinhado com a regra multiempresa. 
- `sellers` e `drivers` usados no modal também são carregados com `.eq('company_id', activeCompanyId)`. 
- A edge function local valida `company_id` contra as empresas do solicitante, impedindo que um gerente crie usuários em empresa arbitrária. 
- A constraint única `(user_id, company_id)` em `user_roles` está coerente com o modelo “mesmo usuário pode existir em mais de uma empresa, mas com um vínculo por empresa”. 

### Onde o isolamento está quebrado ou frágil

- O trigger legado de 2026-02-03 colocava todo novo usuário na empresa padrão como `gerente`, independentemente da empresa de origem. Isso é violação frontal de multiempresa. 
- O trigger atual ainda nasce com viés da empresa padrão em `profiles.company_id`, o que mantém legado operacional e pode confundir resolução de empresa ativa e auditoria de dados. 
- O `AuthContext` usa `profiles.company_id` como uma das fontes para escolher a empresa ativa. Se esse campo estiver contaminado pela empresa padrão, o contexto pode abrir a sessão inicialmente em uma empresa diferente da esperada. 
- O relatório de homologação já existente confirmou exatamente esse efeito: novos usuários foram gravados na empresa padrão e, por isso, não apareceram na empresa em que estavam sendo cadastrados. 
- O `register-company` ainda contém código para apagar o vínculo padrão criado pelo trigger e recriar o papel na empresa nova. Isso mostra dependência operacional de um fluxo legado que nunca foi totalmente extinto. 

### Conclusão desta auditoria

O problema principal **não é a query da tela ignorar `company_id`**. O problema é que a camada de criação e o legado do trigger produziram `company_id` errado, especialmente apontando para a empresa padrão/teste. Quando isso acontece:

- na empresa correta, o usuário “some” porque não há `user_roles` ali; 
- na empresa padrão/teste, o usuário aparece “indevidamente” porque o vínculo foi gravado lá. 

## 7. Auditoria de RLS e segurança

### Tabelas consultadas pela tela

- `user_roles` 
- `profiles` 
- `sellers` 
- `drivers` 
- `companies` indiretamente, via `AuthContext` 

### Policies e helpers relevantes encontrados

- `is_admin(_user_id)` começou sem `company_id` e depois passou a incluir `developer`, continuando sem escopo de empresa. 
- `user_belongs_to_company(_user_id, _company_id)` foi criado com escopo de empresa, mas depois recebeu bypass total para developer. 
- `profiles` já teve policy totalmente aberta para leitura (`USING (true)`), depois ganhou policy para gerente ver perfis da mesma empresa, depois ganhou policy para developer ver todos os perfis, e por fim passou a ter também `Users can view own profile`. 
- `user_roles` possui `Admins can view all user_roles`, baseada em `is_admin(auth.uid()) OR user_id = auth.uid()`, e `Gerente and developer can manage user_roles`, ambas sem restringir `company_id`. 

### Riscos confirmados

1. **RLS de `user_roles` está quebrada para multiempresa.** Um gerente autenticado atende `is_admin(auth.uid())`, então a policy atual permite que ele consulte todos os `user_roles`, não apenas os da própria empresa. 
2. **A policy de gestão de `user_roles` também é ampla demais.** Um gerente pode potencialmente alterar vínculos fora da própria empresa porque a `WITH CHECK` e a `USING` não exigem `user_belongs_to_company(auth.uid(), company_id)`. 
3. **Developer tem bypass total por desenho.** Isso pode ser aceitável como regra de produto, mas precisa ser assumido conscientemente; hoje esse bypass também impacta `companies`, `profiles` e `user_belongs_to_company`. 
4. **O helper `get_user_active_company` é legado e perigoso** porque retorna apenas a primeira empresa de `user_roles`, sem considerar empresa ativa escolhida no frontend. Ele não aparece no fluxo da tela `/admin/usuarios`, mas representa padrão conceitualmente frágil. 
5. **`profiles.company_id` não é fonte de verdade**, mas continua sendo usado como pista para empresa ativa e como dado exibido no frontend; isso aumenta o risco de interpretações erradas quando ele diverge de `user_roles`. 

### Veredito de segurança

A tela em si filtra por `activeCompanyId`, mas a segurança do banco **não garante o mesmo rigor**. Há um bug de RLS independente da listagem visual: `user_roles` ainda não está isolada por empresa para gerente. Isso não explica sozinho o print analisado, mas agrava o problema e precisa entrar na correção mínima.

## 8. Fluxos legados ou paralelos encontrados

1. **Trigger legado `handle_new_user` com empresa padrão e role gerente.** Foi introduzido para criar vínculo automático em `user_roles` na empresa padrão. 
2. **Trigger atual ainda preso à empresa padrão em `profiles.company_id`.** O vínculo automático em `user_roles` saiu, mas a empresa padrão continuou como fallback prioritário para `profiles`. 
3. **`register-company` ainda limpa o vínculo padrão criado pelo trigger.** Isso mostra que o cadastro de empresa foi desenhado esperando esse legado e corrige depois, em vez de evitar a criação errada na origem. 
4. **Fluxo “usuário novo” x fluxo “usuário já existente”.** São dois caminhos com comportamentos historicamente diferentes; o primeiro foi o que mais quebrou multiempresa. 
5. **Payload remoto antigo documentado na homologação.** O ambiente homologado ainda respondia com mensagem antiga, indicando edge function antiga/deploy desatualizado ou runtime ainda com fluxo paralelo quebrado. 
6. **Uso simultâneo de `profiles.company_id` e `user_roles.company_id`.** O próprio comentário da migração de março diz que `profiles.company_id` não deveria ser fonte de verdade, mas o app continua usando esse campo para resolver contexto. 
7. **Usuário developer forçado por ID fixo no frontend.** Esse tratamento especial em `AuthContext` cria um fluxo excepcional fora do padrão geral de RBAC e precisa ser considerado em qualquer diagnóstico de empresa ativa. 

## 9. Causa raiz

### Causa raiz principal

A causa raiz principal é a combinação de **legado de criação na empresa padrão** com **divergência entre fluxo corrigido localmente e runtime homologado/remoto**.

Em termos práticos:

- o legado inseria automaticamente novos usuários como `gerente` na empresa padrão/teste; 
- o trigger posterior ainda preservou a empresa padrão em `profiles.company_id`; 
- a tela `/admin/usuarios` lista pela empresa do vínculo em `user_roles`; 
- logo, quando o vínculo é criado na empresa errada, o usuário some da empresa correta e aparece na empresa padrão. 

### Causas secundárias

1. **RLS de `user_roles` ampla demais.** Não causou diretamente o print, mas torna o isolamento multiempresa insuficiente e permite acesso/manipulação cross-company por gerente. 
2. **`profiles.company_id` usado como pista de contexto.** Isso aumenta ambiguidade e pode selecionar empresa ativa contaminada. 
3. **Fluxo paralelo para usuário já existente x usuário novo.** O caminho de usuário já existente cria vínculo explicitamente; o de usuário novo dependeu historicamente de trigger/fallbacks, o que gerou inconsistência. 
4. **Dependência operacional da empresa padrão.** O repositório contém múltiplos pontos que assumem sua existência, o que entra em choque com a diretriz “não criar fluxos paralelos desnecessários”. 

### Resposta objetiva à pergunta “é criação, leitura ou ambos?”

- **Leitura/listagem:** a query da tela não é a causa primária; ela reflete `user_roles` da empresa ativa. 
- **Criação:** sim, é parte central do problema. 
- **Vínculo:** sim, é o coração do bug. 
- **Segurança/RLS:** sim, existe bug adicional relevante. 
- **Conclusão:** é uma combinação de criação + vínculo + segurança, com sintoma visual aparecendo na leitura. 

## 10. Correção mínima proposta

Sem redesenhar a arquitetura, a menor correção segura e consistente é:

1. **Garantir que o runtime publicado use a versão corrigida de `create-user`.** O código local já faz `upsert` explícito em `user_roles` para `(user_id, company_id)` e rollback em caso de falha. Antes de qualquer refatoração, isso precisa estar efetivamente implantado no ambiente que reproduz o bug. 
2. **Encerrar o legado da empresa padrão no fluxo de criação.** O trigger `handle_new_user` não deve mais atribuir empresa padrão como comportamento automático quando o contexto real da empresa vem depois por edge function. Se o produto precisar manter `profiles` mínimo no signup genérico, isso deve ocorrer sem contaminar empresa/vínculo operacional. 
3. **Restringir RLS de `user_roles` por empresa.** Substituir as policies atuais por versões que usem `user_belongs_to_company(auth.uid(), company_id)` para gerente e reservem o bypass total apenas a developer, se essa continuar sendo a regra oficial. 
4. **Parar de usar `profiles.company_id` como critério prioritário de empresa ativa quando houver `user_roles` válidos.** A empresa ativa deve derivar do conjunto de vínculos reais, não de um campo auxiliar que historicamente recebeu fallback legado. 
5. **Executar saneamento de dados contaminados.** Depois de corrigir criação e RLS, será necessário identificar usuários cujo único vínculo foi criado indevidamente na empresa padrão e realocar/remover esses vínculos com critério auditável. Sem isso, a tela continuará exibindo usuários “indevidos” por causa do passivo histórico. 

## 11. Arquivos que devem ser alterados

- `supabase/functions/create-user/index.ts` — confirmar/publicar a versão com `upsert` explícito em `user_roles`, rollback de cadastro parcial e retorno auditável; este é o ponto central do fluxo de criação de usuário novo. 
- `supabase/migrations/...` nova migration de RLS para `public.user_roles` — necessária para substituir as policies amplas atuais por regras com escopo de `company_id`. 
- `supabase/migrations/...` nova migration para revisar `handle_new_user` — necessária para remover o acoplamento com a empresa padrão no signup e eliminar o legado que contamina `profiles.company_id` e, historicamente, `user_roles`. 
- `src/contexts/AuthContext.tsx` — necessário para deixar a resolução de empresa ativa baseada prioritariamente em vínculos reais e não em `profiles.company_id` contaminável. 
- `supabase/functions/register-company/index.ts` — necessário apenas para remover a compensação do legado do vínculo padrão, caso o trigger seja saneado na origem. 
- Script/migration operacional de saneamento de dados — necessário para corrigir registros já poluídos na empresa padrão/teste. 

## 12. Riscos da correção

- **Risco de expor passivo histórico oculto.** Ao corrigir criação e RLS, inconsistências antigas na empresa padrão podem ficar mais evidentes e exigir saneamento controlado. 
- **Risco de quebrar onboarding de cadastro de empresa** se o trigger legado for removido sem ajustar `register-company` em conjunto. 
- **Risco de alterar comportamento do developer cross-company.** Se o bypass for mantido, a nova RLS precisa preservar esse caso de forma intencional; se não for mantido, pode haver impacto em suporte/administração. 
- **Risco operacional de migração de dados.** Remover vínculos incorretos na empresa padrão sem mapa confiável de origem pode afetar usuários legítimos daquela empresa. 
- **Risco de regressão no contexto ativo do usuário.** Ajustar `AuthContext` pode alterar qual empresa abre por padrão para alguns usuários; isso exige validação manual. 

## 13. Checklist de validação pós-correção

- [ ] Criar gerente novo em uma empresa não padrão e confirmar `user_roles.company_id` correto. 
- [ ] Criar vendedor novo em uma empresa não padrão e confirmar `user_roles.company_id` correto. 
- [ ] Criar motorista novo em uma empresa não padrão e confirmar `user_roles.company_id` correto. 
- [ ] Confirmar que gerente, vendedor e motorista recém-criados aparecem imediatamente na listagem da própria empresa. 
- [ ] Confirmar que `seller_id` é persistido corretamente quando `role = vendedor`. 
- [ ] Confirmar que `driver_id` é persistido corretamente quando `role = motorista`. 
- [ ] Confirmar que um usuário novo **não** recebe vínculo automático na empresa padrão/teste sem intenção explícita. 
- [ ] Confirmar que a listagem de `/admin/usuarios` em uma empresa A não mostra usuários sem `user_roles` em A. 
- [ ] Confirmar que uma empresa B não visualiza usuários exclusivos da empresa A. 
- [ ] Confirmar que um gerente não consegue consultar nem manipular `user_roles` de empresa alheia via API/Supabase. 
- [ ] Confirmar que developer continua com o alcance esperado pelo produto, se essa for a regra oficial. 
- [ ] Confirmar que `AuthContext` abre a empresa correta mesmo quando `profiles.company_id` antigo estiver diferente. 
- [ ] Confirmar que editar perfil/vínculo não desloca usuário de empresa indevidamente. 
- [ ] Confirmar que a UI continua mostrando “Vínculo” correto para vendedor e motorista. 
- [ ] Confirmar ausência de vazamento entre empresas em `profiles`, `user_roles`, `sellers` e `drivers`. 
- [ ] Confirmar consistência visual e funcional da tela `/admin/usuarios` após refresh, troca de empresa e reabertura do modal. 
