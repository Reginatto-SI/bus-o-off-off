# Análise 6 — Venda manual com taxa Asaas paga e venda não liberada

## 1) Diagnóstico do problema

### Sintoma observado (produção)
- Venda manual criada em `/admin/vendas` permaneceu com status **`reservado`** mesmo após pagamento da taxa da plataforma no Asaas.
- Houve novo pagamento da taxa para a mesma venda (duplicidade financeira real).
- Caso reportado: **evento Pedro Leopoldo Rodeio Show**, passagem **SB-000114**, fatura Asaas **794852267**, valor **R$ 5,08**.

### Causa provável (com base no código atual)
A cadeia de confirmação da **taxa da plataforma** em venda manual depende fortemente do webhook (`asaas-webhook`) e não possui fallback equivalente ao fluxo principal de cobrança da venda online:

1. A cobrança manual grava em `sales.platform_fee_payment_id` (não em `sales.asaas_payment_id`).
2. O fallback `verify-payment-status` só consulta Asaas quando existe `sales.asaas_payment_id`.
3. Se o webhook não convergir (token, ambiente, atraso, rejeição, ausência), a venda pode ficar presa em `platform_fee_status = pending` + `status = reservado`.
4. Como `create-platform-fee-checkout` só valida status local `pending`, ele pode criar **nova cobrança** para a mesma venda.

Resultado: pagamento real no Asaas sem convergência local, seguido de segunda cobrança.

---

## 2) Evidências no código

## 2.1 `create-platform-fee-checkout`
- Cria cobrança da taxa com `externalReference: platform_fee_${sale.id}`.
- Persiste somente `platform_fee_payment_id` na venda.
- Não executa busca/reattach de cobrança existente por `externalReference` antes de criar outra.
- Condição de entrada baseada em `platform_fee_status === 'pending'` local.

## 2.2 `asaas-webhook`
- Reconhece fluxo de taxa manual quando `externalReference` começa com `platform_fee_`.
- Remove prefixo e usa o UUID da venda para processar.
- Em confirmação (`PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`), atualiza:
  - `platform_fee_status = 'paid'`
  - `platform_fee_paid_at = confirmedAt`
  - `platform_fee_payment_id = payment.id`
  - `status = 'pago'` quando a venda está `reservado`
  - `payment_confirmed_at = confirmedAt`
- Update protegido por `.in('platform_fee_status', ['pending', 'failed'])`.

## 2.3 `verify-payment-status`
- Seleciona e trabalha com `asaas_payment_id` (fluxo principal de cobrança).
- Se `asaas_payment_id` estiver ausente, retorna sem consulta externa (`missing_asaas_payment_id`).
- Não usa `platform_fee_payment_id` para validar/confirmar taxa manual pendente.

## 2.4 `reconcile-sale-payment`
- Atua para reconciliação de inconsistência de venda **já paga** (ex.: paga sem ticket).
- Venda em `reservado` é considerada `not_eligible`.
- Logo, não resolve caso “taxa manual paga no Asaas, mas venda ainda reservada”.

## 2.5 `/admin/vendas`
- A ação “Pagar Taxa” aparece quando `platform_fee_status` está `pending` ou `failed`.
- Fluxo chama `create-platform-fee-checkout` diretamente.
- Sem convergência local da primeira cobrança, a UI mantém opção de pagar novamente.

---

## 3) Fluxo atual da venda manual (como está)

1. `NewSaleModal` cria venda manual com:
   - `status = reservado`
   - `sale_origin = admin_manual`
   - `platform_fee_status = pending` (quando há taxa)
   - `payment_environment` explícito.
2. `/admin/vendas` aciona `create-platform-fee-checkout`.
3. Edge cria cobrança Asaas com `externalReference = platform_fee_<sale_id>` e salva `platform_fee_payment_id`.
4. Após pagamento, `asaas-webhook` deveria atualizar a venda para `pago`.
5. Se webhook não convergir, não há fallback equivalente ao verify principal para `platform_fee_payment_id`.

---

## 4) Onde o pagamento se perdeu

Ponto de perda provável: **entre o pagamento no Asaas e a convergência local da venda via webhook**.

O desenho atual tem assimetria:
- fluxo principal (online): webhook + `verify-payment-status` (fallback).
- fluxo taxa manual: webhook como caminho prático principal, sem fallback equivalente usando `platform_fee_payment_id`.

Se o webhook não processar aquele evento com sucesso, o banco permanece com taxa pendente/reserva, apesar do pagamento existir no gateway.

---

## 5) Por que houve pagamento duplicado

Porque o sistema permite abrir nova cobrança quando o estado local segue pendente:

- `create-platform-fee-checkout` **não impede** nova cobrança com base em “já existe cobrança paga no Asaas para esta venda”.
- Não há reuso obrigatório de `platform_fee_payment_id` existente nem busca prévia por `externalReference`.
- A regra de bloqueio depende só de `platform_fee_status` no banco local.
- Sem webhook/fallback, esse campo permanece `pending`, habilitando novo pagamento.

---

## 6) Respostas objetivas às 10 perguntas

1. **A cobrança da taxa manual usa `externalReference` com qual padrão?**  
   `platform_fee_<sale.id>`.

2. **O webhook reconhece esse padrão?**  
   Sim. Identifica prefixo `platform_fee_`, extrai `sale_id` e direciona para `processPlatformFeeWebhook`.

3. **Quando a taxa manual é paga, qual função deveria marcar a venda como liberada/paga?**  
   `processPlatformFeeWebhook` dentro de `asaas-webhook`.

4. **O fluxo de venda manual usa `finalizeConfirmedPayment` ou possui lógica separada?**  
   Lógica separada para taxa manual. `finalizeConfirmedPayment` é usado no fluxo principal (webhook/verify de `asaas_payment_id`).

5. **O pagamento da taxa manual atualiza `platform_fee_paid_at`?**  
   Sim, quando webhook processa confirmação com sucesso.

6. **O status da venda deveria mudar de `reservado` para `pago` automaticamente?**  
   Sim. No webhook de taxa manual existe update explícito `status: sale.status === 'reservado' ? 'pago' : sale.status`.

7. **O sistema permite gerar segunda cobrança da taxa para a mesma venda? Se sim, por quê?**  
   Sim. Porque a criação depende de `platform_fee_status` local e não valida pagamento já confirmado no Asaas por `externalReference`/`platform_fee_payment_id` antes de criar nova cobrança.

8. **Existe trava para impedir pagamento duplicado da taxa da plataforma?**  
   Não há trava robusta end-to-end. Há apenas guarda local por `platform_fee_status`; sem convergência do webhook, a guarda falha operacionalmente.

9. **Os últimos ajustes de snapshot/persistência cobrem esse fluxo ou só o fluxo principal de venda online?**  
   Cobertura principal foi no fluxo online (`create-asaas-payment`, `asaas-webhook` de cobrança principal, `verify-payment-status`, `payment-finalization`), não no fallback específico de taxa manual em `create-platform-fee-checkout` + `platform_fee_payment_id`.

10. **Qual correção mínima evita que isso aconteça novamente?**  
   Correção mínima em duas frentes, sem refatoração ampla:
   - **Convergência:** estender `verify-payment-status` (ou função dedicada mínima) para consultar Asaas via `platform_fee_payment_id` quando `asaas_payment_id` for nulo e `platform_fee_status` estiver `pending/failed`, aplicando a mesma confirmação do webhook de taxa manual.
   - **Anti-duplicidade:** antes de criar nova cobrança em `create-platform-fee-checkout`, tentar reutilizar cobrança pendente/confirmada existente (por `platform_fee_payment_id` e/ou busca por `externalReference`) e bloquear nova criação quando já houver quitação.

---

## 7) Correção mínima recomendada

Sem alterar arquitetura, apenas blindagem localizada:

1. **Fallback operacional para taxa manual**
   - Reaproveitar lógica de confirmação de taxa manual fora do webhook (em verify ou helper comum).
   - Gatilho: `asaas_payment_id` ausente + `platform_fee_payment_id` presente + `platform_fee_status in ('pending','failed')`.

2. **Idempotência de criação da taxa manual**
   - Em `create-platform-fee-checkout`, consultar cobrança já vinculada antes de criar nova.
   - Se já confirmada no Asaas: convergir venda local e retornar sucesso informativo.
   - Se ainda pendente: retornar URL da cobrança existente, sem criar outra.

3. **Log operacional explícito de risco de duplicidade**
   - Registrar incidente quando houver tentativa de criar segunda cobrança para mesma venda com `platform_fee_status` local divergente do gateway.

---

## 8) Risco da correção

### Baixo a moderado (quando limitada ao fluxo manual)
- **Baixo** risco sobre venda online se a condição de ativação exigir `asaas_payment_id IS NULL` e `platform_fee_payment_id IS NOT NULL`.
- **Moderado** risco de regressão se misturar lógica manual e online sem feature guard por campos da própria venda.

Mitigação:
- Manter branch explícita para origem manual (`sale_origin` admin/seller) e cobrança de taxa separada.
- Não alterar regras de `create-asaas-payment`/split online.

---

## 9) Plano para corrigir a venda SB-000114 com segurança (produção)

### Objetivo
Regularizar a venda sem gerar terceiro pagamento e sem quebrar trilha de auditoria.

### Passo a passo recomendado
1. **Congelar nova cobrança** da venda SB-000114 (não clicar novamente em “Pagar Taxa”).
2. **Auditar `sales`** da venda:
   - `status`, `platform_fee_status`, `platform_fee_paid_at`, `platform_fee_payment_id`, `payment_confirmed_at`, `sale_origin`, `payment_environment`.
3. **Auditar logs de integração** (`sale_integration_logs`) por `sale_id` e por payment id conhecido.
4. **No Asaas**, confirmar linha temporal da fatura 794852267:
   - payment id, status, data de confirmação, externalReference, ambiente.
5. **Se pagamento confirmado e venda ainda reservada**:
   - aplicar atualização pontual e guardada (com `WHERE id = sale_id AND platform_fee_status IN ('pending','failed')`) para:
     - `platform_fee_status = 'paid'`
     - `platform_fee_paid_at = confirmedAt`
     - `payment_confirmed_at = confirmedAt`
     - `status = 'pago'` (se ainda `reservado`)
   - inserir `sale_logs` + `sale_integration_logs` com motivo de reparo e referência da fatura.
6. **Verificar emissão de tickets** da venda após convergência.
7. **Registrar incidente de duplicidade** para tratativa financeira (segunda cobrança já paga).

---

## 10) O que não deve ser feito manualmente

- Não marcar venda como `pago` sem registrar `platform_fee_status='paid'` e timestamps coerentes.
- Não apagar logs (`sale_logs`, `sale_integration_logs`) para “limpar histórico”.
- Não sobrescrever `platform_fee_payment_id` sem auditoria da cobrança anterior.
- Não executar reconciliação em lote sem filtro da venda alvo.
- Não alterar dados de ambiente (`payment_environment`) da venda já emitida/paga sem evidência formal.

---

## 11) A correção pode ser aplicada sem afetar venda online?

**Sim, pode**, desde que o escopo fique estritamente condicionado ao fluxo manual de taxa separada:
- venda com `asaas_payment_id` nulo,
- cobrança separada em `platform_fee_payment_id`,
- origem administrativa/manual.

Assim, o fluxo online principal (checkout público + `create-asaas-payment` + snapshot/split) permanece intacto.

---

## 12) Conclusão

A causa-raiz mais provável do caso é **lacuna de convergência no fluxo de taxa manual quando webhook falha/não converge**, combinada com **ausência de idempotência robusta na criação de nova cobrança da taxa**.

O sistema já possui trilha e mecanismos maduros para fluxo online, mas o fluxo manual ainda depende de reforço mínimo específico para evitar repetição do incidente observado em produção.
