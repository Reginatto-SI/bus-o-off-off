# Análise 4 — Correção mínima da venda manual com split oficial

Data da correção: 2026-05-12

## 1. Resumo do problema corrigido

A análise 3 identificou que a venda manual calculava a taxa da plataforma de forma próxima à regra oficial, mas a cobrança separada criada por `create-platform-fee-checkout` não enviava `split` ao Asaas, não usava o resolvedor oficial de Marketplace/Sócio/Representante e não gravava snapshot financeiro equivalente ao fluxo público.

A correção desta etapa mantém a cobrança separada da taxa manual, mas passa a:

- recalcular/validar a taxa no backend com o motor oficial por passageiro;
- resolver a divisão oficial entre Marketplace, Sócio e Representante;
- enviar `split` no payload da cobrança separada para os recebedores efetivos quando houver Sócio/Representante elegível;
- tratar Marketplace como saldo retido pela cobrança da plataforma;
- persistir snapshot financeiro nos campos existentes de `sales`;
- registrar logs técnicos com taxa calculada, taxa cobrada, split previsto/efetivo, payload e resposta;
- bloquear reutilização silenciosa de cobrança pendente legada sem snapshot de split;
- chamar o ledger de representante na confirmação manual apenas quando existir snapshot manual de split.

## 2. Arquivos alterados

- `supabase/functions/create-platform-fee-checkout/index.ts`
- `supabase/functions/_shared/split-recipients-resolver.ts`
- `supabase/functions/_shared/payment-context-resolver.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `src/lib/manualPlatformFeeSplitContract.test.ts`
- `docs/Analises/analise-4-correcao-venda-manual-split.md`

## 3. Regra antes/depois

### Antes

- A taxa manual vinha de `sales.platform_fee_amount`, calculada no frontend administrativo.
- O backend aplicava apenas defesa de piso mínimo quando o valor salvo era menor que R$ 5,00.
- A cobrança separada era criada sem `split`.
- Sócio e Representante não recebiam automaticamente pela cobrança manual.
- O snapshot `split_snapshot_*` não era preenchido pelo fluxo manual.
- Cobrança pendente legada podia ser reutilizada mesmo sem evidência de split.

### Depois

- `create-platform-fee-checkout` carrega os tickets da venda manual, filtra os tickets do trecho principal e calcula a taxa com `computeProgressiveFeeForPassengers`.
- Se não existe cobrança vinculada e o valor salvo diverge, `platform_fee_amount` é ajustado para a taxa oficial antes de criar a cobrança.
- Se já existe `platform_fee_payment_id` e há divergência de valor, a função bloqueia com erro claro, sem alterar cobrança vinculada.
- A função resolve Sócio e Representante com `resolveAsaasSplitRecipients` e divide a taxa com `distributePlatformFee`.
- A cobrança separada passa a enviar `split` para Sócio e/ou Representante elegíveis; Marketplace fica como saldo retido pela conta da plataforma.
- O snapshot financeiro é salvo nos campos existentes de `sales` após criação bem-sucedida da cobrança.
- Cobrança pendente legada sem snapshot manual de split não é reutilizada silenciosamente.

## 4. Como a taxa manual passou a ser calculada/validada

A Edge Function agora executa a validação financeira antes de falar com o Asaas:

1. busca `tickets` por `sale_id` e `company_id`;
2. considera apenas tickets cujo `trip_id` é o `sales.trip_id`, evitando duplicar trecho de volta sem valor financeiro próprio;
3. resolve o valor financeiro real de cada passageiro com `resolvePassengerFinancialUnitPrice`, preservando benefício/desconto e tipo de passagem;
4. calcula a taxa oficial com `computeProgressiveFeeForPassengers`, que aplica faixa percentual, teto por item e piso total;
5. compara a taxa oficial com `sales.platform_fee_amount`;
6. atualiza `platform_fee_amount` somente quando não existe cobrança vinculada;
7. bloqueia divergência quando já existe cobrança vinculada.

Essa validação mantém taxa adicional da empresa fora da base, porque os valores usados vêm dos tickets/passageiros e não de `sales.gross_amount`.

## 5. Como os recebedores são resolvidos

A função usa duas passagens pelo resolvedor central:

1. uma pré-resolução para identificar se o representante é elegível;
2. a distribuição oficial com `distributePlatformFee`;
3. uma resolução final com os percentuais efetivos da cobrança separada.

Como a cobrança manual da taxa é criada pela conta operacional da plataforma, Marketplace não precisa ser enviado como item de split para receber sua parte: ele fica com o saldo da cobrança. Sócio e Representante entram no array `split` apenas quando elegíveis e com wallet válida para o ambiente da venda.

Comportamento por cenário:

| Cenário | Split enviado | Saldo Marketplace |
|---|---|---:|
| Sem representante + sócio ativo | Sócio 50% da taxa | 50% |
| Sem representante + sócio inativo/sem wallet | Sem recebedores | 100% |
| Com representante + sócio ativo | Sócio 33,33% + Representante 33,33% | 33,34% conforme arredondamento |
| Com representante + sócio inativo/sem wallet | Representante 33,33% | 66,67% |

## 6. Asaas e `split` na cobrança separada

A correção passa a enviar o campo `split` no payload de criação da cobrança separada da taxa.

Não houve chamada real ao Asaas durante esta etapa, portanto a aceitação final precisa ser homologada em sandbox. O código preserva o tratamento seguro: se o Asaas rejeitar o payload, a função registra `sale_integration_logs` com o payload e a resposta de erro e não grava `platform_fee_payment_id`/snapshot como cobrança criada.

## 7. Exemplo do payload antes/depois

### Antes

```json
{
  "customer": "cus_xxx",
  "billingType": "PIX",
  "value": 6,
  "dueDate": "2026-05-13",
  "description": "Taxa da Plataforma — Venda Manual ...",
  "externalReference": "platform_fee_<sale_id>"
}
```

### Depois — com representante e sócio ativo

```json
{
  "customer": "cus_xxx",
  "billingType": "PIX",
  "value": 6,
  "dueDate": "2026-05-13",
  "description": "Taxa da Plataforma — Venda Manual ...",
  "externalReference": "platform_fee_<sale_id>",
  "split": [
    { "walletId": "wallet_socio", "percentualValue": 33.33 },
    { "walletId": "wallet_representante", "percentualValue": 33.33 }
  ]
}
```

Nesse exemplo, Marketplace recebe o saldo restante da cobrança criada na conta da plataforma.

## 8. Campos de snapshot preenchidos

Após criação bem-sucedida da cobrança, a venda manual passa a preencher:

- `platform_fee_amount`;
- `platform_fee_total`;
- `platform_fee_payment_id`;
- `split_snapshot_platform_fee_percent`;
- `split_snapshot_socio_split_percent`;
- `split_snapshot_representative_percent`;
- `split_snapshot_platform_fee_total`;
- `split_snapshot_socio_fee_amount`;
- `split_snapshot_platform_net_amount`;
- `split_snapshot_source = 'create-platform-fee-checkout'`;
- `split_snapshot_captured_at`.

Limitação mantida: os campos atuais não guardam wallet efetiva do Sócio/Representante nem motivo estruturado de inelegibilidade. Esses dados ficam nos `sale_integration_logs` desta criação.

## 9. Logs criados

A correção registra logs técnicos em `sale_integration_logs` com:

- valores base dos itens (`base_item_values`);
- resultado do motor da taxa (`platform_fee_engine`);
- taxa cobrada (`fee_charged`);
- distribuição esperada;
- distribuição efetiva;
- recebedores enviados no split;
- recebedores omitidos por inelegibilidade;
- payload Asaas;
- resposta do Asaas;
- ambiente e `externalReference`.

Também registra `sale_logs` operacionais para divergência de valor, snapshot inválido, cobrança legada pendente sem snapshot e processamento de ledger de representante na confirmação manual.

## 10. Tratamento de cobranças pendentes, pagas e duplicadas

- **Sem cobrança vinculada:** se `platform_fee_amount` divergir da taxa oficial, o valor é atualizado antes de criar a cobrança.
- **Com cobrança vinculada e valor divergente:** a função bloqueia com `manual_platform_fee_amount_mismatch_existing_payment`.
- **Cobrança pendente legada sem snapshot manual de split:** a função bloqueia com `legacy_pending_platform_fee_without_split_snapshot`, orientando cancelar/regularizar antes de gerar cobrança nova.
- **Cobrança pendente com snapshot manual de split:** a cobrança pode ser reutilizada.
- **Cobrança já paga:** a função mantém a regra de não criar nova cobrança e não altera valor retroativamente.
- **Duplicidade por `externalReference`:** a lógica existente de idempotência foi mantida.

## 11. Testes criados/executados

Foi criado `src/lib/manualPlatformFeeSplitContract.test.ts` cobrindo:

- taxa manual com piso;
- taxa manual com teto;
- taxa adicional da empresa fora da base;
- divisão sem representante e com sócio ativo;
- divisão sem representante e sócio inativo;
- divisão com representante e sócio ativo;
- divisão com representante e sócio inativo;
- contrato estático da Edge Function garantindo motor oficial, resolvedor, `split` no payload, snapshot e bloqueios de cobrança legada;
- confirmação manual processando ledger apenas quando há snapshot manual de split.

Comandos executados:

- `npm test -- src/lib/feeCalculator.test.ts src/lib/manualPlatformFeeSplitContract.test.ts`
- `npm run build`
- `npx eslint supabase/functions/create-platform-fee-checkout/index.ts supabase/functions/verify-payment-status/index.ts supabase/functions/_shared/split-recipients-resolver.ts src/lib/manualPlatformFeeSplitContract.test.ts`

Resultado:

- testes unitários/contratuais passaram;
- build passou, com avisos já conhecidos de Browserslist/chunk grande;
- lint direcionado passou.

## 12. Riscos restantes

- A aceitação do `split` pelo Asaas na cobrança criada pela conta da plataforma precisa ser homologada em sandbox.
- Marketplace é representado como saldo retido da cobrança, não como item explícito de split; isso deve ser validado com financeiro/Asaas.
- Campos atuais de snapshot não guardam todas as wallets efetivas e motivos de inelegibilidade de forma estruturada; os logs suprem a auditoria mínima nesta etapa.
- Cobranças pendentes legadas sem split precisarão de procedimento operacional de cancelamento/regularização.

## 13. Pendências para ledger e diagnóstico

- O caminho de confirmação manual (`verify-payment-status`) agora chama a RPC de ledger de representante somente quando há snapshot manual de split, evitando fallback legado sobre `gross_amount` para vendas manuais sem snapshot.
- A tela de diagnóstico não foi alterada nesta etapa. Ela já lê `sale_integration_logs`, snapshots e ledger, mas pode exigir melhoria futura para destacar explicitamente que Marketplace é saldo retido da cobrança separada.
- Não houve backfill de vendas antigas nem alteração de ledger histórico, conforme restrição da tarefa.

## 14. Recomendação de homologação em sandbox

Homologar os seis cenários obrigatórios antes de produção:

1. R$ 100,00 sem representante e com sócio ativo → cobrança R$ 6,00; Sócio 50%; Marketplace saldo 50%.
2. R$ 30,00 abaixo do piso → cobrança R$ 5,00; Sócio 50%; Marketplace saldo 50%.
3. R$ 100,00 com representante e sócio ativo → Sócio 33,33%; Representante 33,33%; Marketplace saldo.
4. R$ 100,00 com representante e sócio inativo/sem wallet → Representante 33,33%; Marketplace saldo 66,67%.
5. R$ 100,00 + taxa adicional R$ 6,00 → taxa da plataforma R$ 6,00 calculada sobre R$ 100,00.
6. R$ 1.000,00 com representante e sócio ativo → cobrança R$ 25,00; Representante aproximadamente R$ 8,33.

Também validar no painel Asaas:

- payload aceito com `split` na cobrança separada;
- wallets inelegíveis não enviadas;
- `externalReference = platform_fee_<sale_id>`;
- ambiente sandbox/produção igual a `sales.payment_environment`;
- logs e snapshot coerentes no diagnóstico administrativo.
