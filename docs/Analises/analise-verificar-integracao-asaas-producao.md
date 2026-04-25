# Análise técnica — botão "Verificar integração" do Asaas em `/admin/empresa`

## Objetivo da análise
Diagnosticar o fluxo real do botão **"Verificar integração"** na tela `/admin/empresa`, aplicar a **correção mínima segura** para o falso diagnóstico de `404 Company not found`, melhorar a rastreabilidade do fluxo e registrar em Markdown o que foi investigado, alterado, validado e o que deve seguir para próximas sprints.

## Resumo executivo
- O botão **não usa um endpoint dedicado de health check**; ele reutiliza a edge function `create-asaas-account` com `mode: 'revalidate'`.
- O frontend envia `company_id = editingId` e `target_environment = runtimePaymentEnvironment`, o que é coerente com a necessidade de validar o **mesmo ambiente operacional** exibido no card da empresa.
- O problema principal identificado na edge function estava confirmado: o lookup da empresa fazia `companyError || !company => 404 Company not found`, o que **mascarava falhas internas de query/estrutura** como se a empresa não existisse.
- A correção mínima aplicada foi:
  1. trocar `.single()` por `.maybeSingle()` no lookup da `companies`;
  2. separar claramente **erro de consulta interna** (`500`) de **empresa ausente** (`404`);
  3. adicionar **logs estruturados** com `company_id`, `target_environment`, ambiente resolvido, detalhes de `companyError`, indicação se houve tentativa de chamada ao Asaas e origem do erro;
  4. adicionar comentários de manutenção explicando por que a correção foi feita dessa forma mínima e segura.
- Não foi criada nova arquitetura, nova tela ou novo endpoint. O comportamento de sandbox foi preservado.

## Sintoma observado
- Na tela `/admin/empresa`, a empresa aparece como conectada no card de integração.
- Ao clicar em **"Verificar integração"**, o usuário recebe erro genérico, com relatos de `400/401` e, em auditoria anterior, `Company not found (HTTP 404)`.
- O erro de `404` podia ocorrer **antes de qualquer chamada ao Asaas**, dificultando suporte operacional porque o diagnóstico sugeria ausência da empresa, quando na prática o defeito podia estar em query, schema, coluna ou outra falha interna.

## Causa raiz confirmada ou mais provável
### Causa raiz confirmada
O trecho da edge function `supabase/functions/create-asaas-account/index.ts` fazia o lookup da tabela `companies` assim:
- consultava a empresa por `id`;
- usava `.single()`;
- tratava `companyError` e `!company` como a **mesma condição**;
- respondia sempre com `404 Company not found`.

Isso gerava falso diagnóstico em dois cenários distintos:
1. **empresa realmente inexistente** → deveria continuar sendo `404`;
2. **erro interno de consulta** (query, schema, coluna, incompatibilidade estrutural, etc.) → deveria ser erro interno (`500`) com rastreabilidade adequada.

### Causa raiz mais provável para o cenário relatado em produção
Com base no código atual e no sintoma descrito, a causa mais provável do falso `404` era precisamente a mistura entre:
- falha de lookup da empresa; e
- ausência real de empresa.

A auditoria anterior fazia sentido: o `404 Company not found` podia nascer **antes de falar com o Asaas**.

## Fluxo atual identificado
### 1. Renderização do botão
O botão **"Verificar integração"** é renderizado em `src/pages/admin/Company.tsx` somente quando o snapshot da integração está como `connected`.

### 2. Handler chamado pelo botão
Ao clicar, o botão chama `handleRevalidateAsaasIntegration()` em `src/pages/admin/Company.tsx`.

### 3. Payload enviado pelo frontend
O handler invoca a edge function `create-asaas-account` com:

```ts
{
  company_id: editingId,
  mode: 'revalidate',
  target_environment: runtimePaymentEnvironment,
}
```

### 4. Origem de `editingId`
`editingId` vem do registro carregado da empresa atual no `hydrateFormFromCompany(data)`, que faz:
- `setEditingId(data?.id ?? null)`.

Ou seja, o `company_id` enviado ao backend corresponde ao `id` do registro atualmente carregado na tela da empresa.

### 5. Origem de `activeCompanyId`
`activeCompanyId` vem do `AuthContext`:
- ele é resolvido a partir das empresas vinculadas ao usuário (`user_roles` + `companies`);
- a prioridade é: empresa salva no `localStorage` válida > empresa do `profile` > primeira empresa disponível.

Na tela `/admin/empresa`, `fetchCompany()` usa `activeCompanyId` para buscar a empresa ativa; depois esse dado abastece o formulário e, por consequência, o `editingId`.

### 6. Como o ambiente é resolvido no frontend
O hook `useRuntimePaymentEnvironment()` resolve o ambiente assim:
1. `VITE_PAYMENT_ENVIRONMENT`, se definido explicitamente no build;
2. edge function `get-runtime-payment-environment`;
3. fallback local por hostname do navegador.

### 7. Como o ambiente chega à edge function
O frontend envia o ambiente em `target_environment`.
Na edge function `create-asaas-account`, a função `resolveTargetEnvironment` faz:
- usar `target_environment` se for `production` ou `sandbox`;
- caso contrário, usar o ambiente legado resolvido pelo host.

### 8. Por que `target_environment` faz sentido nesse fluxo
No modo `revalidate`, o uso explícito de `target_environment` evita validar a credencial errada em casos de:
- preview apontando para produção;
- host de edge diferente do host percebido pelo navegador;
- mistura indevida entre produção e sandbox.

Esse ponto já fazia sentido no código e foi **preservado**.

### 9. Ponto exato do erro atual
Antes da correção, o erro ambíguo acontecia neste trecho da edge function:
- lookup de `companies`;
- `companyError || !company`;
- resposta única `404 Company not found`.

Portanto, o sistema podia falhar **antes da consulta ao Asaas** e ainda assim devolver mensagem que sugeria ausência da empresa.

## Separação entre erro interno e erro do Asaas
### Erros que acontecem antes de consultar o Asaas
Na edge function `create-asaas-account`, antes de qualquer `fetch` para o Asaas, podem ocorrer:
- falta de `Authorization` → `401`;
- token inválido → `401`;
- usuário sem permissão de admin → `403`;
- `company_id` ausente → `400`;
- usuário não vinculado à empresa → `403`;
- erro no lookup de `companies` → **agora tratado como `500`**;
- empresa inexistente → `404`;
- segredo da plataforma ausente (`ASAAS_API_KEY` ou `ASAAS_API_KEY_SANDBOX`) → `500`;
- ausência de credencial mínima para revalidação automática → `400`.

### Erros que acontecem durante a consulta ao Asaas
Depois que o fluxo chama o gateway (`fetch` para `/myAccount` ou `/accounts/{id}`), os erros passam a ser do gateway ou da etapa de integração externa, por exemplo:
- `401/403` do Asaas → falha de autenticação/credencial inválida;
- `404` do Asaas → conta vinculada não encontrada no gateway;
- `walletId` ausente na resposta → `400` do fluxo;
- erro inesperado após tentativa de gateway → `500`.

### Mensagens/status que estavam ambíguos
A ambiguidade principal confirmada era:
- `companyError` e `!company` resultando no mesmo `404 Company not found`.

Isso atrapalhava suporte e operação porque:
- levava a equipe a investigar cadastro inexistente;
- escondia falha interna estrutural antes do gateway;
- misturava erro interno com erro de negócio/inexistência.

## Produção vs sandbox
### Leitura dos campos da empresa
O projeto já está preparado para ambiente por coluna, com leitura explícita de:
- `asaas_api_key_production` / `asaas_api_key_sandbox`;
- `asaas_wallet_id_production` / `asaas_wallet_id_sandbox`;
- `asaas_account_id_production` / `asaas_account_id_sandbox`;
- `asaas_account_email_production` / `asaas_account_email_sandbox`;
- `asaas_onboarding_complete_production` / `asaas_onboarding_complete_sandbox`.

### Resolução de ambiente
A edge function ainda consegue inferir ambiente por host, mas para este fluxo o `target_environment` prevalece quando enviado corretamente pelo frontend.

### Fallback por host
Existe fallback por host tanto no frontend quanto no backend, mas no fluxo de revalidação o envio explícito de `target_environment` reduz o risco de validar contra o endpoint errado.

### Risco de olhar para o ambiente errado
O risco estrutural continua existindo se o frontend não enviar `target_environment` ou se ele vier nulo/inválido; nesse caso o backend ainda usa fallback por host.

**Nesta tarefa isso não foi alterado**, porque a solicitação era aplicar apenas a correção mínima segura no falso 404 e manter baixo risco.

## Arquivos inspecionados
- `src/pages/admin/Company.tsx`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/contexts/AuthContext.tsx`
- `src/lib/asaasIntegrationStatus.ts`
- `src/lib/asaasError.ts`
- `supabase/functions/create-asaas-account/index.ts`
- `supabase/functions/get-runtime-payment-environment/index.ts`
- `supabase/functions/_shared/runtime-env.ts`
- `supabase/migrations/20260815090000_add_asaas_environment_configuration.sql`
- `supabase/migrations/20260319100000_drop_legacy_asaas_columns_from_companies.sql`

## Arquivos alterados
- `supabase/functions/create-asaas-account/index.ts`
- `docs/analise-verificar-integracao-asaas-producao.md`

## Correções aplicadas
### 1. Separação correta entre `companyError` e `!company`
No lookup de `companies` da edge function:
- foi trocado `.single()` por `.maybeSingle()`;
- `companyError` agora retorna `500` com `diagnostic_stage: 'company_lookup'`;
- `!company` continua retornando `404 Company not found`.

### 2. Logs estruturados no ponto de lookup
Foram adicionados logs estruturados para registrar:
- `company_id` recebido;
- `requested_target_environment`;
- `resolved_payment_environment`;
- `onboarding_mode`;
- detalhes de `companyError` (`code`, `message`, `details`, `hint`);
- `asaas_request_attempted: false` quando a falha ocorreu antes do gateway;
- `error_origin` para distinguir origem do problema.

### 3. Log explícito quando começa a chamada ao Asaas
Na revalidação, o log do início da chamada ao endpoint do Asaas agora marca explicitamente:
- ambiente solicitado;
- ambiente resolvido;
- endpoint utilizado;
- `asaas_request_attempted: true`.

### 4. Log explícito para erro inesperado após tentativa de gateway
O `catch` da revalidação agora diferencia erro que já ocorreu **depois da tentativa de consulta ao Asaas**, facilitando auditoria operacional.

### 5. Comentários de manutenção obrigatórios
Foram adicionados comentários explicando:
- por que `target_environment` deve prevalecer no fluxo de revalidação;
- por que erro de lookup da empresa não pode virar falso `404`;
- em que momento o fluxo ainda não falou com o Asaas;
- quando o erro já passou a ser de gateway/tentativa externa;
- por que a solução foi mantida mínima e segura.

## Logs adicionados/melhorados
### Antes da chamada ao Asaas
- `[create-asaas-account] company lookup failed before Asaas call`
- `[create-asaas-account] company not found before Asaas call`

### Durante início da verificação externa
- `[ASAAS][VERIFY] Endpoint called`
  - agora com `requested_target_environment`, `resolved_payment_environment`, `asaas_request_attempted: true` e `error_origin`.

### Após erro inesperado com tentativa de gateway
- `[ASAAS][VERIFY] Unexpected error after gateway attempt`

## Validações realizadas
### Validação estática do fluxo
Foi feita leitura e rastreamento completo do fluxo entre:
- `AuthContext` → `activeCompanyId`;
- `Company.tsx` → `fetchCompany()` → `hydrateFormFromCompany()` → `editingId`;
- `handleRevalidateAsaasIntegration()` → `supabase.functions.invoke('create-asaas-account')`;
- `target_environment` → `resolveTargetEnvironment()` → campos por ambiente → tentativa de gateway.

### Validação estrutural do schema
Foi confirmado que existem migrations para os campos por ambiente na tabela `companies` e que os campos legados já foram removidos do contrato operacional principal.

### Validação local executada
- `npm run lint` para checagem estática do código alterado.
- `npm run build` para validar integridade do bundle TypeScript/Vite após a mudança.

## O que ainda não pôde ser comprovado
- Não foi reproduzido contra uma conta real em produção dentro do ambiente desta tarefa.
- Não foi possível afirmar, sem logs reais de produção, se os `400/401` relatados atualmente vêm de:
  - credencial inválida da empresa;
  - conta Asaas não encontrada no gateway;
  - segredo de plataforma incorreto/ausente no ambiente;
  - inconsistência operacional externa.
- Também não foi implementado endpoint dedicado de health check; portanto a revalidação continua acoplada à edge function de onboarding/vinculação.

## Riscos remanescentes
- O fluxo continua reaproveitando `create-asaas-account` para várias responsabilidades (`create`, `link_existing`, `revalidate`, `disconnect`). Isso é funcional, mas não é o desenho ideal para observabilidade.
- Se `target_environment` não for enviado corretamente em algum cliente futuro, o backend ainda pode cair no fallback por host.
- A UI ainda depende da mensagem textual retornada pela edge function; isso melhora bastante após a correção, mas ainda não equivale a um modelo formal de erros operacionais.

## Próximas etapas sugeridas
### Sprint 1 — já entregue nesta tarefa
- separar `companyError` de `!company`;
- eliminar falso `404`;
- melhorar logs e comentários;
- preservar comportamento existente com risco baixo.

### Sprint 2 — melhoria estrutural recomendada
- criar endpoint dedicado de **health check / verify-integration** para o Asaas;
- separar tecnicamente revalidação de onboarding/vinculação;
- retornar payload operacional mais granular, por exemplo:
  - `stage: internal_lookup | gateway_auth | gateway_not_found | success`;
  - `environment_used`;
  - `gateway_attempted`.

### Sprint 3 — observabilidade e UX operacional
- melhorar mensagem da UI em `/admin/empresa` com distinção clara entre:
  - erro interno do sistema;
  - erro de autenticação com o gateway;
  - conta não encontrada no gateway;
  - credencial incompleta por ambiente;
- persistir trilha de auditoria operacional em tabela/log estruturado;
- exibir no card o ambiente efetivo validado e o timestamp da última verificação.

## Conclusão final
A fala do incidente fazia sentido técnico. O problema principal estava mesmo no fato de a edge function responder **`404 Company not found` tanto para empresa ausente quanto para erro interno de lookup**, ocultando a origem real da falha antes da chamada ao Asaas.

A correção aplicada foi propositalmente **mínima, localizada e segura**:
- não alterou regra de negócio;
- não refatorou arquitetura;
- não mudou a tela;
- preservou o uso explícito de `target_environment`;
- eliminou o falso diagnóstico de `404`;
- adicionou rastreabilidade suficiente para suporte e auditoria.

## Checklist final
- [x] o falso 404 foi tratado corretamente;
- [x] `companyError` não é mais mascarado como empresa inexistente;
- [x] os comentários foram adicionados nas partes alteradas;
- [x] o fluxo continua respeitando o ambiente correto;
- [x] não houve refatoração desnecessária;
- [x] foi gerado o arquivo Markdown com a análise completa;
- [x] as dúvidas remanescentes ficaram documentadas.
