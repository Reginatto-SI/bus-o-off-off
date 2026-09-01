# Webhook, idempotência e reconciliação

## Referência atual Asaas

`asaas-webhook` obtém `externalReference`/vínculo da venda, lê `sales.payment_environment` no banco e só então escolhe/valida o token daquele ambiente; URL/host não decide. Sem venda ou ambiente persistido, pode validar se o token recebido pertence ao conjunto oficial apenas para autenticar a rejeição, mas não usa isso para processar nem inferir o ambiente financeiro. Deduplica por `asaas_event_id` e atualiza/finaliza conforme a matriz. `verify-payment-status` consulta on-demand com ambiente e credencial derivados prioritariamente da venda. Ambos usam `payment-finalization.ts`; `reconcile-sale-payment` atende venda paga sem tickets.

## Contrato reutilizável

1. Capturar corpo bruto quando a assinatura exigir; validar assinatura/token, timestamp e replay conforme documentação oficial.
2. Não confiar em ambiente, empresa, valor, status ou referência vindos isoladamente do payload.
3. Resolver venda por referência persistida/ID externo e conferir gateway, conta/tenant e ambiente.
   Para venda histórica, URL do webhook, host da aplicação e configuração corrente da empresa nunca substituem o ambiente persistido.
4. Criar chave dedup composta por gateway + ambiente + conta + event ID (ou hash canônico aprovado).
5. Reservar evento atomicamente, processar e registrar resultado/tentativas; concorrência não pode finalizar duas vezes.
6. Preservar status/evento externo bruto e mapear para transição interna permitida.
7. Responder de modo compatível com retries do provedor, sem mascarar falha antes de persistir evidência.
8. Centralizar finalização idempotente: update condicional da venda, tickets com unicidade, liberação de locks, snapshot/ledger/logs.
9. Tratar eventos fora de ordem e reversões explicitamente; nunca rebaixar/elevar estado por comparação textual.

## Coberturas contra duplicidade

| Risco | Controles exigidos |
|---|---|
| duas cobranças | lock/estado local + idempotency key externa + reutilização do ID |
| webhook duplicado | dedup atômica + finalização reentrante |
| verify e webhook concorrentes | compare-and-set/transação + ticket único |
| ticket duplicado | constraint/chave natural por venda/passageiro/trecho + rotina idempotente |
| gateway x banco divergentes | consulta externa, logs correlacionados e reconcile controlado |
| confirmação incorreta | validar referência, valor, moeda, tenant/conta, ambiente e status confirmatório |

## Reconciliação

Definir varredura/manual por gateway e estado: pendente antigo; gateway pago/interno pendente; interno pago/gateway revertido; pago sem ticket; cobrança sem venda; venda sem cobrança. Registrar antes/depois, operador/origem, evidência externa e resultado. Reconciliação não pode inventar pagamento nem criar nova cobrança como efeito colateral.

## Lacunas atuais conhecidas

Não há prova de dead-letter/replay interno formal nem rollback financeiro automatizado completo para estorno/chargeback. O suporte operacional deve tratar isso como lacuna, não como capacidade implícita.
