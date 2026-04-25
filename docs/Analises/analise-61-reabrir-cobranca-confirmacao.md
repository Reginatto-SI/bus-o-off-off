# Análise 61 — Reabrir cobrança Asaas na confirmação de pagamento

## Resumo executivo
Implementamos uma melhoria mínima na tela pública de confirmação para permitir que o usuário reabra a **mesma cobrança Asaas existente** durante estados de pagamento pendente. A solução não recria cobrança, não altera fluxo de checkout e preserva o comportamento atual da venda.

## Diagnóstico
1. **Tela real do pós-compra**
   - A tela pública exibida após a compra está em `src/pages/public/Confirmation.tsx` (rota `/confirmacao/:id`).
   - O botão existente **“Atualizar status do pagamento”** já estava nessa tela, nos estados de aguardando confirmação/processamento.

2. **Origem do link da cobrança**
   - A função `create-asaas-payment` retorna `paymentData.invoiceUrl` na criação da cobrança.
   - O banco (tabela `sales`) mantém `asaas_payment_id`, mas não persistia URL pública da cobrança.
   - Portanto, para reabrir cobrança de forma confiável após recarregar a página, é necessário consultar o Asaas pelo `asaas_payment_id`.

3. **Status de venda e exibição no frontend**
   - O frontend já usa `sale.status` (`pendente_pagamento`, `reservado`, `pago`, `cancelado`) para definir a UX na confirmação.
   - Ação de reabrir cobrança só faz sentido operacional em estado pendente/reservado com cobrança vinculada (`asaas_payment_id`).

4. **Diferença entre PIX/boleto/cartão**
   - A consulta da cobrança reaproveita o payload do Asaas e retorna `invoiceUrl` independente de `billingType`.
   - O retorno também inclui `billingType` para rastreabilidade, sem criar comportamento paralelo por método de pagamento.

## Arquivos alterados
- `src/pages/public/Confirmation.tsx`
- `supabase/functions/get-asaas-payment-link/index.ts`
- `analise-61-reabrir-cobranca-confirmacao.md`

## Regra funcional implementada
- Novo botão **“Reabrir cobrança”** ao lado de **“Atualizar status do pagamento”** na tela pública de confirmação.
- Ao clicar, o frontend chama edge function dedicada (`get-asaas-payment-link`) e abre a URL retornada em nova aba com `window.open(url, '_blank', 'noopener,noreferrer')`.
- A edge function:
  - valida `sale_id`;
  - lê `sales.asaas_payment_id` e `payment_environment`;
  - resolve credenciais por ambiente com utilitário já existente (`resolvePaymentContext`);
  - consulta a cobrança existente no Asaas (`/payments/{asaas_payment_id}`);
  - retorna `url` da cobrança sem alterar status da venda.

## Tratamento de indisponibilidade
- Se não houver cobrança reabrível na venda pendente, o botão **Reabrir cobrança** não é exibido (UX sem ruído passivo).
- Se a função não retornar URL após tentativa real (falha de consulta, ausência de link, etc.), exibimos toast claro orientando atualizar status ou refazer acesso pelo link de pagamento.

## Limitações e pontos de atenção
- A URL da cobrança não é persistida em `sales`; ela é resolvida on-demand pela API do Asaas, evitando duplicação/defasagem de dado.
- Requer edge function `get-asaas-payment-link` publicada no ambiente Supabase para funcionamento completo em produção.

## Ajustes finais (hardening + UX limpa)
- Hardening da edge function: o link só é retornado para estados reabríveis (`pendente_pagamento`/`reservado`), com bloqueio explícito para `pago` e `cancelado` e `reason` coerente.
- Observabilidade: logs objetivos de bloqueio/falha com `sale_id`, `company_id`, `payment_environment`, `sale_status` e motivo.
- UX refinada: o botão **Reabrir cobrança** agora é ocultado quando não há cobrança reabrível; removida mensagem passiva fixa abaixo dos botões. Toast permanece apenas em tentativa real do usuário com falha.
