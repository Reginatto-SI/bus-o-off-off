# Análise 90 — Diagnóstico de vendas: confiabilidade de incidentes (v3)

## Problema atacado nesta fase
Refinar a confiabilidade do diagnóstico técnico em `/admin/diagnostico-vendas` para reduzir leituras enganosas em produção, especialmente em:
- cálculo de `incidentStatus`
- timeline por etapa real de cada evento
- deduplicação lógica de incidentes

## Limitações detectadas na versão anterior
- `incidentStatus` podia oscilar demais com base apenas em presença de logs de erro/sucesso.
- Timeline reaproveitava etapa geral da divergência em todos os itens, reduzindo fidelidade do fluxo.
- Múltiplos logs do mesmo problema podiam gerar blocos repetidos, poluindo triagem operacional.

## Critérios adotados para recalcular `incidentStatus`
Critério conservador e determinístico:
1. **Ativo** quando a inconsistência atual ainda existe no estado da venda/incidente.
2. **Intermitente** quando há sinais mistos (erro + sucesso) sem convergência comprovada no estado atual.
3. **Resolvido** somente quando:
   - não há inconsistência atual
   - e há evidência de convergência aplicável ao tipo de regra
   - e sucesso posterior ao erro (quando há alternância temporal)

Princípio aplicado: sem evidência suficiente para resolver, não marcar como resolvido.

## Estratégia de deduplicação lógica escolhida
- Implementado agrupamento em chave estável:
  - `type + incidentCode + anchor + paymentEnvironment`
- `anchor` prioriza: `sale_id`, depois `external_reference`, depois `asaas_payment_id`, fallback `global`.
- Resultado:
  - 1 incidente lógico por problema equivalente
  - com `occurrenceCount`
  - `relatedLogs` deduplicados por `log.id`
  - `isReincident` e timeline completa preservados

## Como a timeline passou a mapear etapa real por evento
- Cada item da timeline agora calcula etapa por evento com base em sinais reais do log:
  - `direction`
  - `event_type`
  - `incident_code`
  - `warning_code`
  - `result_category`
- Mapeamentos operacionais incluem, entre outros:
  - webhook recebido
  - verificação manual
  - deduplicação
  - criação de cobrança
  - envio ao Asaas
  - busca/validação de cliente
  - convergência de status
  - auditoria de ambiente
- Fallback seguro: etapa da divergência quando não houver sinal específico.

## Riscos residuais
- Incidentes técnicos genéricos sem estado funcional explícito continuam dependentes do recorte de logs.
- A convergência para “resolvido” permanece conservadora para evitar falso positivo, podendo manter alguns casos como intermitentes por mais tempo.
- A qualidade da etapa exibida depende da consistência semântica dos campos de log persistidos.

## Checklist final de validação
- [x] Incidente só fica resolvido com base conservadora e evidência válida
- [x] Timeline mostra etapa por evento (não etapa genérica única)
- [x] Duplicidade lógica reduzida sem perda de rastreabilidade
- [x] Leitura operacional ficou mais confiável
- [x] Escopo permaneceu localizado no popup técnico de diagnóstico
- [x] Isolamento por empresa/ambiente mantido
