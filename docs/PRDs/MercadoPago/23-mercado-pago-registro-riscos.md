# Registro de riscos — Mercado Pago Marketplace

**Escalas:** impacto/probabilidade `alto`, `médio`, `baixo`. Criticidade considera ambos e a natureza financeira.
**Owners:** devem ser nomeados antes da implementação.
**Referências:** [dúvidas](./24-mercado-pago-duvidas-abertas.md) · [roadmap](./20-mercado-pago-roadmap.md)

| ID | Risco | Classe | Impacto | Prob. | Mitigação / gate |
|---|---|---|---|---|---|
| R-01 | Tratar MP 1:1 como split A/B/C | crítico | alto | alto | capability explícita; decisão F6; piloto D-only se aprovado |
| R-02 | Misturar empresa ou ambiente | crítico | alto | médio | chave composta, RLS, predicates server-side e testes negativos |
| R-03 | Cobrança duplicada após timeout/retry | crítico | alto | médio | key persistida, unique, claim, lookup e nunca fallback automático |
| R-04 | Token/secret exposto no cliente ou log | crítico | alto | médio | cofre, redaction, menor privilégio e testes de vazamento |
| R-05 | Snapshot, payload, log e ledger divergirem | crítico | alto | médio | `FinancialDecision` imutável e testes de contrato |
| R-06 | Refund/chargeback após comissão liquidada | crítico | alto | alto | matriz de reversão, reserva/dívida; sem ledger sem aprovações |
| R-07 | Webhook falso/replay finalizar venda | crítico | alto | médio | assinatura, dedup, valor/tenant/env e finalização idempotente |
| R-08 | Regressão do Asaas/vendas históricas | alto | alto | médio | caracterização, adapter golden tests e rollout independente |
| R-09 | Configuração atual trocar provider de tentativa | alto | alto | médio | freeze e seleção somente pelo registro da tentativa |
| R-10 | 1:N não existir/ser inadequado no Brasil | alto | alto | alto | confirmação formal; caminhos D-only ou NO-GO |
| R-11 | KYC/conta de beneficiário bloquear venda | alto | alto | médio | confirmar 1:N opcional; aplicar fail-open oficial onde possível |
| R-12 | Saldo insuficiente impedir reversão | alto | alto | médio | contrato e política de reserva/dívida antes do piloto |
| R-13 | Reconciliação não identificar tarifa/comissão | alto | alto | médio | homologar relatório/API e critérios `matched/mismatch` |
| R-14 | Repasse interno gerar obrigação regulatória/fiscal | crítico | alto | médio | projeto separado e parecer jurídico/contábil/financeiro |
| R-15 | OAuth state/callback vincular conta errada | crítico | alto | médio | nonce one-time, PKCE, tenant binding e validação external user |
| R-16 | Refresh concorrente invalidar integração | alto | médio | médio | lock, rotação atômica e health/reconnect |
| R-17 | Evento fora de ordem emitir ticket após reversão | alto | alto | médio | state machine monotônica/matriz de evento e testes |
| R-18 | Diagnóstico expor split confidencial | alto | alto | baixo | autorização granular, redaction e teste por perfil |
| R-19 | Feature flag/rollback trocar gateway | alto | alto | baixo | flag só para novas vendas; tentativa existente imutável |
| R-20 | Expansão exceder suporte/SLO | médio | médio | médio | coortes, limites, alertas e pause gate |
| R-21 | Drift sandbox/produção | alto | alto | médio | mesma suíte/fluxo, somente configuração externa diferente |
| R-22 | Dependência comercial aceita sem evidência | alto | alto | médio | ADR exige documento com país/produto/data/responsável |
| R-23 | Status genérico ocultar diferença crítica | alto | médio | médio | status normalizado + bruto + capabilities |
| R-24 | Retenção/log conter dados pessoais excessivos | médio | médio | médio | minimização, masking, política de retenção e revisão LGPD |
| R-25 | Falha de provider sem procedimento operacional | médio | médio | médio | runbook, on-call, kill switch para novas vendas e comunicação |
| R-26 | Texto/UI prometer recurso ainda indisponível | baixo | médio | médio | conteúdo condicionado a capability/feature flag |

## Processo

Revisar em cada gate. Risco crítico aberto bloqueia avanço salvo aceite formal dos owners competentes — e riscos de segurança/financeiros não podem ser aceitos somente por engenharia. Incidente cria/atualiza risco, tarefa e ADR; não se apaga histórico.
