# Análise 1 — Reabrir cobrança na confirmação de pagamento

## 1. Resumo executivo
O botão **“Reabrir cobrança”** falhava por uma causa de backend determinística: a edge function `get-asaas-payment-link` chamava o resolvedor de contexto de pagamento (`resolvePaymentContext`) com **assinatura incorreta**. Com isso, o ambiente de pagamento não era resolvido e a função caía em erro, impedindo a busca da cobrança no Asaas.

A correção aplicada foi mínima e segura: ajustar a chamada para o formato oficial já usado pelas funções principais (`create-asaas-payment`, `verify-payment-status`, `asaas-webhook`), sem criar fluxo paralelo e sem recriar cobrança.

---

## 2. Fluxo atual mapeado

### 2.1 Como a venda é criada
- O checkout cria a venda em `sales` e mantém `company_id` e `payment_environment` na venda.
- A venda segue com status inicial de reserva/pendência até confirmação.

### 2.2 Como a cobrança é criada
- A edge function `supabase/functions/create-asaas-payment/index.ts` cria a cobrança no Asaas com `externalReference = sale.id`.
- Após sucesso, persiste na venda:
  - `asaas_payment_id`
  - `asaas_payment_status`
  - `payment_method`
  - `payment_environment`
- O retorno para o frontend inclui `url: paymentData.invoiceUrl`.

### 2.3 Onde IDs/links são persistidos
- Persistido em `sales`: `asaas_payment_id` e status correlatos.
- **Não há persistência de `invoice_url` em `sales`** no fluxo atual; para reabrir, a estratégia oficial atual é reconsultar o Asaas por `asaas_payment_id`.

### 2.4 Como a tela de confirmação carrega dados
- `src/pages/public/Confirmation.tsx` carrega a venda com `select('*')`, incluindo `status`, `company_id`, `payment_environment` e `asaas_payment_id`.
- O botão “Reabrir cobrança” só é exibido quando:
  - estado aguardando pagamento (`pendente_pagamento` ou `reservado` com `payment=success`), e
  - `sale.asaas_payment_id` está presente.

### 2.5 Como o botão tentava agir antes
- `Confirmation.tsx` chamava `supabase.functions.invoke('get-asaas-payment-link', { sale_id })`.
- A edge function buscava `sales` por `id`, validava status e tentava consultar `GET /payments/{asaas_payment_id}` no Asaas.
- Porém, antes da consulta ao Asaas, a resolução de contexto falhava por uso incorreto do helper (causa raiz abaixo).

---

## 3. Causa raiz

### Causa raiz real
No arquivo `supabase/functions/get-asaas-payment-link/index.ts`, a chamada estava assim (conceitualmente):
- `resolvePaymentContext(sale.payment_environment, { ...companyKeys })`

Mas o helper `resolvePaymentContext` (em `supabase/functions/_shared/payment-context-resolver.ts`) aceita **um único objeto**:
- `resolvePaymentContext({ mode, sale, company, ... })`

Consequência prática:
- o parâmetro recebido era inválido;
- o helper não encontrava `sale.payment_environment` no formato esperado;
- lançava erro de `payment_environment_unresolved`;
- a função retornava falha e o frontend exibia a mensagem genérica “Não foi possível localizar a cobrança...”.

### Classificação do problema
- **Edge function (principal):** sim (causa raiz).
- **Frontend:** parcialmente (UX exibia erro genérico sem diferenciar motivos já retornados pela API).
- **Persistência:** não é a causa principal deste bug específico.
- **Resolução de ambiente:** sim, impactada diretamente pela chamada incorreta.
- **Webhook vs fallback:** sem divergência causal neste bug; o problema ocorre antes.

---

## 4. Correção aplicada

### Arquivos alterados
1. `supabase/functions/get-asaas-payment-link/index.ts`
2. `src/pages/public/Confirmation.tsx`

### Ajustes realizados

#### 4.1 `get-asaas-payment-link` (edge function)
- Corrigida a chamada de `resolvePaymentContext` para o contrato oficial:
  - `mode: "verify"`
  - `sale.payment_environment`
  - chaves da empresa por ambiente
- Mantida a mesma estratégia funcional do sistema:
  - reutilizar cobrança existente (`asaas_payment_id`)
  - consultar pagamento no Asaas
  - retornar `invoiceUrl` existente
  - **sem recriar cobrança**
- Melhorada observabilidade com logs objetivos:
  - `reopen_requested`
  - `reopen_resolved`
  - presença de `asaas_payment_id`
  - presença de `invoice_url`
  - `sale_id`, `company_id`, `payment_environment`
- Diferenciado `reason` para 404 no gateway (`payment_not_found_on_gateway`) versus erro genérico de consulta (`payment_fetch_failed`).

#### 4.2 `Confirmation.tsx` (frontend)
- Sem criar novo fluxo de pagamento.
- Mantida invocação da edge function existente.
- Melhorada UX de erro com mapeamento por `reason` retornado pela função (mensagens específicas para:
  - `missing_asaas_payment_id`
  - `missing_company_asaas_api_key`
  - `payment_not_found_on_gateway`
  - `missing_invoice_url`
  - status não reabrível etc.).
- Adicionados logs de suporte no frontend para tentativa e falha de reabertura.

---

## 5. Riscos avaliados

1. **Risco de quebrar checkout atual:** baixo.
   - Não houve alteração em `create-asaas-payment` nem no fluxo de criação.
2. **Risco de divergência sandbox/produção:** baixo.
   - A função passou a usar o mesmo resolvedor oficial com `payment_environment` da venda.
3. **Risco de duplicidade de cobrança:** baixo.
   - Fluxo continua somente leitura da cobrança existente (`GET /payments/{id}`), sem criação.
4. **Risco de multiempresa:** baixo.
   - Mantém lookup por `sale_id` e uso de `company_id` da própria venda para credenciais.

A mudança escolhida é a mais segura por ser localizada, reversível e alinhada ao padrão já consolidado nas funções oficiais.

---

## 6. Checklist de validação

> Observação: checklist abaixo é de validação prática em ambiente (não executada neste diagnóstico por inspeção estática).

- [ ] Venda pendente com cobrança existente (`asaas_payment_id` preenchido) retorna `url` e abre cobrança.
- [ ] Usuário fecha a aba do Asaas e depois clica em **Reabrir cobrança**; link reabre corretamente.
- [ ] Botão **Atualizar status do pagamento** continua funcionando via `verify-payment-status`.
- [ ] Webhook continua como fonte de verdade para confirmação automática.
- [ ] Fluxo validado em **sandbox** com credenciais sandbox.
- [ ] Fluxo validado em **produção** com credenciais produção.
- [ ] Venda sem `invoice_url` no payload do Asaas retorna mensagem específica (sem crash).
- [ ] Venda histórica/legada sem `asaas_payment_id` retorna orientação específica.
- [ ] Cenário de cobrança inexistente no Asaas (404) retorna mensagem específica.

---

## 7. Resultado final

Com a correção aplicada:
- **Sim**, o botão passou a usar o contexto correto para localizar/reabrir a cobrança existente.
- **Sim**, o status da venda permanece íntegro (ação de reabrir não finaliza pagamento).
- **Sim**, ambiente e empresa corretos são respeitados via dados da venda + configuração da empresa.
- **Sim**, não há criação de nova cobrança nesse fluxo (sem duplicidade).

## Incertezas e limites conhecidos
- O fluxo continua dependente de `asaas_payment_id` para reabertura. Vendas legadas sem esse campo seguem não reabríveis por este caminho (com mensagem agora mais clara).
- Não foi introduzido fallback por `externalReference` para recuperar `payment_id` porque isso ampliaria escopo e contrato do fluxo atual.
