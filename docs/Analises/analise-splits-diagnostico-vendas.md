# Análise — Splits de Pagamento no Diagnóstico da Venda

## O que foi investigado

- **Tela `/admin/diagnostico-vendas`:** a implementação está centralizada em `src/pages/admin/SalesDiagnostic.tsx`, usando o modal existente de diagnóstico da venda, `Tabs`, `ScrollArea`, `Accordion`, `Collapsible`, `Badge` e os mesmos padrões visuais das abas Resumo, Fluxo, Gateway, Webhook e Payloads.
- **Dados da venda carregados no diagnóstico:** a consulta principal de `sales` já usa `company_id`, ambiente de pagamento e joins com `events`/`companies`. O detalhe da venda também recarrega logs com `sale_id`, `company_id` e `payment_environment`.
- **Payload enviado para `create-asaas-payment`:** a função `supabase/functions/create-asaas-payment/index.ts` monta o `paymentPayload` com `split: splitArray` e persiste o payload em `sale_integration_logs` como `provider = asaas`, `direction = outgoing_request` e `event_type = create_payment`.
- **Logs técnicos/integracionais:** `sale_integration_logs` já contém `payload_json`, `response_json`, `incident_code`, `warning_code`, `message`, `payment_environment` e demais metadados usados pelo diagnóstico.
- **Logs operacionais da venda:** `sale_logs` já são carregados no detalhe para linha do tempo e payload técnico consolidado.
- **Campos financeiros de `sales`:** foram identificados `gross_amount`, `platform_fee_total`, `socio_fee_amount`, `platform_net_amount` e os snapshots `split_snapshot_*`, usados por `create-asaas-payment`, `asaas-webhook` e `verify-payment-status` para evitar recálculo com configuração mutável.
- **Ledger de representante:** existe `representative_commissions`, com `sale_id`, `company_id`, `payment_environment`, `commission_percent`, `commission_amount`, `status` e `blocked_reason`. A nova aba lê esse ledger de forma filtrada pela venda/empresa/ambiente.
- **Resolvedor oficial de split:** `supabase/functions/_shared/split-recipients-resolver.ts` é a fonte consolidada para montagem de recebedores do split. A tela nova não chama nem replica essa regra; apenas lê evidências persistidas.

## Arquivos alterados

- `src/pages/admin/SalesDiagnostic.tsx`
  - Adiciona tipos auxiliares de diagnóstico de split.
  - Carrega ledger de representante no detalhe da venda.
  - Extrai o trecho `split` de payloads persistidos em `sale_integration_logs`.
  - Identifica visualmente a wallet da marketplace SmartBus BR.
  - Adiciona a aba **Splits de Pagamento** ao modal existente.
  - Ajusta o resumo para usar o valor da empresa do payload quando a wallet da empresa aparece explicitamente no split; quando ela não aparece, exibe a empresa como saldo visual da venda.
- `docs/Analises/analise-splits-diagnostico-vendas.md`
  - Documenta investigação, fontes de dados, cenários e testes manuais.

## De onde os dados de split são lidos

A aba usa apenas dados já persistidos:

1. **Payload enviado ao Asaas**
   - Origem: `detailIntegrationLogs`, vindo de `sale_integration_logs`.
   - Critério preferencial: log Asaas com `direction = outgoing_request` e `event_type = create_payment` que contenha `payload_json.split`.
   - Fallback: qualquer log Asaas do detalhe que contenha `split` em `payload_json`, `payload_json.payment.split` ou `payload_json.data.split`.

2. **Snapshot financeiro da venda**
   - Origem: registro de `sales` já carregado no diagnóstico.
   - Campos usados: `split_snapshot_captured_at`, `split_snapshot_platform_fee_total`, `split_snapshot_socio_fee_amount`, `split_snapshot_platform_net_amount`, `split_snapshot_socio_split_percent`, além dos campos consolidados `platform_fee_total`, `socio_fee_amount`, `platform_net_amount` quando aplicável.

3. **Ledger de representante**
   - Origem: `representative_commissions`.
   - Filtros aplicados: `sale_id`, `company_id` e `payment_environment` da venda.
   - Campos exibidos: percentual, valor, status e motivo de bloqueio quando existir.

4. **Logs relacionados ao split**
   - Origem: `sale_integration_logs` já carregados para a venda.
   - Termos filtrados: `split`, `wallet`, `representative`, `marketplace`, `socio`, `sócio`, `commission`, `ledger`, `recipient`.

## Critério do valor destinado à empresa

O campo **Valor destinado à empresa** é apenas visual/diagnóstico e segue a prioridade abaixo:

1. Se o payload de split tiver um recebedor identificado como **Empresa** pela wallet Asaas da empresa no ambiente da venda, a aba mostra o valor desse item do payload, quando o valor estiver persistido.
2. Se a empresa não estiver explicitamente no payload, a aba mostra o saldo visual da venda: valor total da venda menos os splits secundários identificados para marketplace, sócio, representante ou outros recebedores.
3. Se a empresa aparecer no payload apenas com percentual, sem valor em reais persistido, a aba mostra `não encontrado` para não recalcular regra financeira operacional.
4. O critério não altera cobrança, webhook, verify, snapshot, ledger nem cálculo oficial do split.

## Como a wallet da marketplace é identificada

A wallet da marketplace é identificada por comparação direta com o ID fixo informado para diagnóstico:

```text
54b2bcad-4015-4824-b0af-fb330c86e6bd
```

Quando um item de split possui `walletId` igual a esse valor, a aba exibe o recebedor como **Marketplace SmartBus BR**. Essa identificação é apenas visual/diagnóstica e fica restrita ao modal administrativo existente.

## Cenários tratados

- Venda com payload de split completo em `sale_integration_logs`.
- Venda com wallet da marketplace igual a `54b2bcad-4015-4824-b0af-fb330c86e6bd`.
- Venda sem payload de split associado.
- Venda com logs técnicos relacionados, mas sem array `split` explícito.
- Venda com snapshot financeiro persistido em `sales.split_snapshot_*`.
- Venda com ledger de representante em `representative_commissions`.
- Venda aguardando pagamento.
- Venda paga.
- Venda cancelada.
- Venda sem dados suficientes, exibindo ID da venda, empresa, ambiente, gateway, `asaas_payment_id`, status da venda e status de pagamento.

## Limitações encontradas

- O snapshot financeiro da venda não guarda a wallet do sócio; quando só existe snapshot, a aba mostra o valor/percentual do sócio, mas informa `wallet não encontrado`.
- O ledger de representante não guarda wallet; a aba mostra o lançamento auditável de comissão, mas a wallet do representante só aparece se estiver presente em payload/log persistido.
- O payload Asaas pode conter percentual (`percentualValue`) em vez de valor fixo. Para não criar cálculo paralelo, a aba exibe o percentual e só mostra valor em reais quando ele já existir em payload, snapshot ou ledger persistido.
- A aba não consulta o Asaas em tempo real e não cria nova rotina de log; ela depende do que já foi persistido no sistema.
- A aba não altera regras financeiras, webhook, criação de pagamento, verificação de pagamento nem cálculo de comissão.

## Como testar manualmente

1. Acessar `/admin/diagnostico-vendas` com perfil que já possua acesso administrativo/developer.
2. Selecionar uma venda e abrir o modal **Diagnóstico da Venda**.
3. Confirmar que a aba **Splits de Pagamento** aparece junto das abas existentes.
4. Validar os seguintes cenários:
   - Venda com split completo: verificar cards de resumo, recebedores e payload bruto.
   - Venda com wallet `54b2bcad-4015-4824-b0af-fb330c86e6bd`: confirmar exibição como **Marketplace SmartBus BR**.
   - Venda sem payload de split: confirmar mensagem “Não foi encontrado payload de split associado a esta venda.”
   - Venda com wallet da empresa no payload: confirmar que **Valor destinado à empresa** usa o valor desse recebedor e não zera por subtrair o total dos splits.
   - Venda com logs técnicos, mas sem split explícito: confirmar seção de logs relacionados e status de atenção/crítico conforme evidência.
   - Venda com representante/sócio/outro recebedor: confirmar origem `Ledger` e/ou `Snapshot da venda` quando houver dados.
   - Venda aguardando pagamento: confirmar que a aba não quebra e mostra dados disponíveis.
   - Venda paga: confirmar snapshot/ledger/payload quando persistidos.
   - Venda cancelada: confirmar que a aba não bloqueia nada e mantém caráter informativo.
5. Abrir a aba **Payloads** e usar “Copiar diagnóstico técnico” para confirmar que o payload consolidado inclui `representative_ledger` e `split_diagnostic`.
