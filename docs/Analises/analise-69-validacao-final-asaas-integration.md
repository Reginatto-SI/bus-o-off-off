# Análise final — validação Asaas (`check-asaas-integration`)

## Resumo executivo

A revisão final confirmou que o ajuste de `account_id` local não bloqueante segue o objetivo de eliminar falso erro entre os botões **Testar conexão** (developer) e **Verificar integração** (usuário), sem criar fluxo paralelo.

Também foi aplicado um reforço mínimo de segurança: mesmo com `storedAccountId` ausente, a validação agora **continua exigindo que a conta exista no retorno de `/myAccount`** (`remoteAccountId` válido), evitando falso positivo em payload inconsistente do gateway.

Status final: **GO para deploy**, com risco residual baixo e comportamento previsível/auditável.

---

## Pontos validados

### 1) Segurança da validação

- Ausência de `account_id` local permanece **não bloqueante** (`accountIdCheckBypassed = !storedAccountId`).
- A validação **não mascara erro real**: agora retorna erro quando `/myAccount` não traz `id` (erro `asaas_account_not_found`).
- Credenciais inválidas continuam bloqueando via status HTTP do gateway (401/403).

### 2) Fonte de verdade da integração

A verificação operacional continua baseada em:

- `asaas_api_key_*` (obrigatória)
- `asaas_wallet_id_*` (obrigatória)
- resposta real do Asaas (`/myAccount`)

Conclusão objetiva:

- `account_id` local **não é obrigatório para operação funcional**.
- `account_id` local atua como metadado de consistência/auditoria quando presente.

### 3) Validação de mismatch

Antes:

```ts
if (!accountIdCheckBypassed && (!asaasAccountFound || !accountIdMatches))
```

Após revisão:

1. `!asaasAccountFound` é validado separadamente (sempre bloqueante).
2. `!accountIdMatches` só bloqueia quando existe `storedAccountId`.

Com isso:

- evita bypass indevido de conta inexistente no gateway
- mantém `account_id` local ausente como não bloqueante
- reduz risco de falso positivo

### 4) Wallet continua obrigatória

- Continua erro quando `wallet` não existe no gateway.
- Continua erro quando `wallet_id` local diverge do gateway.
- Não há cenário de sucesso com API key válida e wallet ausente.

### 5) Logs e observabilidade

- `missing_local_account_id_non_blocking` foi mantido e rebaixado para log não-alertável (`log`) para reduzir ruído operacional.
- Erros reais permanecem em `warn/error` com `company_id`, ambiente, etapa e motivo técnico.

### 6) Impacto no frontend

- Frontend em `src/pages/admin/Company.tsx` decide toast por `status` + `integration_status`, não por `error_type` específico.
- Portanto, `missing_local_account_id_non_blocking` não gera erro visual ao usuário.

### 7) Consistência entre fluxos

Com a regra atual:

- Developer e usuário passam a convergir para o mesmo resultado operacional no cenário sem `account_id` local.
- Divergências reais (wallet/account mismatch, credencial inválida, gateway error) continuam explícitas.

### 8) Regressões críticas

Mantidas:

- API key inválida → erro
- erro no gateway → erro
- wallet divergente/ausente → erro
- account_id divergente (quando existe localmente) → erro

---

## Possíveis riscos

1. **Payload atípico do Asaas sem `id`** agora bloqueia (intencional por segurança).
2. Dependência de consistência dos campos `walletId` em `/myAccount` permanece igual ao comportamento anterior.

Risco geral: **baixo**.

---

## Ajustes recomendados (opcional, fora do escopo mínimo)

- Criar monitoria agregada para taxa de `missing_local_account_id_non_blocking` por empresa/ambiente para apoiar saneamento cadastral sem afetar operação.

---

## Go/No-Go para deploy

**GO** ✅

Motivos:

- elimina falso erro principal
- mantém validação operacional segura
- preserva auditabilidade e previsibilidade
- não altera contrato da API nem arquitetura
