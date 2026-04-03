# Etapa 1 — Diagnóstico da inconsistência de status x verificação Asaas

## Sintoma observado

Na tela `/admin/empresa`, o card da integração aparece como **Conectado (verde)**, mas o botão **Verificar integração** retorna:

> Conta Asaas não encontrada durante a verificação da integração.

## Fluxo atual completo (antes da correção)

## 1) Fonte do status “Conectado”

- O status visual vem de `getAsaasIntegrationSnapshot(company, environment)`.
- O card usava `status === 'connected'` para badge verde.
- A decisão de `connected` vinha da função `hasOperationalConnection`.
- Esse cálculo era local (campos da tabela `companies`), sem chamada remota obrigatória no momento da renderização.

Resumo: **status era local/persistido**, não necessariamente “validado em tempo real”.

## 2) Função usada no botão “Verificar integração”

- Frontend: `handleRevalidateAsaasIntegration` em `src/pages/admin/Company.tsx`.
- Endpoint chamado: edge function `check-asaas-integration`.
- Payload enviado:
  - `company_id`
  - `target_environment` (derivado de `runtimePaymentEnvironment`)
- Endpoint Asaas principal usado na verificação:
  - `GET {asaasBaseUrl}/myAccount`
- Endpoints complementares (diagnóstico operacional):
  - `GET /myAccount/status/`
  - `GET /wallets/`
  - `GET /pix/addressKeys?status=ACTIVE`
  - `GET /pix/addressKeys`

## 3) Identificadores avaliados

Na verificação eram comparados:

- Local:
  - `asaas_account_id_(production|sandbox)`
  - `asaas_wallet_id_(production|sandbox)`
- Remoto (Asaas):
  - `remoteAccountId` (extraído de `accountData.id`, originalmente)
  - `remoteWalletId` (extraído de `accountData.walletId` ou `accountData.wallet.id`, originalmente)

Ponto crítico identificado:

- O parser do `check-asaas-integration` era mais rígido que o parser do `create-asaas-account`.
- Em payloads do Asaas onde o `id` não vem no topo, a verificação podia interpretar **falso “conta não encontrada”**.

## 4) Ambiente

- A verificação manual já recebe ambiente explícito via `target_environment`.
- O backend resolve campos por ambiente e não mistura produção/sandbox na consulta da empresa.
- Não foi encontrada inferência indevida dentro da verificação manual atual.

## 5) Credenciais

- A API Key usada é a da empresa + ambiente selecionado (`asaas_api_key_production` ou `asaas_api_key_sandbox`).
- A verificação usa essa API key no header `access_token`.

## 6) Resposta real do Asaas e tratamento

Tratamento relevante identificado no código:

- Se `/myAccount` responde HTTP 404 → mensagem “Conta Asaas não encontrada...”.
- Mesmo com HTTP 200, se parser não encontrar `remoteAccountId`, também retornava “Conta Asaas não encontrada...”.

Isso produz cenário de inconsistência quando:

1. estado local indica integração configurada;
2. payload remoto tem formato diferente do parser rígido;
3. sistema classifica como not_found por falta de extração, não por inexistência real da conta.

## Diferença entre “Conectado” vs “Verificado”

- **Conectado**: status local baseado nos campos persistidos da empresa (snapshot de configuração).
- **Verificado**: validação remota efetiva no Asaas + comparação de identificadores.

Causa da divergência: os dois fluxos não compartilhavam exatamente a mesma regra de interpretação do payload remoto.

## Causa raiz

1. **Parser divergente e mais frágil em `check-asaas-integration`** para account/wallet.
2. **Sem fallback de wallet antes de reprovar**, em payloads com wallet fora do topo.
3. **Mensagem genérica de erro operacional**, sem contexto de ambiente/identificadores.

## Pontos de inconsistência confirmados

- Fonte de status visual (local) ≠ validação remota (gateway).
- Regra de parser de payload não unificada entre endpoints (`create-asaas-account` vs `check-asaas-integration`).
- Granularidade de status no badge não separava “Conectado” de “Validado”.

## Evidências (logs/payloads/fluxo)

Evidência de fluxo:

- `Company.tsx` chama `check-asaas-integration` no botão “Verificar integração”.
- `check-asaas-integration` chamava `/myAccount` e dependia de extração direta para classificar conta encontrada.
- `create-asaas-account` já tinha parser mais robusto para payloads alternativos.

Evidência de sintomas compatíveis:

- Card verde + toast “Conta Asaas não encontrada...” ocorre quando configuração local existe, mas verificação remota falha por parsing/identificador.

---

## Conclusão da Etapa 1

A inconsistência não era apenas “UI vs API”, mas principalmente **diferença de lógica de extração e validação entre fluxos que deveriam ser coerentes**.
A correção segura é unificar parser e reforçar a mensagem diagnóstica, sem criar fluxos paralelos.
