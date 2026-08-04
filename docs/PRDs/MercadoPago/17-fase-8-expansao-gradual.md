# Fase 8 — Expansão gradual para clientes

**Status:** não iniciada
**PRD principal:** [02 — implementação futura](./02-mercado-pago-prd-principal-implementacao.md)
**Roadmap:** [20 — roadmap](./20-mercado-pago-roadmap.md) · **Tarefas:** [21 — backlog](./21-mercado-pago-backlog-tecnico.md)

## 1. Objetivo

Expandir por coortes opt-in somente após estabilidade do piloto.

## 2. Contexto

Esta fase executa somente o recorte definido no PRD principal. Asaas permanece oficial; a regra financeira e o fluxo vigente são invariantes. Resultados devem atualizar decisões, riscos e dúvidas nos registros centrais, evitando duplicação da auditoria.

## 3. Impacto esperado

- Critérios de elegibilidade automatizáveis.
- Coortes e limites progressivos.
- Onboarding/suporte/relatórios.
- SLOs e revisão periódica de riscos.

Não há autorização de alteração em produção decorrente apenas da conclusão documental desta fase.

## 4. Requisitos

- **R8.1:** Critérios de elegibilidade automatizáveis.
- **R8.2:** Coortes e limites progressivos.
- **R8.3:** Onboarding/suporte/relatórios.
- **R8.4:** SLOs e revisão periódica de riscos.
- **R8.S1:** preservar `company_id`, provider e ambiente em toda correlação.
- **R8.S2:** não expor secrets nem a divisão confidencial.
- **R8.F1:** consumir a decisão do motor financeiro; nunca copiar a fórmula.
- **R8.A1:** registrar evidências, riscos e decisões antes do gate.

## 5. Dependências

- Fase 7 encerrada.
- SLOs atingidos.
- Capacidade operacional e comercial.
- [Validações pré-implementação](./25-mercado-pago-validacoes-pre-implementacao.md) aplicáveis completas.

## 6. Riscos específicos

- Crescimento além do suporte.
- Drift de configuração.
- Expansão para cenário financeiro não aprovado.
- Regressão do Asaas ou de vendas históricas.

Mitigações e owners devem ser mantidos no [registro de riscos](./23-mercado-pago-registro-riscos.md).

## 7. Checklist técnico

- [ ] `ROLL-01` concluída e com evidência vinculada.
- [ ] `ROLL-02` concluída e com evidência vinculada.
- [ ] `ROLL-03` concluída e com evidência vinculada.
- [ ] `OPS-02` concluída e com evidência vinculada.
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

- **Pode analisar:** coorte aprovada, SLOs, suporte, métricas e risco.
- **Pode alterar futuramente, somente com autorização desta fase:** ativação opt-in somente para empresas da coorte autorizada.
- **Não pode alterar:** empresas fora da coorte, cenários não aprovados e expansão automática.
- **Comportamento que deve permanecer idêntico:** Asaas, tentativas existentes e critérios financeiros.
- **Ponto exato de parada:** coorte concluída/avaliada antes de nova autorização.
- **Atividades seguintes proibidas:** ativar outra coorte sem novo gate e prompt.
- Cada execução exige prompt próprio que cite este PRD e os IDs do backlog; o Codex deve parar neste limite. Concluir esta fase não autoriza a próxima.

## 11. Evidências esperadas

PRs, diagramas, contratos, resultados de testes, pareceres e atas devem referenciar os IDs `ROLL-01, ROLL-02, ROLL-03, OPS-02`. Evidência comercial do Mercado Pago deve indicar país, produto, ambiente, versão/data e responsável externo.
