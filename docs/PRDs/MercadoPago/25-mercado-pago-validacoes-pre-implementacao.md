# Gates progressivos de validação — Mercado Pago Marketplace

**Regra:** somente o gate da fase a iniciar precisa estar concluído. “Planejado” não equivale a “validado”, e aprovação de um gate não autoriza fases posteriores.
**Navegação:** [índice](./00-mercado-pago-indice-geral.md) · [PRD principal](./02-mercado-pago-prd-principal-implementacao.md) · [roadmap](./20-mercado-pago-roadmap.md)

Perguntas sobre 1:N podem ser investigadas em paralelo e **não bloqueiam a Fase 1 ou a preparação arquitetural**. Permanecem bloqueantes para qualquer promessa, piloto ou implantação de equivalência financeira completa nos cenários A/B/C.

## Gate A — Antes da Fase 1

- [ ] Documentação e auditoria revisadas.
- [ ] Regra financeira oficial confirmada, incluindo a regra do sócio global.
- [ ] Responsáveis iniciais de engenharia, produto, segurança e financeiro definidos.
- [ ] Escopo e limites da Fase 1 aprovados.
- [ ] Preservação do Asaas registrada como invariante.
- [ ] Fallback automático entre gateways expressamente proibido.
- [ ] Plano dos testes de caracterização Asaas definido.
- [ ] Prompt próprio da Fase 1 referencia PRD e backlog, sem atividade de fases seguintes.
- [ ] Autorização expressa registrada para iniciar **somente a Fase 1**.

## Gate B — Antes das alterações estruturais das Fases 2 e 3

- [ ] Fase 1 concluída e aceita.
- [ ] Arquitetura e contrato de provider aprovados.
- [ ] Testes de caracterização Asaas disponíveis e verdes.
- [ ] Modelo multiempresa `(company, provider, environment)` aprovado.
- [ ] Threat model aprovado.
- [ ] Estratégia de compatibilidade com vendas Asaas históricas aprovada.
- [ ] Modelo futuro de banco, constraints e RLS revisado — sem presumir migration já autorizada.
- [ ] Plano de rollback não troca provider nem cria segunda cobrança.
- [ ] Prompt próprio da fase autorizada referencia seu PRD/backlog e determina parada ao final.

## Gate C — Antes da Fase 4 OAuth

- [ ] Fase 3 concluída e aceita.
- [ ] Documentação oficial OAuth aplicável confirmada.
- [ ] Aplicação Mercado Pago e responsáveis identificados.
- [ ] Redirect URIs por ambiente definidas.
- [ ] Solução de secrets/cofre aprovada.
- [ ] State de uso único e vínculo tenant/ambiente definidos.
- [ ] PKCE confirmado e definido quando aplicável.
- [ ] Refresh, rotação, revogação, reconexão e auditoria definidos.
- [ ] Prompt próprio autoriza apenas a Fase 4 e proíbe ativação no checkout.

## Gate D — Antes da Fase 5, POC 1:1

- [ ] Fase 4 concluída e OAuth homologado.
- [ ] Conta, aplicação e ambiente de teste controlados disponíveis.
- [ ] Estratégia de idempotência e recuperação de timeout homologável.
- [ ] Assinatura, deduplicação e correlação de webhook definidas.
- [ ] Consulta fallback definida.
- [ ] Reembolso e matriz mínima de reversão definidos para a POC.
- [ ] Conciliação de valor, tarifa e comissão definida.
- [ ] Feature flag exclusivamente interna definida.
- [ ] Confirmação explícita: POC 1:1 não representa split multipartes nem produção.
- [ ] Prompt próprio autoriza somente a POC sandbox.

## Gate E — Antes da Fase 7, piloto em produção

- [ ] Fase 5 encerrada com evidências e Fase 6 com decisão formal registrada.
- [ ] Solução aprovada para os cenários financeiros permitidos no piloto.
- [ ] Matriz de reembolso, chargeback, ticket e comissão aprovada.
- [ ] Aprovações financeira, jurídica e contábil registradas quando aplicáveis.
- [ ] Runbook de OAuth, timeout, webhook, reversão e incidente aprovado.
- [ ] Alertas, métricas, SLOs, on-call e suporte ativos.
- [ ] Processo e responsável de conciliação definidos.
- [ ] Feature flag, kill switch e rollback homologados.
- [ ] Empresa piloto, limites, aceite e elegibilidade registrados.
- [ ] Go/no-go executivo e prompt exclusivo da Fase 7 aprovados.

## Gate F — Antes da Fase 8, expansão

- [ ] Piloto formalmente encerrado e relatório aprovado.
- [ ] SLOs e critérios financeiros/operacionais atingidos.
- [ ] Nenhum risco crítico aberto.
- [ ] Suporte e capacidade operacional preparados.
- [ ] Critérios e limites de coorte aprovados.
- [ ] Estratégia de pausa/recuo por coorte homologada.
- [ ] Autorização expressa e prompt próprio para a Fase 8 registrados.

## Registro de autorizações

| Gate | Fase autorizada | Responsáveis | Evidência/data | Estado |
|---|---|---|---|---|
| A | Fase 1 | a definir | — | pendente |
| B | Fases 2 e 3, cada uma com prompt próprio | a definir | — | pendente |
| C | Fase 4 | a definir | — | pendente |
| D | Fase 5 | a definir | — | pendente |
| E | Fase 7 | a definir | — | pendente |
| F | Fase 8 | a definir | — | pendente |

A Fase 6 é documental/comercial e também exige autorização e prompt próprios, mas suas perguntas podem ser trabalhadas em paralelo. Nenhum gate concede autorização geral de implementação.
