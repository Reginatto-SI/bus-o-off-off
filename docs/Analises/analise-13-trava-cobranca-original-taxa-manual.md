# Análise 13 — Trava da cobrança original da taxa manual (Asaas)

## Contexto do incidente

Venda analisada:
- `sales.id`: `351151a0-dfb3-4aa8-ae88-40cccacea2f57`
- `platform_fee_payment_id`: `pay_p8p4jq7l1m0k25d8`
- `platform_fee_status`: `pending`
- ambiente: `production`

Sintoma reportado: ao clicar em **Consultar taxa**, o fluxo ainda permitia abrir/caminhar para cobrança diferente no Asaas em alguns cenários, criando risco de troca de vínculo da cobrança original.

---

## 1) Causa da troca/criação de novos links

A causa raiz estava na combinação de duas permissões perigosas no backend:

1. `create-platform-fee-checkout` fazia busca por `externalReference` mesmo quando já havia `platform_fee_payment_id` preenchido.
2. Se encontrasse outra cobrança por `externalReference`, o fluxo podia atualizar `sales.platform_fee_payment_id` para outro ID.
3. Em status terminal da cobrança existente, o fluxo ainda permitia criação de nova cobrança automaticamente.

Resultado: comportamento incompatível com a regra de imutabilidade do vínculo original da taxa manual.

---

## 2) Arquivos alterados

- `supabase/functions/create-platform-fee-checkout/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `src/lib/platformFeeCheckout.ts`
- `src/pages/admin/Sales.tsx`

---

## 3) Regra de imutabilidade aplicada

### Backend (`create-platform-fee-checkout`)

- Se `platform_fee_payment_id` estiver preenchido:
  - consulta **somente** `/payments/{platform_fee_payment_id}`;
  - não busca por `externalReference` para trocar vínculo;
  - não sobrescreve `platform_fee_payment_id`;
  - se status terminal/inválido/não encontrado, responde bloqueio `409` com:
    - `error_code = existing_platform_fee_terminal_requires_admin_action`
    - mensagem exigindo ação administrativa explícita para nova cobrança.

- Busca por `externalReference` permanece apenas quando `platform_fee_payment_id` está vazio.

- Criação de nova cobrança permanece possível apenas quando não há vínculo local e não há cobrança reaproveitável encontrada.

### Verify (`verify-payment-status`)

- No fallback manual de taxa, a convergência para pago mantém o mesmo `platform_fee_payment_id` já salvo.
- O verify não troca ID de cobrança da taxa.

### Frontend (`Sales` + `platformFeeCheckout`)

- Reprocessar taxa com `platform_fee_payment_id` agora só consulta/reabre cobrança vinculada e não cai em criação automática.
- “Gerar/Pagar taxa” também consulta cobrança existente se já houver vínculo, evitando gatilho de nova geração por acidente.
- Mensagem operacional específica para status terminal com necessidade de ação administrativa explícita.

---

## 4) Confirmação: Consultar taxa não cria cobrança

Com a trava aplicada:

- A ação de consulta usa `mode=consult_only` e só chama backend para checar/reabrir a cobrança vinculada.
- Se existe `platform_fee_payment_id`, o backend consulta exclusivamente esse ID.
- Se não existe vínculo reaproveitável, retorna bloqueio (não cria cobrança nova).

---

## 5) Confirmação: `platform_fee_payment_id` não é sobrescrito

- Removido o caminho que atualizava `platform_fee_payment_id` para ID encontrado por `externalReference` quando já havia vínculo original.
- No verify manual, removida atualização de `platform_fee_payment_id` a partir da resposta do Asaas.
- Em criação nova, a gravação do ID agora usa guarda de corrida (`is('platform_fee_payment_id', null)`) para evitar sobrescrita concorrente.

---

## 6) Testes manuais recomendados (obrigatórios)

### Cenário alvo (produção)

Venda: `351151a0-dfb3-4aa8-ae88-40cccacea2f57`
ID original esperado: `pay_p8p4jq7l1m0k25d8`

Executar:

1. Abrir `/admin/vendas` e localizar a venda.
2. Clicar **Consultar taxa** 3 vezes.
3. Em cada tentativa, validar que o link aberto é sempre da cobrança `pay_p8p4jq7l1m0k25d8`.
4. No Asaas, validar que **nenhuma nova cobrança** foi criada para essa venda.
5. No banco (`sales`), validar que `platform_fee_payment_id` permanece `pay_p8p4jq7l1m0k25d8`.
6. Se o pagamento desse ID ainda não estiver confirmado, a venda deve permanecer pendente (`reservado` + `platform_fee_status` pendente/failed conforme estado local).

Consulta SQL de apoio:

```sql
select id, status, platform_fee_status, platform_fee_payment_id, payment_environment, platform_fee_paid_at, payment_confirmed_at
from public.sales
where id = '351151a0-dfb3-4aa8-ae88-40cccacea2f57';
```

Consulta de trilha técnica:

```sql
select created_at, direction, event_type, payment_id, external_reference, http_status, processing_status, result_category, warning_code, incident_code, message
from public.sale_integration_logs
where sale_id = '351151a0-dfb3-4aa8-ae88-40cccacea2f57'
  and provider = 'asaas'
order by created_at desc;
```

---

## Riscos e impacto

- Impacto intencional: deixa de criar cobrança automática em casos terminal/inválido quando já existe vínculo.
- Benefício: elimina troca silenciosa de cobrança original e bloqueia duplicidade operacional.
- Escopo preservado: não altera venda online, split, RLS, telas novas ou regularização manual.
