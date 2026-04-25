# Sprint 2 — Endpoint dedicado de verificação da integração Asaas

## Objetivo
Implementar um fluxo dedicado, auditável e previsível para o botão **"Verificar integração"** em `/admin/empresa`, removendo a dependência do modo `revalidate` da edge function `create-asaas-account` e criando um endpoint exclusivo de diagnóstico operacional da integração Asaas.

## Contexto atual
Na Sprint 1, o falso `404 Company not found` foi corrigido no lookup da empresa dentro de `create-asaas-account`. Mesmo com essa melhoria, o desenho do fluxo ainda permanecia inadequado para operação porque o botão **"Verificar integração"** continuava reaproveitando uma edge function responsável por:
- criação de conta;
- vínculo por API key;
- revalidação;
- disconnect.

Isso mantinha a verificação acoplada a um fluxo que também pode **alterar estado**, o que não é desejável para health check operacional.

## Problema identificado
O problema desta Sprint não era mais somente o erro HTTP ambíguo. O problema passou a ser o **desenho do fluxo**:
- o botão chamava `create-asaas-account` com `mode: 'revalidate'`;
- esse caminho podia consultar o Asaas **e também atualizar colunas da empresa**;
- verificação operacional e onboarding permaneciam misturados;
- o suporte recebia mensagens operacionais sem um contrato estruturado de diagnóstico.

## Estratégia adotada
Foi aplicada uma mudança **mínima e localizada**, sem refatorar arquitetura do app:
1. criar uma nova edge function `check-asaas-integration`;
2. manter `create-asaas-account` intacta para onboarding/vínculo/disconnect;
3. mover o botão do frontend para a nova função dedicada;
4. retornar payload estruturado, incluindo:
   - estágio do diagnóstico;
   - status da integração;
   - detalhes das credenciais;
   - evidência se houve tentativa real de chamada ao Asaas;
   - mensagem operacional clara;
5. não alterar RLS, onboarding, fluxo de pagamento nem layout da tela.

## Fluxo novo implementado
### 1. Frontend `/admin/empresa`
O botão **"Verificar integração"** agora envia:
- `company_id = editingId`
- `target_environment = runtimePaymentEnvironment`

para a edge function **`check-asaas-integration`**, em vez de chamar `create-asaas-account`.

### 2. Edge function `check-asaas-integration`
A função segue esta ordem:

#### Etapa 1 — Validação de entrada
- exige `company_id`;
- exige `target_environment` válido (`production` ou `sandbox`);
- retorna `400` se o contrato estiver inválido.

#### Etapa 2 — Autorização e lookup da empresa
- autentica usuário admin;
- valida vínculo do usuário com a empresa;
- busca a empresa em `companies`;
- retorna:
  - `500` para erro interno de query;
  - `404` para empresa ausente.

#### Etapa 3 — Validação de credenciais por ambiente
Com base no ambiente solicitado, valida a presença de:
- `api_key`;
- `account_id`;
- `wallet_id`.

Se faltar algo, responde com diagnóstico estruturado:
- `integration_status: incomplete`
- `diagnostic_stage: credentials_validation`
- `details.missing_fields` com a lista exata.

#### Etapa 4 — Chamada dedicada ao Asaas
Quando as credenciais estão completas:
- chama `GET /myAccount` no ambiente correto;
- compara o `account_id` e o `wallet_id` retornados pelo gateway com os valores persistidos na empresa;
- classifica cenários operacionais como:
  - credencial inválida;
  - conta divergente/não encontrada;
  - wallet divergente/não encontrada;
  - onboarding pendente no cadastro;
  - integração válida;
  - falha de comunicação com o gateway.

### 3. Sem mutação de estado
A nova função **não grava nada na base**.
Esse ponto é central para separar:
- **verificação** → somente diagnóstico;
- **onboarding/vínculo** → criação/atualização de integração;
- **revalidação antiga** → comportamento legado ainda existente, mas não mais usado pelo botão da tela.

## Arquivos criados
- `supabase/functions/check-asaas-integration/index.ts`
- `docs/sprint2-verificacao-integracao-asaas.md`

## Arquivos alterados
- `src/pages/admin/Company.tsx`

## Estrutura de resposta da API
A nova edge function retorna um payload padronizado como:

```json
{
  "status": "ok | error",
  "integration_status": "valid | invalid | incomplete | not_found | pending | communication_error",
  "environment": "production | sandbox",
  "diagnostic_stage": "input_validation | company_lookup | credentials_validation | asaas_request",
  "details": {
    "has_api_key": true,
    "has_account_id": true,
    "has_wallet_id": true,
    "missing_fields": [],
    "asaas_request_attempted": true,
    "asaas_account_found": true,
    "wallet_found": true,
    "account_id_matches": true,
    "wallet_id_matches": true,
    "onboarding_complete": true,
    "asaas_http_status": 200,
    "error_type": "invalid_api_key"
  },
  "message": "mensagem operacional clara"
}
```

### Convenção de status HTTP
- `400` → request inválido;
- `401/403` → autenticação/autorização;
- `404` → empresa não encontrada;
- `500` → erro interno de lookup/execução;
- `200` → diagnóstico operacional concluído, inclusive para cenários negativos do Asaas ou credenciais incompletas.

Essa divisão foi escolhida para que o frontend consiga distinguir:
- erro real do sistema/contrato; e
- diagnóstico operacional da integração.

## Tratamento de resposta na UI
Sem mudar o layout do card, o botão agora usa o payload estruturado para exibir mensagens úteis:
- `status = ok` → `toast.success` com “Integração válida e pronta para uso.”;
- `integration_status = incomplete` ou `pending` → `toast.warning` com mensagem específica;
- demais falhas operacionais → `toast.error` com mensagem específica;
- erros HTTP internos/contratuais continuam passando pelo fluxo de parsing seguro já existente.

## Logs estruturados implementados
A nova função registra, conforme o estágio:
- `company_id`;
- `requested_target_environment`;
- `resolved_payment_environment`;
- `diagnostic_stage`;
- `error_type`;
- `asaas_request_attempted`;
- detalhes de query error, status HTTP do Asaas e divergências entre IDs salvos e IDs retornados.

## Casos de teste considerados
### Casos internos
- request sem `company_id`;
- request sem `target_environment`;
- empresa sem vínculo com o usuário;
- erro de query em `companies`;
- empresa inexistente.

### Casos de configuração
- falta de `api_key`;
- falta de `account_id`;
- falta de `wallet_id`;
- credenciais parcialmente preenchidas no ambiente solicitado.

### Casos de gateway
- API key rejeitada pelo Asaas (`401/403`);
- conta não encontrada / divergente;
- wallet divergente ou não encontrada;
- conta encontrada com onboarding pendente no cadastro;
- integração válida;
- falha de comunicação/rede/runtime ao chamar o Asaas.

## Riscos
- O endpoint usa `GET /myAccount` e compara os identificadores retornados com os valores persistidos. Isso melhora bastante o diagnóstico, mas ainda não cobre um painel operacional mais rico do gateway.
- O conceito de “onboarding pendente” continua baseado no flag salvo em `companies`, não em um endpoint específico de status cadastral do Asaas.
- O modo `revalidate` continua existindo em `create-asaas-account` por compatibilidade e baixo risco, embora o botão da tela não o use mais.

## Próximos passos (Sprint 3)
- Exibir no card um resumo persistente do último check: ambiente, timestamp, estágio e resultado;
- criar mensagens ainda mais guiadas na UI para ações operacionais (“reconectar”, “revisar credenciais”, “verificar account_id”);
- avaliar um endpoint mais rico de status cadastral no Asaas, caso seja necessário diferenciar onboarding pendente no gateway vs. flag local;
- consolidar telemetria de verificação em uma trilha auditável centralizada.

## Checklist final
- [x] endpoint novo criado
- [x] botão não usa mais `create-asaas-account`
- [x] separação clara de responsabilidades
- [x] erros internos vs Asaas diferenciados
- [x] mensagens úteis para operação
- [x] comentários adicionados
- [x] logs estruturados implementados
- [x] Markdown gerado no repositório

## Conclusão
A Sprint 2 deixou o fluxo de **"Verificar integração"** mais coerente com operação SaaS séria:
- health check agora é **dedicado**;
- onboarding continua separado;
- não há mutação de estado durante diagnóstico;
- o retorno ficou mais previsível para humanos e para suporte;
- o frontend passou a exibir mensagens menos genéricas e mais úteis.
