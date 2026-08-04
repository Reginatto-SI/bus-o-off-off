# Fase 1 — Preparação da arquitetura

**Status:** não iniciada
**PRD principal:** [02 — implementação futura](./02-mercado-pago-prd-principal-implementacao.md)
**Roadmap:** [20 — roadmap](./20-mercado-pago-roadmap.md) · **Tarefas:** [21 — backlog](./21-mercado-pago-backlog-tecnico.md)

## 1. Objetivo

Transformar conclusões da auditoria em contratos, invariantes, estados e testes de caracterização, sem integração MP.

## 2. Contexto

Esta fase executa somente o recorte definido no PRD principal. Asaas permanece oficial; a regra financeira e o fluxo vigente são invariantes. Resultados devem atualizar decisões, riscos e dúvidas nos registros centrais, evitando duplicação da auditoria.

## 3. Impacto esperado

- Mapa aprovado do ciclo venda→pagamento→ticket.
- Contrato de `FinancialDecision` imutável.
- Vocabulário neutro de provider/status/evento.
- Baseline de comportamento e compatibilidade Asaas.

Não há autorização de alteração em produção decorrente apenas da conclusão documental desta fase.

## 4. Requisitos

- **R1.1:** Mapa aprovado do ciclo venda→pagamento→ticket.
- **R1.2:** Contrato de `FinancialDecision` imutável.
- **R1.3:** Vocabulário neutro de provider/status/evento.
- **R1.4:** Baseline de comportamento e compatibilidade Asaas.
- **R1.S1:** preservar `company_id`, provider e ambiente em toda correlação.
- **R1.S2:** não expor secrets nem a divisão confidencial.
- **R1.F1:** consumir a decisão do motor financeiro; nunca copiar a fórmula.
- **R1.A1:** registrar evidências, riscos e decisões antes do gate.

## 5. Dependências

- Auditoria revisada.
- Responsáveis de arquitetura, financeiro e segurança.
- [Validações pré-implementação](./25-mercado-pago-validacoes-pre-implementacao.md) aplicáveis completas.

## 6. Riscos específicos

- Alterar comportamento Asaas durante a preparação.
- Contrato genérico esconder diferenças reais.
- Regressão do Asaas ou de vendas históricas.

Mitigações e owners devem ser mantidos no [registro de riscos](./23-mercado-pago-registro-riscos.md).

## 7. Checklist técnico

- [ ] Comportamento Asaas caracterizado antes de refatoração; nenhuma renomeação, movimentação ou adaptação ocorre sem testes de regressão.
- [ ] Vendas Asaas históricas, payload, split, webhook, confirmação e reconciliação permanecem idênticos; mudança observável bloqueia a fase.
- [ ] Plano e casos dos testes de caracterização Asaas produzidos nesta fase.
- [ ] `ARQ-01` concluída e com evidência vinculada.
- [ ] `ARQ-02` concluída e com evidência vinculada.
- [ ] `ARQ-03` concluída e com evidência vinculada.
- [ ] `QA-01` concluída e com evidência vinculada.
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

- **Pode analisar:** ciclo atual, acoplamentos, contratos, invariantes e testes existentes.
- **Pode alterar futuramente, somente com autorização desta fase:** somente documentos, planos e testes de caracterização quando a fase for futuramente autorizada.
- **Não pode alterar:** adapter, migration, RLS, OAuth, integração MP e comportamento runtime.
- **Comportamento que deve permanecer idêntico:** payload, split, webhook, confirmação e reconciliação Asaas.
- **Ponto exato de parada:** entrega e aceite do plano/baseline de caracterização.
- **Atividades seguintes proibidas:** criar adapter, alterar fronteira ou iniciar qualquer atividade das Fases 2–8.
- Cada execução exige prompt próprio que cite este PRD e os IDs do backlog; o Codex deve parar neste limite. Concluir esta fase não autoriza a próxima.

## 11. Evidências esperadas

PRs, diagramas, contratos, resultados de testes, pareceres e atas devem referenciar os IDs `ARQ-01, ARQ-02, ARQ-03, QA-01`. Evidência comercial do Mercado Pago deve indicar país, produto, ambiente, versão/data e responsável externo.
