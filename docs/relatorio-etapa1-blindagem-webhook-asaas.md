# Relatório — Etapa 1: Blindagem do Webhook Asaas

## 1. Resumo executivo

Esta etapa aplicou uma blindagem cirúrgica no fluxo do `asaas-webhook` para reduzir respostas não-2xx evitáveis, impedir efeitos destrutivos de eventos fora de ordem e preservar a separação atual entre sandbox e produção.

O foco permaneceu estritamente operacional:

- confirmação de pagamento bem-sucedida não passa mais a falhar para o provedor por causa de `seat_locks`;
- confirmação com inconsistência de tickets deixa de devolver `409` ao Asaas e passa a registrar incidente interno com `200`;
- eventos tardios/repetidos de falha não executam mais limpeza destrutiva quando a venda já não está em estado cancelável;
- falha de cleanup em cancelamento deixa de elevar desnecessariamente o webhook para `500`.

## 2. Problemas críticos identificados nesta etapa

1. **Eventos fora de ordem podiam ser destrutivos**
   - `processPaymentFailed` executava deletes mesmo sem confirmar transição real da venda para `cancelado`.
   - Isso podia afetar venda já paga ou já tratada.

2. **Falhas acessórias elevavam o webhook para erro operacional**
   - erro na limpeza de `seat_locks` após confirmação devolvia `500`, mesmo com pagamento confirmado e tickets já existentes.

3. **Inconsistência pós-confirmação degradava a fila do Asaas**
   - quando a venda era marcada como paga, mas a finalização não concluía geração de tickets, o webhook devolvia `409`, incentivando reentregas sem necessariamente resolver a causa.

4. **Cancelamento parcialmente concluído também penalizava a fila**
   - se a venda era cancelada, mas a limpeza de locks falhava, a função devolvia `500` apesar de o estado principal já estar consolidado.

## 3. O que foi corrigido

### 3.1 Blindagem do cleanup pós-confirmação
A rotina compartilhada `finalizeConfirmedPayment` agora trata falha em `seat_locks` como **warning operacional**, não como falha do pagamento, desde que a venda já esteja confirmada e com tickets consistentes.

### 3.2 Redução de `409` evitável no webhook de confirmação
Quando o pagamento foi reconhecido, mas a finalização ficou inconsistente (ex.: tickets não gerados), o webhook agora devolve `200` com `partial_failure` e `incident_code`, preservando rastreabilidade sem degradar a fila do Asaas.

### 3.3 Defesa contra eventos de falha fora de ordem
O fluxo de falha/cancelamento agora só executa deletes/limpezas quando a venda realmente transiciona para `cancelado` a partir de `pendente_pagamento` ou `reservado`.

Se a venda já estiver fora do estado cancelável (ex.: `pago` ou já `cancelado`), o evento é tratado como `ignored` com `200`, atualização defensiva de `asaas_payment_status` e registro em `sale_logs`.

### 3.4 Cancelamento parcial tratado como incidente interno
Se o cancelamento principal ocorrer, mas a limpeza de `seat_locks` falhar, o webhook passa a responder `200` com `partial_failure`, preservando o estado principal e registrando o incidente para suporte.

## 4. O que foi parcialmente corrigido

1. **Idempotência operacional**
   - melhorada para eventos de falha fora de ordem e para confirmações com inconsistência operacional;
   - porém ainda não existe deduplicação formal por `event.id` do Asaas.

2. **Respostas não-2xx evitáveis**
   - foram reduzidas nos cenários de inconsistência interna após confirmação/cancelamento;
   - ainda permanecem respostas não-2xx em casos de segurança/configuração/contexto que continuam sendo tratados como erro real.

## 5. O que não foi corrigido nesta etapa

1. origem inicial do `payment_environment` por host;
2. estratégia global de URL única;
3. deduplicação persistente por `event.id`;
4. redesign arquitetural para processamento assíncrono/ack imediato;
5. revisão ampla de observabilidade e dashboards operacionais.

## 6. Riscos remanescentes

1. **Ambiente da venda não resolvido** ainda pode gerar resposta de erro para favorecer retry/controlar integridade.
2. **Token inválido ou secret ausente** continuam retornando erro real por segurança/configuração.
3. **Venda não encontrada** continua sendo falha real, pois ainda pode representar condição transitória ou inconsistência séria.
4. **Eventos duplicados** seguem sem deduplicação formal por identificador do evento.
5. **Latência do webhook** continua dependente de operações síncronas de banco.

## 7. Impacto esperado das mudanças

- Menor risco de penalização do webhook por erros evitáveis após confirmação legítima.
- Menor chance de deletes indevidos em vendas já pagas quando chegar evento tardio de falha.
- Melhor comportamento idempotente em reenvios e fora de ordem nos fluxos mais críticos.
- Menor acoplamento entre sucesso do pagamento e cleanups acessórios.

## 8. Arquivos alterados

- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/_shared/payment-finalization.ts`

## 9. Decisões de implementação

1. **Não afrouxar validação de token/ambiente**
   - segurança de separação sandbox/produção foi preservada.

2. **Não transformar todos os erros em `200`**
   - apenas cenários em que o estado principal já foi consolidado ou em que o evento estava fora de ordem passaram a responder de forma menos agressiva ao Asaas.

3. **Tratar cleanup como secundário**
   - `seat_locks` é relevante, mas não pode derrubar o reconhecimento de um pagamento já confirmado.

4. **Proteger transição de cancelamento antes de deletar**
   - efeitos destrutivos agora dependem de mudança real de estado.

## 10. Pontos recomendados para a Etapa 2

1. fortalecer a origem determinística de `payment_environment`;
2. reduzir dependência operacional do host como gatilho inicial;
3. revisar contrato entre criação da cobrança e persistência do ambiente para eliminar zonas cinzentas.

## 11. Pontos recomendados para a Etapa 3

1. ampliar métricas/logs para distinguir `warning`, `partial_failure` e `ignored` com maior clareza;
2. adicionar trilha dedicada para incidentes de reconciliação pós-webhook;
3. considerar deduplicação persistente por `event.id` e medição de latência do webhook.

## 12. Checklist final

- [x] Mudança mínima e localizada
- [x] Separação sandbox/produção preservada
- [x] Fallback permissivo entre tokens não foi reaberto
- [x] Eventos fora de ordem ficaram mais defensivos
- [x] Respostas não-2xx evitáveis foram reduzidas nos fluxos críticos
- [x] Sem alteração de frontend
- [x] Sem refatoração global da arquitetura
