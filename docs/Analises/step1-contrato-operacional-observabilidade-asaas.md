# Step 1 de 5 — Contrato operacional + observabilidade unificada (Asaas)

## 1) Resumo executivo

### O que foi analisado
- Funções backend do fluxo Asaas: `create-asaas-payment`, `verify-payment-status`, `asaas-webhook`, `create-platform-fee-checkout`, `create-asaas-account` e `_shared/runtime-env.ts`.
- Convergência frontend em `Confirmation.tsx` (polling + verificação manual).
- Estruturas de rastreabilidade e estado: `sales`, `companies`, `partners`, `tickets`, `sale_passengers`, `seat_locks`, `sale_logs`, `sale_integration_logs`.

### O que foi ajustado neste Step 1 (baixo risco)
- Padronização de logs estruturados nas edge functions com correlação por `sale_id`, `company_id`, ambiente, owner e decisão de credencial/base URL.
- Inclusão de comentários técnicos que documentam zonas cinzentas legadas (fallbacks e decisões distribuídas), sem alterar regra central de negócio.
- Log de correlação no frontend (`Confirmation.tsx`) para ligar tentativa manual/polling com a verificação backend.
- Formalização escrita do contrato atual para reduzir ambiguidade operacional.

### O que foi esclarecido
- A regra atual possui **um ponto inicial de decisão por host** (create payment) e, depois, **persistência em `sales.payment_environment`** como referência para funções subsequentes.
- Owner/credencial/split são assimétricos entre sandbox e produção.
- Há fallback legado em verify (produção -> plataforma) e validação dual de token no webhook quando ambiente da venda é desconhecido.

### Ambiguidades que permanecem
- Dependência de host no gatilho inicial do ambiente.
- Fallback de credencial em produção no verify.
- Regra de split distinta entre sandbox e produção.
- Fluxo de token de webhook em modo dual quando não há `saleEnv` resolvido.

---

## 2) Contrato operacional atual do fluxo (matriz objetiva)

| Dimensão | Cenário | Regra atual | Origem da decisão |
|---|---|---|---|
| Ambiente | Início do checkout Asaas | `create-asaas-payment` resolve por host (`smartbusbr.com.br/www` => production; demais => sandbox) | `_shared/runtime-env.ts` + request host |
| Persistência de ambiente | Após criação da cobrança | Salva em `sales.payment_environment` | `create-asaas-payment` |
| Leitura de ambiente posterior | verify/platform-fee/webhook | Lê `sales.payment_environment` (webhook com fallback quando venda não encontrada) | `verify-payment-status`, `create-platform-fee-checkout`, `asaas-webhook` |
| Owner da cobrança | Venda pública em produção | `company` (cobrança com chave da empresa) | `create-asaas-payment` |
| Owner da cobrança | Venda pública em sandbox | `platform` (cobrança com chave sandbox da plataforma) | `create-asaas-payment` |
| Owner da cobrança | Taxa de plataforma | `platform` (`platform_fee_<sale_id>`) | `create-platform-fee-checkout` |
| Credencial efetiva | Create payment sandbox | `ASAAS_API_KEY_SANDBOX` (plataforma) | `runtime-env + create-asaas-payment` |
| Credencial efetiva | Create payment produção | `companies.asaas_api_key` | `create-asaas-payment` |
| Credencial efetiva | Verify sandbox | `ASAAS_API_KEY_SANDBOX` (plataforma) | `verify-payment-status` |
| Credencial efetiva | Verify produção | `companies.asaas_api_key`, fallback plataforma (legado) | `verify-payment-status` |
| Base URL | Sandbox | `https://sandbox.asaas.com/api/v3` | `_shared/runtime-env.ts` |
| Base URL | Produção | `https://api.asaas.com/v3` | `_shared/runtime-env.ts` |
| Split policy | Produção (venda pública) | Tenta split plataforma + parceiro ativo (se configurados) | `create-asaas-payment` |
| Split policy | Sandbox (venda pública) | Sem split | `create-asaas-payment` |
| Token webhook | Venda com ambiente conhecido | Valida token do ambiente da venda | `asaas-webhook` |
| Token webhook | Ambiente da venda desconhecido | Valida contra ambos (prod/sandbox) | `asaas-webhook` |
| Convergência status | Front + verify + webhook | Webhook e verify atualizam `sales`; frontend observa/polla e dispara verify manual/periódico | `Confirmation.tsx` + funções Asaas |
| Geração de tickets | Pós confirmação | Cria a partir de `sale_passengers` com idempotência; limpa `seat_locks` | `asaas-webhook` / `verify-payment-status` |

---

## 3) Mapa de decisão por função

## 3.1 `create-asaas-payment`
- Decide ambiente inicial por host.
- Define owner/credencial de cobrança.
- Decide split (produção) vs sem split (sandbox).
- Persiste `payment_environment` e IDs/status Asaas na venda.
- **Risco de ambiguidade**: dependência de host como gatilho inicial do ambiente.

## 3.2 `verify-payment-status`
- Lê venda e ambiente persistido.
- Resolve credencial para consulta da cobrança.
- Atualiza status da venda e aciona pós-confirmação (tickets/seat_locks/snapshot financeiro).
- **Risco de ambiguidade**: fallback de credencial em produção (company -> platform legado).

## 3.3 `asaas-webhook`
- Recebe evento e tenta resolver venda/ambiente.
- Valida token por ambiente da venda (ou dual-token fallback).
- Aplica transições de status + logs + pós-processamento.
- **Risco de ambiguidade**: quando `saleEnv` não é resolvido, validação aceita qualquer token válido (prod/sandbox).

## 3.4 `create-platform-fee-checkout`
- Lê ambiente da venda.
- Cobra taxa da plataforma com credencial da plataforma do ambiente.
- Mantém fluxo específico por `externalReference` (`platform_fee_...`).
- **Risco**: fluxo paralelo ao checkout principal (necessário, mas exige observabilidade forte).

## 3.5 `create-asaas-account`
- Resolve ambiente por host para onboarding.
- Executa modos `create`, `link_existing`, `revalidate`.
- Persiste dados de integração Asaas em `companies`.
- **Risco de ambiguidade**: mesma dependência de host para decidir ambiente de onboarding.

## 3.6 Frontend `Confirmation.tsx`
- Polling de status no banco + trigger periódico de verify.
- Botão manual para verify on-demand.
- Atualiza UI ao convergir para pago/cancelado.
- **Risco**: sincronização eventual entre webhook e verify (já mitigada com redundância).

---

## 4) Observabilidade implementada/ajustada

## 4.1 Padronização aplicada
- Novo helper compartilhado de observabilidade (`payment-observability.ts`), com payload estruturado e campos de correlação.
- Campos priorizados em logs:
  - `sale_id`, `company_id`
  - `payment_environment`
  - `payment_owner_type`
  - `asaas_base_url`
  - `api_key_source` / `api_key_secret_name`
  - `asaas_payment_id`, `external_reference`
  - tentativa de transição de status e desfecho

## 4.2 Como correlacionar ponta a ponta
1. Checkout dispara criação de cobrança (`create-asaas-payment`) e registra contexto de decisão.
2. Webhook e verify registram leitura de contexto + tentativa de transição.
3. Frontend (`Confirmation.tsx`) registra início/fim de verify manual e triggers do polling.
4. Estado final é auditável em `sales`, com trilha funcional em `sale_logs` e trilha técnica em `sale_integration_logs`.

## 4.3 O que não mudou intencionalmente
- Não houve alteração de regra central de owner da cobrança.
- Não houve mudança estrutural de banco.
- Não houve mudança do comportamento principal de produção.

---

## 5) Zonas cinzentas ainda existentes

1. **Dependência de host no ambiente inicial**
- Mantida neste step para evitar risco de comportamento.
- Planejamento: tratar no Step 2 (resolvedor único).

2. **Fallback de credencial no verify produção**
- Mantido por compatibilidade legada.
- Planejamento: Step 2 (centralização + flag), Step 5 (remoção controlada).

3. **Split diferente entre ambientes**
- Mantido neste step (sem alterar regra financeira).
- Planejamento: Step 4 (sandbox espelho).

4. **Webhook com validação dual de token quando ambiente é desconhecido**
- Mantido para robustez operacional atual.
- Planejamento: Step 2/4 após centralização de contexto e maior previsibilidade.

5. **Decisões distribuídas entre funções**
- Reduzido com observabilidade e comentários; não eliminado ainda.
- Planejamento: Step 2 (resolvedor único).

---

## 6) Ponte explícita para o Step 2

## 6.1 O que já ficou preparado
- Campos e nomenclatura consistentes de contexto de transação nos logs.
- Identificação explícita de `payment_owner_type`, `decision_origin`, `split_policy`.
- Comentários em pontos legados/fallback para orientar centralização posterior.

## 6.2 O que ainda precisa centralizar
- Resolução de ambiente/owner/credencial/base URL/token em um único resolvedor.
- Política explícita para fallback legado com prazo de desativação.
- Uniformização da matriz de decisão entre create/verify/webhook/platform-fee.

## 6.3 Melhores candidatos a virar resolvedor único (Step 2)
- `_shared/runtime-env.ts` (base URL + segredo por ambiente).
- Regras de credencial em `create-asaas-payment` e `verify-payment-status`.
- Regras de token/ambiente em `asaas-webhook`.

---

## 7) Resultado do Step 1

Step 1 concluído com foco em:
- contrato operacional explícito,
- observabilidade padronizada,
- redução de névoa operacional,
- preparação segura para o Step 2,
sem mudança arriscada de comportamento financeiro em produção.
