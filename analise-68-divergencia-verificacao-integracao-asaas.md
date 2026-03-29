# Análise técnica — divergência entre “Testar conexão” (developer) e “Verificar integração” (usuário)

## Resumo executivo

Foi confirmada divergência real entre os dois fluxos da tela `/admin/empresa`:

- O bloco **developer** (`Testar conexão`) chama `create-asaas-account` em modo `revalidate` e considera sucesso quando consegue validar gateway + obter `wallet_id` (com `account_id` opcional no payload de retorno).
- O botão do card **usuário** (`Verificar integração`) chama `check-asaas-integration`, que até então tratava **ausência de `account_id` salvo localmente** como erro/pending bloqueante, mesmo com gateway validado.
- Em paralelo, o status visual do card (`connected`) é calculado por `getAsaasIntegrationSnapshot` e atualmente considera conexão operacional com **API Key do ambiente** (wallet/account/onboarding como metadados adicionais).

Resultado: para a mesma empresa/ambiente, o sistema podia exibir “Conectado” e, ao verificar, retornar alerta de `account_id` faltante.

Causa raiz confirmada: **regra de validação divergente entre endpoints** (`create-asaas-account revalidate` vs `check-asaas-integration`) + status visual baseado em critério mais permissivo/operacional.

## Fluxo do botão “Testar conexão” (developer)

### Frontend
- Componente: `src/components/admin/AsaasDiagnosticPanel.tsx`
- Handler: `handleTestConnection`
- Chamada: `supabase.functions.invoke('create-asaas-account', { mode: 'revalidate', company_id, target_environment })`

### Backend
- Edge function: `supabase/functions/create-asaas-account/index.ts`
- Bloco: `if (mode === "revalidate")`
- Comportamento:
  1. Resolve credencial por ambiente (`apiKey` / `accountId`) e endpoint de verificação.
  2. Consulta Asaas (`/myAccount` ou fallback).
  3. Resolve `wallet_id` e tenta resolver `account_id` do payload.
  4. **Não persiste** `wallet_id/account_id` no modo `revalidate` (retorna no payload apenas).
  5. Retorna `success: true` com `wallet_id`, `account_id`, `account_status`, `pix_ready`.

## Fluxo do botão “Verificar integração” (usuário)

### Frontend
- Página: `src/pages/admin/Company.tsx`
- Handler: `handleRevalidateAsaasIntegration`
- Chamada: `supabase.functions.invoke('check-asaas-integration', { company_id, target_environment })`
- Exibe toast conforme `status`/`integration_status` retornados.

### Backend
- Edge function: `supabase/functions/check-asaas-integration/index.ts`
- Comportamento principal:
  1. Valida contexto (`company_id`, `target_environment`, autorização, vínculo usuário-empresa).
  2. Lê colunas por ambiente da `companies`.
  3. Exige `api_key` + `wallet_id` para prosseguir à chamada externa.
  4. Consulta Asaas (`/myAccount`).
  5. Compara `account_id`/`wallet_id` remoto vs local.
  6. Sincroniza readiness Pix e retorna status/mensagem.

## Comparação entre os dois fluxos

| Item | Testar conexão (developer) | Verificar integração (usuário) |
|---|---|---|
| Endpoint | `create-asaas-account` (`mode: revalidate`) | `check-asaas-integration` |
| Objetivo | diagnóstico técnico | verificação operacional para usuário |
| Exige `account_id` local para sucesso | Não (pode retornar `account_id: null`) | **Sim (antes da correção)** |
| Persiste `account_id` no fluxo | Não no revalidate | Não (somente valida) |
| Efeito observado | “sucesso” com conta operacional | alerta de pendência por `account_id` ausente |

## Campos usados como fonte de verdade

### No status visual (`asaasStatus` do card)
- Fonte: `src/lib/asaasIntegrationStatus.ts`
- Critério atual de conexão operacional: `hasOperationalConnection => Boolean(apiKey)`.
- Conclusão: card pode ficar `connected` sem `account_id`.

### Na verificação do usuário (`check-asaas-integration`)
- Antes da correção: tratava `account_id` local ausente como `pending/error` mesmo com gateway validado.
- Após correção mínima aplicada: `account_id` ausente vira **pendência não bloqueante**; validação continua por gateway + wallet + demais checks.

## Causa raiz confirmada

1. **Divergência de regra de obrigatoriedade de `account_id`** entre os dois fluxos.
2. Fluxo de revalidate developer não persiste `account_id` e pode retornar `null` legitimamente.
3. Fluxo do usuário interpretava esse cenário como erro bloqueante, gerando falso negativo operacional.

## Correção mínima proposta (e aplicada)

Arquivo alterado:
- `supabase/functions/check-asaas-integration/index.ts`

Mudança objetiva:
- Removido bloqueio que retornava erro/pending quando `storedAccountId` era nulo.
- Mantida observabilidade (`logCheck warn`) com novo motivo técnico não bloqueante.
- Comparação `account_id_mismatch` passa a rodar apenas quando existe `account_id` local para comparar.

Racional:
- Alinha “Verificar integração” com o comportamento operacional já adotado no projeto (API key + wallet/gateway) e elimina falso erro para o usuário.
- Evita criar fluxo paralelo, sem mudar arquitetura e sem inventar novos campos.

## Persistência: diagnóstico objetivo

- Colunas por ambiente em `companies` incluem `asaas_api_key_*`, `asaas_wallet_id_*`, `asaas_account_id_*`, `asaas_onboarding_complete_*`, `asaas_pix_ready_*`.
- O save de vínculo principal acontece em `create-asaas-account` nos modos de criação/vinculação.
- No modo `revalidate`, o endpoint **não persiste** `account_id/wallet_id`; atua como verificação.
- Portanto, `wallet_id` identificado em runtime sem `account_id` salvo localmente pode ocorrer e não significa necessariamente falha de conexão.

## `account_id` é obrigatório no fluxo atual?

Resposta objetiva baseada no código atual:

- **Não é obrigatório para considerar operação funcional no modelo atual.**
- É tratado como dado de rastreabilidade/comparação quando existe, mas não deve bloquear verificação operacional quando ausente.

## Mensagem ao usuário

Com a correção, o usuário não recebe mais falso erro de “falta salvar identificador” quando a integração está operacional.
A mensagem permanece objetiva no caso de sucesso:
- “Integração Asaas validada com sucesso.”

## Logs e observabilidade

A correção preserva rastreabilidade técnica:
- `company_id`
- `requested_target_environment`
- `resolved_payment_environment`
- `diagnostic_stage`
- `asaas_request_attempted`
- `error_type: missing_local_account_id_non_blocking`
- `remote_account_id`

## Riscos

- Baixo risco funcional: alteração localizada em único ponto de decisão do `check-asaas-integration`.
- Risco conhecido: se alguma rotina externa depender implicitamente do erro antigo para suporte manual, comportamento de alerta mudará para não bloqueante (mas com log técnico preservado).

## Checklist de validação manual

1. Abrir `/admin/empresa` com empresa no ambiente `production`.
2. Confirmar card mostrando `Conectado`.
3. Clicar em **Testar conexão** (diagnóstico developer): verificar retorno `success: true`.
4. Clicar em **Verificar integração** (card usuário):
   - esperado: sucesso quando gateway/wallet válidos, mesmo com `account_id` local nulo.
5. Validar logs da edge function `check-asaas-integration`:
   - deve registrar `missing_local_account_id_non_blocking` quando aplicável.
6. Validar cenários de erro real continuam funcionando:
   - API key inválida
   - wallet divergente
   - falha de comunicação com Asaas

