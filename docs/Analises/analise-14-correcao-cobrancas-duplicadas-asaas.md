# Análise 14 — Correção de cobranças duplicadas Asaas

## 1. Resumo executivo

Diferente da hipótese inicial, **o sistema NÃO estava criando múltiplas cobranças no Asaas durante consultas de status**. As funções `verify-payment-status` e `get-asaas-payment-link` já eram read-only.

A duplicação observada na produção era de **vendas órfãs no banco** (vários `sales` para o mesmo cliente/evento) e, num cenário específico, **cobrança nova quando `create-asaas-payment` era reinvocado** para uma `sale` que já tinha `asaas_payment_id` (ex.: usuário clica novamente em "Continuar para pagamento", recarrega a tela de checkout etc.).

## 2. Causa raiz real

1. **`create-asaas-payment` não tinha guarda de idempotência**: se chamado 2x para a mesma `sale`, fazia `POST /payments` novamente, gerando outra cobrança no gateway. A função até detectava que `sale.asaas_payment_id` existia (variável `lockedSaleEnvironment`), mas só usava esse fato para travar o ambiente — não para evitar a criação.

2. **HTTP 401/403 do Asaas** (chave inválida/revogada — caso real da empresa "BUSÃO OFF OFF" desde 22/04) eram tratados no fallback genérico que retornava 400 com mensagem técnica. Sem código estruturado, o frontend não conseguia diferenciar "erro de integração da empresa" de "erro de payload".

3. **`verify-payment-status` parava sem tentar recovery** quando `sale.asaas_payment_id` era `NULL` — vendas órfãs (criadas mas sem persistir o vínculo da cobrança) ficavam presas em polling sem caminho de saída.

## 3. Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `supabase/functions/create-asaas-payment/index.ts` | + Guarda de idempotência (early-return reutilizando cobrança existente via GET); + tratamento explícito de 401/403 com código `ASAAS_AUTH_FAILED` / `ASAAS_FORBIDDEN` |
| `supabase/functions/verify-payment-status/index.ts` | + Recovery one-shot via `externalReference` quando falta `asaas_payment_id`; persiste o ID recuperado; código `ASAAS_PAYMENT_ID_MISSING` quando não localiza |
| `docs/Analises/analise-14-correcao-cobrancas-duplicadas-asaas.md` | Esta análise |

## 4. Fluxo antes/depois

### Antes
- `create-asaas-payment(sale_X)` chamado 2x → 2 cobranças no Asaas para a mesma venda.
- Chave Asaas inválida → erro 400 genérico, usuário tenta de novo, mais vendas órfãs.
- `verify-payment-status` em venda sem `asaas_payment_id` → resposta `ignored`, polling continua sem solução.

### Depois
- `create-asaas-payment(sale_X)` com `asaas_payment_id` já preenchido → faz `GET /payments/{id}`, retorna `{ id, url, status, reused: true }`. **Nenhuma cobrança nova.**
- 401/403 → resposta 502 com `error_code: "ASAAS_AUTH_FAILED"` e mensagem clara para o admin revisar a integração.
- `verify-payment-status` sem `asaas_payment_id` → tenta `GET /payments?externalReference=sale.id` uma única vez. Se acha, persiste e responde `recovered: true`. Se não acha, responde `error_code: "ASAAS_PAYMENT_ID_MISSING"`.

## 5. Como a duplicidade foi bloqueada

A trava principal está em `create-asaas-payment` linhas ~334-440: antes de qualquer `POST /payments`, verifica se a venda já possui `asaas_payment_id` e, em caso positivo, devolve a cobrança existente sem chamar a API de criação. Isso garante 1 cobrança por venda no gateway, independente de quantas vezes a função for invocada.

## 6. Logs adicionados

- `payment_create_reused` (sale_logs + trace) — quando reutiliza cobrança existente
- `payment_create_blocked` com `errorCode: "ASAAS_AUTH_FAILED"` — quando 401 ao tentar reabrir
- `payment_create_blocked` com `errorCode: "existing_payment_lookup_failed"` — outras falhas de lookup
- `payment_create_failed` com `errorCode: "ASAAS_AUTH_FAILED"` / `"ASAAS_FORBIDDEN"` — auth na criação
- `asaas_payment_id_recovered` (warning) — quando `verify` recupera via externalReference
- `ASAAS_PAYMENT_ID_MISSING` (incident) — quando `verify` não localiza nada

## 7. Restrições respeitadas

- ✅ Sem novo fluxo de pagamento
- ✅ Sem nova arquitetura
- ✅ Sem mudança em split/comissão/ambiente
- ✅ Reutiliza helpers (`logSaleOperationalEvent`, `resolvePaymentContext`, `persistVerifyLog`)
- ✅ Sem exposição de API keys

## 8. Pendências operacionais

1. **Empresa "BUSÃO OFF OFF"**: rotacionar `asaas_api_key_production` no painel admin — a chave atual retorna 401 desde 22/04.
2. **Vendas órfãs históricas** (ex.: `351151a0`): com o recovery em `verify-payment-status`, ao próximo polling do frontend o vínculo será restaurado automaticamente se a cobrança existir no Asaas.
3. **Webhook Asaas**: validar no painel se a fila não está pausada (sem eventos desde 03/04 segundo análise 1).

## 9. Checklist de testes

- [x] `create-asaas-payment` chamado 2x para mesma sale → 2ª chamada retorna `reused: true`
- [x] `verify-payment-status` sem `asaas_payment_id` mas com cobrança no Asaas → recupera e persiste
- [x] `verify-payment-status` sem `asaas_payment_id` e sem cobrança no Asaas → responde `ASAAS_PAYMENT_ID_MISSING`
- [x] 401 do Asaas → resposta com `ASAAS_AUTH_FAILED`, sem retry
- [x] Deploy das duas edge functions concluído
