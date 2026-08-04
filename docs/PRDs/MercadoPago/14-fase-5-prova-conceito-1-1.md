# Fase 5 — Prova de conceito Mercado Pago 1:1

**Status:** não iniciada
**PRD principal:** [02 — implementação futura](./02-mercado-pago-prd-principal-implementacao.md)
**Roadmap:** [20 — roadmap](./20-mercado-pago-roadmap.md) · **Tarefas:** [21 — backlog](./21-mercado-pago-backlog-tecnico.md)

## 1. Objetivo

Validar em sandbox o ciclo 1:1, sem disponibilização comercial e sem liquidar A/B/C.

## 2. Contexto

Esta fase executa somente o recorte definido no PRD principal. Asaas permanece oficial; a regra financeira e o fluxo vigente são invariantes. Resultados devem atualizar decisões, riscos e dúvidas nos registros centrais, evitando duplicação da auditoria.

## 3. Impacto esperado

- Criação idempotente com comissão total.
- Estados aprovado/pendente/recusado.
- Webhook assinado + consulta fallback.
- Reembolso e conciliação.
- Separação teste/produção.

Não há autorização de alteração em produção decorrente apenas da conclusão documental desta fase.

## 4. Requisitos

- **R5.1:** Criação idempotente com comissão total.
- **R5.2:** Estados aprovado/pendente/recusado.
- **R5.3:** Webhook assinado + consulta fallback.
- **R5.4:** Reembolso e conciliação.
- **R5.5:** Separação teste/produção.
- **R5.S1:** preservar `company_id`, provider e ambiente em toda correlação.
- **R5.S2:** não expor secrets nem a divisão confidencial.
- **R5.F1:** consumir a decisão do motor financeiro; nunca copiar a fórmula.
- **R5.A1:** registrar evidências, riscos e decisões antes do gate.

## 5. Dependências

- Fases 1–4 aceitas.
- Empresa e contas controladas.
- Feature flag somente interna.
- [Validações pré-implementação](./25-mercado-pago-validacoes-pre-implementacao.md) aplicáveis completas.

## 6. Riscos específicos

- POC confundida com produção.
- Comissão tratada como split multipartes.
- Cobrança duplicada em timeout.
- Regressão do Asaas ou de vendas históricas.

Mitigações e owners devem ser mantidos no [registro de riscos](./23-mercado-pago-registro-riscos.md).

## 7. Checklist técnico

- [ ] `POC-01` concluída e com evidência vinculada.
- [ ] `POC-02` concluída e com evidência vinculada.
- [ ] `POC-03` concluída e com evidência vinculada.
- [ ] `QA-02` concluída e com evidência vinculada.
- [ ] Testes positivos, negativos, concorrentes e de isolamento definidos.
- [ ] Observabilidade, segurança, rollback e compatibilidade avaliados.
- [ ] Nenhum dado sensível incluído em evidências.

## 8. Checklist funcional

- [ ] Jornada da empresa descrita e aprovada.
- [ ] Estados pendente, sucesso, erro e recuperação descritos.
- [ ] Diferenças Asaas/MP visíveis onde relevantes.
- [ ] Confidencialidade da divisão preservada.
- [ ] Comportamento sandbox/produção equivalente e segregado.

## 9. Critérios de aceite

- Todos os requisitos desta fase possuem evidência revisada.
- Testes/checklists aplicáveis foram aprovados pelos responsáveis.
- Nenhum risco crítico aberto foi aceito informalmente.
- Dependências e impacto na fase seguinte estão atualizados.
- Não houve alteração silenciosa de regra financeira ou provider.

## 10. Critérios para conclusão da fase

- [ ] Aceite técnico registrado.
- [ ] Aceite de segurança registrado.
- [ ] Aceite financeiro/jurídico quando aplicável.
- [ ] ADRs e dúvidas atualizados.
- [ ] Gate para a próxima fase explicitamente aprovado; caso contrário, status `bloqueada`.

## Limites de execução da fase

- **Pode analisar:** ciclo MP 1:1 em contas e sandbox controlados.
- **Pode alterar futuramente, somente com autorização desta fase:** POC sob flag interna: criar/consultar/webhook/refund/conciliar.
- **Não pode alterar:** produção, liberação a empresas, 1:N e repasse interno.
- **Comportamento que deve permanecer idêntico:** Asaas e regra financeira; POC não é split multipartes.
- **Ponto exato de parada:** relatório técnico e decisão de encerrar/repetir a POC.
- **Atividades seguintes proibidas:** habilitar produção ou atividades das Fases 6–8.
- Cada execução exige prompt próprio que cite este PRD e os IDs do backlog; o Codex deve parar neste limite. Concluir esta fase não autoriza a próxima.

## 11. Evidências esperadas

PRs, diagramas, contratos, resultados de testes, pareceres e atas devem referenciar os IDs `POC-01, POC-02, POC-03, QA-02`. Evidência comercial do Mercado Pago deve indicar país, produto, ambiente, versão/data e responsável externo.
