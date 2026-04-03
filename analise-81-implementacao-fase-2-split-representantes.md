# Implementação Fase 2 — Split centralizado com representante

## 1. O que foi implementado
Foi criado um resolvedor central para os recebedores do split Asaas e ele foi integrado de forma conservadora no create da cobrança, com reaproveitamento mínimo no verify/webhook para manter coerência de interpretação financeira. O resolvedor passa a decidir de forma única os participantes plataforma, sócio e representante, respeitando ambiente da venda e sem bloquear checkout quando o representante não for elegível.

## 2. Onde ficou o resolvedor de split
- Arquivo: `supabase/functions/_shared/split-recipients-resolver.ts`
- Funções principais:
  - `resolveAsaasSplitRecipients(...)`: resolve recebedores do split (plataforma, sócio, representante)
  - `computeSocioFinancialSnapshot(...)`: reaproveita a mesma interpretação de sócio para snapshot financeiro em verify/webhook
- Responsabilidade: centralizar validação de wallet/percentuais e elegibilidade do representante em um ponto único e reutilizável.

## 3. Como o split era antes
Antes da fase 2, o split da cobrança Asaas era montado localmente dentro de `create-asaas-payment`, com validação de sócio e composição de array acopladas ao fluxo de criação de cobrança.

## 4. Como o split passou a funcionar
Agora a composição dos recebedores passa por um resolvedor compartilhado:
1. `create-asaas-payment` delega a decisão de recebedores para `resolveAsaasSplitRecipients`
2. O resolvedor retorna lista estruturada de recebedores elegíveis
3. O create apenas transforma essa saída para payload do Asaas e valida soma total de percentuais
4. `verify-payment-status` e `asaas-webhook` reaproveitam o mesmo resolvedor para manter interpretação coerente do contexto financeiro

## 5. Quando o representante entra no split
O representante entra no split somente quando todas as condições abaixo são verdadeiras:
- existe `sales.representative_id`
- o representante existe na tabela `representatives`
- `representatives.status = 'ativo'`
- wallet do representante existe para o ambiente da venda (`production` ou `sandbox`)
- percentual do representante é válido e maior que zero (`commission_percent`, com fallback 2%)

## 6. Quando o representante NÃO entra no split
O representante é ignorado (sem quebrar venda/cobrança) quando:
- não há `sales.representative_id`
- `representative_id` não resolve registro ativo
- status do representante não permite operação
- wallet do ambiente está ausente
- percentual de comissão está inválido
- houve falha de lookup técnico do representante

## 7. Como a wallet do representante foi tratada
A wallet é validada por ambiente da venda, nunca por host. Se a wallet estiver ausente para o ambiente atual:
- o representante é removido apenas do split da cobrança corrente
- o checkout continua
- a cobrança continua com os demais recebedores
- a comissão segue o comportamento da fase 1 no ledger (inclusive bloqueio quando necessário)

## 8. Como foi garantida a não quebra do checkout
Salvaguardas aplicadas:
- falha de elegibilidade do representante é tratada como não-bloqueante
- validação de plataforma/sócio segue bloqueante como já era (sem afrouxar regras existentes)
- a criação de cobrança mantém validações anteriores de integridade financeira
- o resolvedor só substitui a montagem local do split, sem reescrever o restante do fluxo

## 9. Como foi tratada a coerência com verify / webhook / reconcile
- `verify-payment-status` e `asaas-webhook` passaram a consumir o mesmo resolvedor compartilhado para interpretação de sócio/representante no snapshot financeiro
- `reconcile-sale-payment` continua sem remontar split (comportamento esperado), permanecendo no fluxo único de finalização já consolidado
- resultado: mesma regra estrutural para split/participantes sem duplicação paralela em múltiplos pontos

## 10. Logs adicionados
Principais eventos técnicos adicionados:
- `split_representative_eligible`
- `split_representative_ignored`
- `split_recipients_resolved`
- `split_representative_resolution_exception`

Todos com contexto de `sale_id`, `company_id` e `payment_environment`.

## 11. Riscos residuais
- Não há painel operacional de representante nesta fase
- O fluxo de liquidação financeira da comissão do representante ainda depende das próximas etapas
- Caso o percentual combinado (plataforma + sócio + representante) exceda 100%, a cobrança é bloqueada (comportamento correto), exigindo configuração operacional adequada

## 12. Próximo passo recomendado
Próxima implementação segura: criar observabilidade administrativa dedicada para split de representante (visão por venda com motivos de elegibilidade/inelegibilidade) e preparar fase de painel operacional do representante sem alterar o núcleo financeiro novamente.
