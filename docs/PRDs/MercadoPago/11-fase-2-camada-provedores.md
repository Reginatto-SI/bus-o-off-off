# Fase 2 — Camada mínima de provedores

**Status:** não iniciada
**PRD principal:** [02 — implementação futura](./02-mercado-pago-prd-principal-implementacao.md)
**Roadmap:** [20 — roadmap](./20-mercado-pago-roadmap.md) · **Tarefas:** [21 — backlog](./21-mercado-pago-backlog-tecnico.md)

## 1. Objetivo

Planejar e futuramente introduzir uma fronteira mínima de adapter, mantendo o comportamento Asaas observável e idêntico.

## 2. Contexto

Esta fase executa somente o recorte definido no PRD principal. Asaas permanece oficial; a regra financeira e o fluxo vigente são invariantes. Resultados devem atualizar decisões, riscos e dúvidas nos registros centrais, evitando duplicação da auditoria.

## 3. Impacto esperado

- Registry server-side por provider/version.
- Capabilities explícitas.
- Operações validar/criar/consultar/reembolsar/webhook/conciliar.
- Finalização única fora dos adapters.

Não há autorização de alteração em produção decorrente apenas da conclusão documental desta fase.

## 4. Requisitos

- **R2.1:** Registry server-side por provider/version.
- **R2.2:** Capabilities explícitas.
- **R2.3:** Operações validar/criar/consultar/reembolsar/webhook/conciliar.
- **R2.4:** Finalização única fora dos adapters.
- **R2.S1:** preservar `company_id`, provider e ambiente em toda correlação.
- **R2.S2:** não expor secrets nem a divisão confidencial.
- **R2.F1:** consumir a decisão do motor financeiro; nunca copiar a fórmula.
- **R2.A1:** registrar evidências, riscos e decisões antes do gate.

## 5. Dependências

- Fase 1 aceita.
- Testes de caracterização Asaas verdes.
- [Validações pré-implementação](./25-mercado-pago-validacoes-pre-implementacao.md) aplicáveis completas.

## 6. Riscos específicos

- Refatoração ampla.
- Fallback silencioso.
- Recalcular taxa no adapter.
- Regressão do Asaas ou de vendas históricas.

Mitigações e owners devem ser mantidos no [registro de riscos](./23-mercado-pago-registro-riscos.md).

## 7. Checklist técnico

- [ ] Comportamento Asaas caracterizado antes de refatoração; nenhuma renomeação, movimentação ou adaptação ocorre sem testes de regressão.
- [ ] Vendas Asaas históricas, payload, split, webhook, confirmação e reconciliação permanecem idênticos; mudança observável bloqueia a fase.
- [ ] Adapter Asaas comprova equivalência ao comportamento atual antes de qualquer inclusão de outro provider.
- [ ] `PROV-01` concluída e com evidência vinculada.
- [ ] `PROV-02` concluída e com evidência vinculada.
- [ ] `PROV-03` concluída e com evidência vinculada.
- [ ] `PROV-04` concluída e com evidência vinculada.
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

- **Pode analisar:** fronteiras internas, capabilities, finalização e baseline Asaas.
- **Pode alterar futuramente, somente com autorização desta fase:** contrato/registry e encapsulamento mínimo estritamente autorizados, após testes de caracterização verdes.
- **Não pode alterar:** integração MP, OAuth, schema/configuração tenant e UI.
- **Comportamento que deve permanecer idêntico:** todo comportamento observável do Asaas e vendas históricas.
- **Ponto exato de parada:** adapter Asaas reproduz o comportamento atual e testes permanecem verdes.
- **Atividades seguintes proibidas:** integrar Mercado Pago ou iniciar configuração/OAuth das Fases 3–8.
- Cada execução exige prompt próprio que cite este PRD e os IDs do backlog; o Codex deve parar neste limite. Concluir esta fase não autoriza a próxima.

## 11. Evidências esperadas

PRs, diagramas, contratos, resultados de testes, pareceres e atas devem referenciar os IDs `PROV-01, PROV-02, PROV-03, PROV-04`. Evidência comercial do Mercado Pago deve indicar país, produto, ambiente, versão/data e responsável externo.
