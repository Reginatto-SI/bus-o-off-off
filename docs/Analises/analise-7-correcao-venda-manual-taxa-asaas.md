# Análise 7 — Correção de convergência e duplicidade da taxa Asaas em venda manual

## 1) Diagnóstico confirmado

O diagnóstico da análise 6 foi confirmado em código:

- A venda manual usa cobrança separada (`platform_fee_payment_id`) e não usa `asaas_payment_id`.
- O fallback de `verify-payment-status` estava focado no fluxo principal (`asaas_payment_id`) e ignorava o caso manual com taxa pendente.
- `create-platform-fee-checkout` podia criar nova cobrança sem validar adequadamente cobrança existente já paga/pendente da mesma venda.

Resultado prático antes da correção:
- pagamento real no Asaas podia não convergir para `sales.status = pago`;
- `platform_fee_status` permanecia `pending` localmente;
- o sistema aceitava nova tentativa de cobrança, abrindo espaço para duplicidade.

---

## 2) Arquivos alterados

1. `supabase/functions/verify-payment-status/index.ts`
2. `supabase/functions/create-platform-fee-checkout/index.ts`

---

## 3) Como o fallback foi implementado

### Em `verify-payment-status`

Foi adicionada uma branch de fallback mínimo para taxa manual, executada quando:

- `asaas_payment_id` ausente;
- `platform_fee_payment_id` presente;
- `platform_fee_status` em `pending` ou `failed`;
- `sale_origin` administrativo/manual (quando informado).

Fluxo implementado:
1. Resolve ambiente/API key via `resolvePaymentContext` (mantendo regra de ambiente explícito).
2. Consulta Asaas em `/payments/{platform_fee_payment_id}`.
3. Se status Asaas confirmatório (`CONFIRMED`, `RECEIVED`, `RECEIVED_IN_CASH`):
   - atualiza `platform_fee_status = paid`;
   - atualiza `platform_fee_paid_at`;
   - atualiza `payment_confirmed_at`;
   - promove `status` para `pago` se ainda estiver `reservado`;
   - registra `sale_logs` via `logSaleOperationalEvent`;
   - registra `sale_integration_logs` via `persistVerifyLog`.
4. Se não confirmado, mantém fallback degradado com logs de divergência e sem criar cobrança.

Importante:
- Webhook continua prioritário.
- Verify permanece fallback de convergência, sem substituir webhook.

---

## 4) Como a duplicidade foi bloqueada

### Em `create-platform-fee-checkout`

Antes de criar nova cobrança, agora há validação idempotente:

1. Se `platform_fee_status = paid`:
   - bloqueia nova cobrança;
   - retorna resposta informativa (`already_paid`).

2. Se existe `platform_fee_payment_id`:
   - consulta o pagamento no Asaas;
   - se já pago, converge localmente (paid + timestamps + status `pago` quando aplicável) e não cria nova cobrança;
   - se pendente/risk-analysis, reutiliza cobrança existente e retorna URL;
   - se status terminal (cancelado/expirado/falha/reversão), registra trilha e permite nova cobrança.

3. Se não existe `platform_fee_payment_id`:
   - busca opcional por `externalReference = platform_fee_<sale_id>`;
   - reaproveita ou converge quando possível;
   - só cria cobrança nova quando não houver cobrança ativa/paga válida.

Esse bloqueio reduz o risco de segundo pagamento para a mesma venda quando a primeira cobrança já existe.

---

## 5) O que não foi alterado

- Não houve alteração no fluxo de venda online (`create-asaas-payment`).
- Não houve alteração de split da venda online.
- Não houve criação de nova arquitetura, fila ou processamento assíncrono.
- Não houve alteração de UI.
- Não foi feita regularização manual da venda SB-000114 nesta tarefa.

---

## 6) Riscos remanescentes

1. Dependência da disponibilidade da API Asaas para verificação idempotente em tempo real.
2. Possíveis diferenças de semântica de status do Asaas em cenários raros/novos status não mapeados.
3. Vendas legadas com dados incompletos podem cair em retorno degradado (com log), exigindo triagem operacional.

Mitigações já aplicadas:
- logs operacionais e de integração explícitos nos pontos críticos;
- bloqueio conservador quando cobrança existente não é verificável (evita duplicidade por incerteza);
- escopo limitado ao fluxo manual de taxa da plataforma.

---

## 7) Plano seguro para regularizar SB-000114 depois da correção

Sem executar update manual nesta tarefa, plano recomendado pós-deploy:

1. Reexecutar `verify-payment-status` para a venda alvo e validar convergência automática pelo novo fallback manual.
2. Conferir `sales`:
   - `platform_fee_status`, `platform_fee_paid_at`, `payment_confirmed_at`, `status`, `platform_fee_payment_id`.
3. Conferir `sale_logs` e `sale_integration_logs` da venda para trilha de convergência.
4. Confirmar no Asaas os pagamentos vinculados a `externalReference = platform_fee_<sale_id>`.
5. Tratar financeiramente a cobrança duplicada em processo operacional (sem apagar histórico técnico).

---

## Conclusão

A correção aplicada é mínima e focada:
- adiciona fallback real para convergência de taxa manual paga fora do webhook;
- adiciona idempotência na criação da cobrança de taxa manual;
- mantém webhook como fonte prioritária e não interfere no fluxo online.
