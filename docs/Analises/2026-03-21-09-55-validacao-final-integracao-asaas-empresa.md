# Validação final — verificação Asaas em `/admin/empresa`

## Objetivo
Confirmar se o fluxo atual do botão **"Verificar integração"** respeita leitura determinística por ambiente na tabela `companies`, sem fallback entre sandbox e produção.

## Resultado executivo
Após a validação final do código e um ajuste mínimo localizado, o fluxo ficou **correto e determinístico por ambiente** para a verificação manual e para o card visual da tela `/admin/empresa`.

## Empresa atual
- A empresa atual continua vindo de `AuthContext`.
- A ordem é: empresa salva no `localStorage` válida → `profile.company_id` → primeira empresa ativa disponível ao usuário.
- A tela de empresa hidrata `editingId` a partir do registro carregado e usa esse `id` no clique de verificação.

## Ambiente atual
- O ambiente operacional continua vindo de `useRuntimePaymentEnvironment()`.
- Ordem: `VITE_PAYMENT_ENVIRONMENT` → edge function `get-runtime-payment-environment` → fallback por hostname apenas se o edge falhar.
- No clique do botão, o frontend envia `target_environment` explicitamente.

## Payload enviado ao verificar
```json
{
  "company_id": "editingId",
  "target_environment": "runtimePaymentEnvironment"
}
```

## Leitura determinística da `companies`
### Edge function `check-asaas-integration`
A função agora:
1. valida `company_id`
2. valida `target_environment`
3. resolve o ambiente ativo
4. monta dinamicamente o `select` apenas com as colunas daquele ambiente
5. lê somente esse bloco da `companies`

### Produção
- `asaas_api_key_production`
- `asaas_wallet_id_production`
- `asaas_account_id_production`
- `asaas_account_email_production`
- `asaas_onboarding_complete_production`

### Sandbox
- `asaas_api_key_sandbox`
- `asaas_wallet_id_sandbox`
- `asaas_account_id_sandbox`
- `asaas_account_email_sandbox`
- `asaas_onboarding_complete_sandbox`

## Premissa crítica validada
A premissa abaixo está **correta** no fluxo atual da verificação manual, considerando apenas o ambiente ativo:

> "No ambiente ativo, a validação pode seguir com `api_key` + `wallet_id` mesmo sem `account_id` daquele ambiente salvo localmente."

Motivo:
- a função exige `api_key` + `wallet_id` do ambiente ativo para iniciar a chamada ao Asaas;
- se o `account_id` do mesmo ambiente não existir localmente, a função ainda consulta `GET /myAccount` com a `api_key` do ambiente ativo;
- depois disso, devolve `pending` com mensagem clara de falta de `account_id` local.

## Card visual vs verificação manual
Antes desta validação final, o card ainda observava o ambiente oposto para compor parte do snapshot.
Isso não era fallback operacional da verificação manual, mas criava assimetria desnecessária na leitura visual.

### Ajuste mínimo aplicado
- O snapshot visual passou a considerar **somente o ambiente operacional ativo**.
- O ambiente oposto não é mais usado para complementar status, motivos ou conectividade do card.
- Assim, o card e a verificação manual passaram a seguir a mesma regra-base: **ler exclusivamente o bloco de colunas do ambiente ativo**.

## Ambiguidade encontrada
### Existia
- No card visual, havia leitura do ambiente oposto para influenciar `status`, `reasons` e `hasAnyConfiguration`.
- Isso não contaminava o payload do botão nem a validação do gateway, mas quebrava a regra estrita de leitura por ambiente para a camada visual.

### Situação final
- Não há mistura entre sandbox e produção na verificação manual.
- Não há fallback silencioso entre ambientes na edge function.
- Não há mais leitura cruzada do ambiente oposto no snapshot visual usado por `/admin/empresa`.

## Arquivos analisados
- `src/contexts/AuthContext.tsx`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/pages/admin/Company.tsx`
- `src/lib/asaasIntegrationStatus.ts`
- `src/lib/asaasIntegrationStatus.test.ts`
- `supabase/functions/check-asaas-integration/index.ts`

## Ajuste aplicado
- `supabase/functions/check-asaas-integration/index.ts`
  - passou a montar o `select` apenas com as colunas do ambiente ativo já resolvido.
- `src/lib/asaasIntegrationStatus.ts`
  - passou a montar o snapshot visual somente com o ambiente ativo.
- `src/lib/asaasIntegrationStatus.test.ts`
  - testes ajustados para refletir a regra determinística por ambiente.

## Como validar manualmente
1. Entrar em `/admin/empresa`.
2. Abrir a guia **Pagamentos**.
3. Confirmar o ambiente operacional exibido.
4. Clicar em **"Verificar integração"**.
5. Validar que:
   - produção consulta somente colunas `*_production`;
   - sandbox consulta somente colunas `*_sandbox`;
   - sem `account_id`, mas com `api_key + wallet_id` válidos do ambiente ativo, o retorno é `pending` claro e não mistura dados do outro ambiente;
   - o card não muda status com base em dados do ambiente oposto.
