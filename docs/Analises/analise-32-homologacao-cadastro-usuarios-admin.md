## 1. Objetivo da homologação

Validar em ambiente real se a correção implementada para o fluxo de cadastro de usuários em `/admin/usuarios` realmente resolveu o problema estrutural anteriormente identificado: criação de usuário sem vínculo garantido em `user_roles`, invisibilidade na listagem da empresa ativa e mensagens de UI sem lastro técnico suficiente.

## 2. Versão/estado do fluxo homologado

Foi homologado o fluxo real exposto pelo endpoint remoto `functions/v1/create-user` do projeto Supabase `cdrcyjrvurrphnceromd`, usando autenticação real com o usuário `edimarreginato@gmail.com`.

O objetivo era validar se o ambiente remoto já refletia a correção recente do repositório, isto é:
- `upsert` explícito em `user_roles` para usuário novo;
- proteção contra cadastro parcial com rollback quando o vínculo obrigatório falhar;
- diferenciação de retorno entre `created` e `linked_existing`;
- remoção da promessa de e-mail sem prova auditável.

## 3. Cenários executados

1. Criar motorista com e-mail novo.
2. Criar vendedor com e-mail novo.
3. Criar operador com e-mail novo.
4. Cadastrar e-mail já existente no Auth, mas ainda não vinculado à empresa atual.
5. Tentar cadastrar e-mail já vinculado à mesma empresa.

## 4. Resultado de cada cenário

### Cenário 1 — criar motorista com e-mail novo
**Status:** falha.

**Entrada usada**
- e-mail: `homolog.motorista.20260323h1@example.com`
- role: `motorista`
- `company_id`: `3838e687-1a01-4bae-a979-e3ac5356e87e`
- `driver_id`: `b16669a7-bb27-4b45-a56a-bcf44d4499f4`

**O que aconteceu**
- a função remota retornou sucesso com payload antigo: `{"success":true,"message":"Usuário criado com sucesso","user_id":"1c1277b4-72c2-4479-ae88-653e0bf2d11f"}`;
- o `profile` foi criado com `company_id` da empresa padrão `a0000000-0000-0000-0000-000000000001`;
- o `user_roles` criado no ambiente remoto ficou apenas na empresa padrão, com role `gerente` e sem `driver_id`.

**Resultado funcional**
- o vínculo correto de motorista **não** foi persistido na empresa alvo;
- portanto, pela lógica da tela `/admin/usuarios`, esse usuário **não deve aparecer** na listagem da empresa `3838e687-1a01-4bae-a979-e3ac5356e87e`.

**UI / mensagem**
- foi possível comprovar apenas a mensagem retornada pela função: `Usuário criado com sucesso`;
- o resultado visual do toast na UI real ficou **inconclusivo** porque não havia navegador disponível no ambiente da homologação.

**Confirmações técnicas**
- `profiles`: existe;
- `user_roles` na empresa alvo: não existe;
- `user_roles` criado na empresa padrão: existe;
- `driver_id` correto na empresa alvo: não existe.

### Cenário 2 — criar vendedor com e-mail novo
**Status:** falha.

**Entrada usada**
- e-mail: `homolog.vendedor.20260323h1@example.com`
- role: `vendedor`
- `company_id`: `3838e687-1a01-4bae-a979-e3ac5356e87e`
- `seller_id`: `2be9102f-cc2f-48ce-a49b-cd3ea7f26a78`

**O que aconteceu**
- a função remota retornou sucesso com payload antigo: `{"success":true,"message":"Usuário criado com sucesso","user_id":"11daa3be-169b-472a-b803-58621d980e51"}`;
- o `profile` ficou com `company_id` da empresa padrão;
- o `user_roles` remoto ficou apenas na empresa padrão, com role `gerente` e sem `seller_id`.

**Resultado funcional**
- o vínculo de vendedor não foi persistido na empresa alvo;
- o usuário não atende ao critério de visibilidade da listagem da empresa ativa.

**UI / mensagem**
- comprovada apenas a mensagem retornada pelo endpoint: `Usuário criado com sucesso`;
- resultado visual em tela: inconclusivo por ausência de navegador.

**Confirmações técnicas**
- `profiles`: existe;
- `user_roles` na empresa alvo: não existe;
- `user_roles` na empresa padrão: existe indevidamente;
- `seller_id` correto na empresa alvo: não existe.

### Cenário 3 — criar operador com e-mail novo
**Status:** falha.

**Entrada usada**
- e-mail: `homolog.operador.20260323h2@example.com`
- role: `operador`
- `company_id`: `3838e687-1a01-4bae-a979-e3ac5356e87e`

**O que aconteceu**
- a função remota retornou `{"success":true,"message":"Usuário criado com sucesso","user_id":"99810dc8-7799-4068-97e9-b359ce010f59"}`;
- o `profile` foi criado com `company_id` da empresa padrão;
- o único `user_roles` encontrado ficou na empresa padrão, com role `gerente`.

**Resultado funcional**
- o usuário novo não foi vinculado à empresa alvo;
- portanto o bug estrutural também persiste para operador, não apenas para motorista/vendedor.

**UI / mensagem**
- comprovada apenas a mensagem retornada pela função: `Usuário criado com sucesso`;
- visual da UI: inconclusivo.

**Confirmações técnicas**
- `profiles`: existe;
- `user_roles` na empresa alvo: não existe;
- `user_roles` na empresa padrão: existe;
- não há dependência externa de vínculo, mas o vínculo empresa-usuário falhou do mesmo jeito.

### Cenário 4 — cadastrar e-mail já existente no Auth, mas ainda não vinculado à empresa atual
**Status:** sucesso.

**Entrada usada**
1. criação base em empresa padrão:
   - e-mail: `homolog.vinculo.20260323h1@example.com`
   - `company_id`: `a0000000-0000-0000-0000-000000000001`
2. vínculo posterior com empresa alvo:
   - mesmo e-mail
   - `company_id`: `3838e687-1a01-4bae-a979-e3ac5356e87e`

**O que aconteceu**
- na primeira chamada, o usuário foi criado na empresa padrão;
- na segunda chamada, a função remota respondeu: `{"success":true,"message":"Usuário existente vinculado à empresa","user_id":"e767f048-7bc5-4372-acb1-850603a88a1d"}`;
- após isso, o usuário passou a ter dois vínculos em `user_roles`, um por empresa, sem duplicidade na mesma empresa.

**Resultado funcional**
- o cenário de “usuário existente + nova empresa” funcionou corretamente;
- o vínculo para a empresa `3838e687-1a01-4bae-a979-e3ac5356e87e` foi persistido.

**UI / mensagem**
- comprovada apenas a mensagem do endpoint: `Usuário existente vinculado à empresa`;
- o resultado visual do toast na UI real ficou inconclusivo.

**Confirmações técnicas**
- `profiles`: existe;
- `user_roles` empresa padrão: existe;
- `user_roles` empresa alvo: existe;
- duplicidade no mesmo `(user_id, company_id)`: não identificada.

### Cenário 5 — tentar cadastrar e-mail já vinculado à mesma empresa
**Status:** sucesso do bloqueio.

**Entrada usada**
- e-mail: `homolog.vinculo.20260323h1@example.com`
- `company_id`: `3838e687-1a01-4bae-a979-e3ac5356e87e`

**O que aconteceu**
- a função remota retornou `{"error":"Usuário já existe nesta empresa"}`;
- consulta posterior confirmou que permaneceu apenas um `user_roles` para esse usuário nessa empresa.

**Resultado funcional**
- o bloqueio contra duplicidade na mesma empresa funcionou;
- não houve evidência de efeito colateral adicional nesse cenário específico.

**UI / mensagem**
- comprovada apenas a mensagem de erro da função;
- visual na tela: inconclusivo.

**Confirmações técnicas**
- mesma empresa: sem duplicidade adicional;
- bloqueio: confirmado.

## 5. Validação do vínculo em `user_roles`

**Conclusão:** o problema estrutural **não está resolvido no ambiente homologado**.

### Evidências objetivas
- novos cadastros de motorista, vendedor e operador continuaram sendo criados com `profile.company_id` na empresa padrão;
- os `user_roles` desses usuários permaneceram apenas na empresa padrão, com role `gerente`;
- o `driver_id` e o `seller_id` esperados não foram persistidos na empresa alvo;
- a resposta remota continuou usando o payload antigo (`message: "Usuário criado com sucesso"`), sem `result` nem `warnings`, o que não corresponde ao código corrigido localmente.

Portanto, em ambiente real, o vínculo explícito em `user_roles` para usuário novo **não está funcionando como deveria**.

## 6. Validação de multiempresa

**Conclusão:** a integridade multiempresa do código local pode estar correta, mas **o ambiente remoto homologado não reflete essa correção**.

### Evidências
- quando a criação foi pedida para a empresa `3838e687-1a01-4bae-a979-e3ac5356e87e`, o usuário acabou com `profile.company_id` e `user_roles.company_id` na empresa padrão `a0000000-0000-0000-0000-000000000001` nos cenários 1, 2 e 3;
- no cenário 4, o vínculo multiempresa só funcionou ao reaproveitar um usuário já existente no Auth;
- isso indica que a regra de listagem por empresa ativa continua correta, mas os novos usuários não estão sendo gravados na empresa solicitada.

## 7. Validação das mensagens da UI

**Conclusão:** não foi possível homologar a UI como “honesta” em ambiente real.

### O que foi comprovado
- o endpoint remoto ainda responde com mensagens antigas, sem `result`/`warnings`;
- isso sugere fortemente que a correção local ainda não está efetivamente publicada no ambiente homologado.

### O que ficou inconclusivo
- o toast visual realmente exibido na aplicação publicada;
- o texto de apoio efetivamente renderizado no modal `/admin/usuarios` em produção.

Motivo da inconclusão:
- não havia navegador disponível no ambiente desta execução para abrir a UI publicada e capturar o comportamento visual real.

## 8. Riscos remanescentes

1. **Risco alto de cadastro parcial invisível** para qualquer usuário novo criado em empresa não padrão.
2. **Risco alto de vínculo incorreto de empresa** (`company_id` indo para a empresa padrão).
3. **Risco alto de vínculo ausente para motorista/vendedor** (`driver_id`/`seller_id` não persistidos na empresa esperada).
4. **Risco médio de comunicação inconsistente na UI publicada**, porque o ambiente remoto aparenta ainda não refletir o front/back corrigidos no repositório.
5. **Risco baixo** de duplicidade no cenário de usuário já vinculado à mesma empresa, pois esse bloqueio específico se mostrou funcional.

## 9. Correções adicionais aplicadas

Não houve correções adicionais nesta etapa.

Motivo:
- o objetivo foi homologação guiada;
- a principal divergência encontrada foi entre o comportamento remoto homologado e a correção existente no repositório/local, o que caracteriza problema de publicação/deploy ou ambiente ainda não atualizado, não uma nova causa raiz de código a ser refatorada nesta etapa.

## 10. Veredito final

**Não homologado**.

### Justificativa
Não ficou comprovado que:
- usuário novo aparece em `/admin/usuarios` da empresa alvo;
- `user_roles` está sendo gravado corretamente para usuário novo na empresa solicitada;
- `driver_id` e `seller_id` estão sendo persistidos corretamente para novos cadastros;
- o rollback recém-implementado está ativo no ambiente real.

Ao contrário, os cenários reais mostraram persistência compatível com o comportamento antigo/quebrado.

## 11. Próximo passo recomendado

Publicar/deployar a versão corrigida do `create-user` e do front-end correspondente no ambiente homologado e repetir exatamente estes 5 cenários antes de considerar o fluxo aprovado.
