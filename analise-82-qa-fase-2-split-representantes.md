# QA da Fase 2 — Split centralizado com representante

## 1. Resumo executivo
A Fase 2 está **operacionalmente segura para avançar**, com comportamento conservador e sem quebra explícita do checkout por falhas de representante. A centralização do split ficou consistente entre `create`, `verify` e `webhook` para as regras de elegibilidade atuais.

Ponto de atenção real (não bloqueante nesta fase): o snapshot financeiro em `sales` continua focado em plataforma/sócio e não explicita representante por campo próprio, o que pode gerar leitura ambígua em auditorias futuras se não houver documentação operacional clara.

## 2. Cenários validados

### Cenário A — venda sem representante
**Resultado:** aprovado.
- No resolvedor, ausência de `representative_id` retorna `missing_sale_representative` e segue com split principal.
- Não há throw nesse caminho; portanto cobrança não quebra por representante ausente.

### Cenário B — venda com representante elegível
**Resultado:** aprovado.
- Representante entra quando `status='ativo'`, wallet do ambiente existe e `commission_percent > 0`.
- Percentual aplicado vem de `representatives.commission_percent` (fallback 2).
- Logs de elegibilidade são emitidos.

### Cenário C — venda com representante sem wallet
**Resultado:** aprovado.
- Representante é ignorado no split (`representative_wallet_missing`) sem bloquear create/verify/webhook.
- Fase 1 permanece coerente: comissão continua sendo tratada no pós-pagamento no ledger (`upsert_representative_commission_for_sale`), com bloqueio quando wallet ausente.

### Cenário D — venda com sócio + representante
**Resultado:** aprovado.
- Ambos entram quando elegíveis.
- Ordem do split é determinística no resolvedor: plataforma -> sócio -> representante.
- Não há ambiguidade de composição porque a lista é montada em uma única função.

### Cenário E — soma de percentuais acima de 100%
**Resultado:** aprovado.
- `create-asaas-payment` soma os recebedores efetivos resolvidos e bloqueia com `fee_exceeds_limit` quando > 100.
- Mensagem de erro está explícita e segura.

### Cenário F — falha de lookup do representante
**Resultado:** aprovado.
- Lookup do representante foi desenhado como não bloqueante: falha retorna `representative_lookup_failed` sem throw.
- `create` continua; `verify` e `webhook` também não interrompem confirmação por esse motivo.
- Sócio continua com comportamento bloqueante já existente quando inválido (sem regressão de regra financeira principal).

## 3. Validação do snapshot financeiro em sales
**Conclusão objetiva:** hoje está **correto para o escopo da Fase 2**, mas com ressalva de clareza documental.

- Os campos atualizados em `sales` no verify/webhook (`platform_fee_total`, `socio_fee_amount`, `platform_net_amount`) continuam modelando fotografia da partilha plataforma/sócio.
- O representante no split não entra nesse snapshot, e isso foi mantido implicitamente pelo desenho atual.
- Isso **não quebra a operação** porque a trilha do representante já existe no ledger de comissão pós-pagamento.
- Pode gerar confusão futura se alguém interpretar `platform_net_amount` como “net final após todos os recebedores”.

**Recomendação mínima:** manter como está nesta fase, mas adicionar comentário/documentação explícita (runbook/arquivo técnico) dizendo que snapshot em `sales` não representa repasse de representante.

## 4. Validação de criticidade no verify / webhook
**Conclusão objetiva:** não houve endurecimento excessivo para representante.

- Falha de representante permanece não bloqueante (inelegibilidade ou lookup falho não derruba confirmação).
- Falha de sócio continua com criticidade já existente (bloqueante na validação financeira de snapshot).
- Verify/webhook continuam priorizando confirmação de pagamento com finalização única (`finalizeConfirmedPayment`) e tratam trilhas acessórias separadamente.

Não foi identificado trecho novo em que falha lateral de representante “apague” confirmação de pagamento.

## 5. Validação dos logs
**O que ficou bom:**
- Logs úteis para representante elegível/ignorado.
- Log consolidado de resolvedor no create (`split_recipients_resolved`) ajuda auditoria.
- Contexto de ambiente e IDs principais está presente.

**O que falta (não crítico):**
- Verify/webhook não têm log equivalente de “split completo resolvido”, só de representante e sócio; ainda é suficiente, mas menos simétrico com create.

**Redundância perigosa:** não identificada.

## 6. Riscos residuais
1. Ambiguidade futura de leitura do snapshot financeiro em `sales` sem nota explícita sobre representante fora desse snapshot.
2. Ausência de visão administrativa específica para divergências entre split efetivo e ledger de comissão do representante (observabilidade operacional futura).
3. Dependência de disciplina de configuração (percentuais) para evitar bloqueio por `fee_exceeds_limit`.

## 7. Ajustes mínimos recomendados
1. Adicionar comentário técnico curto (código ou documentação operacional) explicitando que o snapshot de `sales` é plataforma/sócio e não incorpora repasse de representante.
2. Opcional (baixo impacto): logar em verify/webhook um evento resumido de split resolvido (contagem/percentuais sem dados sensíveis) para paridade com create.

## 8. Conclusão final
Pode avançar para próximas fases com segurança operacional.

Não há evidência de regressão crítica na Fase 2 para create/verify/webhook em relação à regra de não bloquear por representante inelegível.

## 9. Perguntas em aberto
1. O `Plano de Desenvolvimento -Módulo de Representantes.txt` não está disponível nesta cópia do repositório; confirmar caminho oficial para rastreabilidade documental completa.
2. Em fase futura, o time quer manter snapshot de `sales` restrito a plataforma/sócio ou adicionar campo explícito para “representative_split_percent/value” apenas para auditoria?
