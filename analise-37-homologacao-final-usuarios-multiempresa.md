## 1. Resumo executivo

**Status:** problema **ainda pendente em runtime real**.

A homologação prática encontrou evidência objetiva de divergência entre o código corrigido no repositório e a edge function `create-user` publicada no ambiente alvo. A tentativa real de criação de um gerente novo na empresa `BUSÃO OFF OFF` retornou payload antigo (`{"success":true,"message":"Usuário criado com sucesso"}`), sem `runtime_version`, e o usuário criado ficou **sem qualquer registro em `user_roles`**. Isso prova que o runtime publicado **não corresponde ao código mais recente** e que o bug atual **não pode ser considerado resolvido**.

## 2. Publicação confirmada

### Confirmado em runtime
- O endpoint publicado de `create-user` está acessível e responde no ambiente alvo.
- O trigger publicado que cria `profiles` aparenta já não forçar `company_id` para a empresa padrão, porque o profile do usuário recém-criado ficou com `company_id = null`.

### Não confirmado / divergente em runtime
- **Edge function `create-user` atualizada:** **não publicada corretamente** ou ainda divergente do repositório, porque não retorna `runtime_version` e não cria o vínculo obrigatório em `user_roles`.
- **RLS nova de `user_roles`:** não foi possível confirmar objetivamente em runtime se as policies novas estão ativas, porque a homologação parou na Etapa 1 ao detectar runtime antigo da edge function.
- **Frontend publicado (`AuthContext`/tela `/admin/usuarios`):** não foi validado visualmente nesta execução, porque a divergência crítica já foi comprovada no backend publicado e isso bloqueia a conclusão.

## 3. Validação de runtime

### Evidência coletada

#### Autenticação real no ambiente alvo
Foi possível autenticar com sucesso no projeto publicado usando:
- usuário: `edimarreginato@gmail.com`
- projeto: `https://cdrcyjrvurrphnceromd.supabase.co`

#### Chamada real da edge function publicada
Foi executada a criação real de um gerente novo para a empresa `3838e687-1a01-4bae-a979-e3ac5356e87e` (`BUSÃO OFF OFF`) com o e-mail:
- `homolog.gerente.20260323235139@example.com`

#### Resposta real do runtime publicado
```json
{"success":true,"message":"Usuário criado com sucesso","user_id":"8145f278-7eb8-4bc2-93cc-f5e7bcbd24de"}
```

### Conclusão da validação de runtime
- **Não há `runtime_version` no payload**.
- **Não há `result: "created"` nem `warnings`**, que existem no código atual do repositório.
- O payload é compatível com a versão antiga já identificada nas análises anteriores.

**Conclusão objetiva:** existe divergência entre código e ambiente. O runtime publicado **não está atualizado** com a correção final prevista para `create-user`.

## 4. Validação de RLS e trigger

### Trigger
Após a criação real do gerente de homologação, o `profile` encontrado foi:

```json
[{"id":"8145f278-7eb8-4bc2-93cc-f5e7bcbd24de","name":"Homolog Gerente Final","email":"homolog.gerente.20260323235139@example.com","company_id":null}]
```

Isso indica que o trigger publicado **não jogou o usuário na empresa padrão automaticamente** nesse teste específico. Portanto, há indício prático de que a neutralização do legado no trigger/profile **pode já ter entrado em vigor**.

### `user_roles`
A consulta real em `user_roles` para o usuário recém-criado retornou:

```json
[]
```

Ou seja:
- o vínculo obrigatório com a empresa `BUSÃO OFF OFF` **não foi criado**;
- não houve vínculo na empresa correta;
- também não apareceu vínculo automático na empresa padrão neste caso.

### RLS
- Não foi possível afirmar objetivamente, nesta execução, se a RLS nova de `user_roles` já está ativa em produção.
- Motivo: a homologação precisou ser interrompida na Etapa 1 ao comprovar que a edge function publicada ainda está antiga/quebrada para o cenário crítico de criação.
- Sem runtime atualizado do cadastro, qualquer conclusão de “resolvido” seria indevida.

### Conclusão desta etapa
- **Trigger legado contaminando empresa padrão:** não reproduziu no teste atual.
- **Fluxo publicado de criação em `user_roles`: ainda quebrado**.
- **RLS nova:** não homologada nesta execução.

## 5. Homologação do cadastro de gerente

- **Resultado:** falhou funcionalmente.
- **Empresa usada:** `BUSÃO OFF OFF` (`3838e687-1a01-4bae-a979-e3ac5356e87e`).
- **Usuário de teste:** `homolog.gerente.20260323235139@example.com`.
- **Criação concluída no Auth/Profile?** Sim, houve criação parcial com `profile` persistido.
- **`user_roles.company_id` correto?** Não. Nenhum vínculo foi criado.
- **Aparece corretamente na empresa usada?** Não há evidência de que apareça, porque a tela `/admin/usuarios` depende de `user_roles`.
- **Caiu indevidamente na empresa padrão?** Não neste teste específico.
- **Ficou cadastro parcial/orfão?** Sim. O usuário ficou com `profile`, mas sem `user_roles`.
- **Erro objetivo:** payload antigo e ausência total de vínculo em `user_roles`.

## 6. Homologação do cadastro de vendedor

- **Resultado:** não executado.
- **Motivo:** a Etapa 1 falhou ao comprovar divergência crítica entre código e runtime do `create-user`.
- **Justificativa para interrupção:** seguir criando vendedor/motorista em um runtime já comprovadamente antigo geraria mais dados parciais sem valor de fechamento.
- **Status de homologação:** pendente até que o runtime correto seja publicado.

## 7. Homologação do cadastro de motorista

- **Resultado:** não executado.
- **Motivo:** a Etapa 1 falhou ao comprovar divergência crítica entre código e runtime do `create-user`.
- **Justificativa para interrupção:** seguir criando vendedor/motorista em um runtime já comprovadamente antigo geraria mais dados parciais sem valor de fechamento.
- **Status de homologação:** pendente até que o runtime correto seja publicado.

## 8. Validação de isolamento multiempresa

### O que foi possível provar
- A listagem da tela continua dependendo de `user_roles`; como o gerente criado no teste ficou sem `user_roles`, o cenário continua compatível com o sintoma de “cadastro some”.
- O usuário de teste **não** recebeu vínculo automático na empresa padrão, então o componente específico do trigger legado não apareceu neste caso.

### O que não foi possível encerrar
- Não foi possível homologar que uma empresa A não enxerga usuários exclusivos da empresa B em runtime final.
- Não foi possível homologar que gerente não consegue listar/manipular vínculos de outra empresa via RLS nova.
- Não foi possível homologar a troca de empresa visual na `/admin/usuarios` publicada.

### Motivo
A divergência do `create-user` publicado interrompe a homologação antes do fechamento. O backend crítico ainda não corresponde ao código corrigido.

## 9. Situação dos dados históricos contaminados

### Bug atual
O bug atual **não está fechado**, porque o runtime publicado do cadastro continua sem criar o vínculo obrigatório em `user_roles`.

### Passivo antigo
O saneamento dos dados históricos contaminados **continua separado como pendência operacional**.

Importante:
- neste teste atual, não houve novo vínculo indevido na empresa padrão;
- porém isso **não basta** para declarar o problema resolvido, porque o fluxo publicado ainda cria cadastro parcial/orfão.

## 10. Veredito final

**Não resolvido**

Motivo objetivo:
- runtime do `create-user` publicado não corresponde ao código mais recente;
- `runtime_version` não foi retornado;
- o gerente criado em teste real ficou sem `user_roles`;
- gerente/vendedor/motorista novos ainda não foram homologados com sucesso no ambiente que importa;
- RLS nova não pôde ser homologada até o fim porque a Etapa 1 falhou.

## 11. Pendências objetivas

1. Publicar corretamente a edge function `create-user` correspondente ao código atual do repositório.
2. Confirmar em runtime o retorno com `runtime_version` e o payload novo esperado.
3. Reexecutar a homologação completa dos cenários:
   - gerente;
   - vendedor;
   - motorista.
4. Confirmar em runtime que `user_roles` é criado corretamente na empresa alvo.
5. Confirmar em runtime que a RLS nova de `user_roles` está ativa e bloqueia acesso cross-company para gerente.
6. Validar visualmente a `/admin/usuarios` publicada após o deploy correto.
7. Tratar separadamente o saneamento dos dados históricos contaminados, sem confundir isso com o bug atual.
