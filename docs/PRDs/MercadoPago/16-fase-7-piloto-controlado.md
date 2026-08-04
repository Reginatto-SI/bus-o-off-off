# Fase 7 — Piloto controlado

**Status:** não iniciada
**PRD principal:** [02 — implementação futura](./02-mercado-pago-prd-principal-implementacao.md)
**Roadmap:** [20 — roadmap](./20-mercado-pago-roadmap.md) · **Tarefas:** [21 — backlog](./21-mercado-pago-backlog-tecnico.md)

## 1. Objetivo

Operar com uma empresa elegível, feature flag e limites explícitos após decisão de liquidação.

## 2. Contexto

Esta fase executa somente o recorte definido no PRD principal. Asaas permanece oficial; a regra financeira e o fluxo vigente são invariantes. Resultados devem atualizar decisões, riscos e dúvidas nos registros centrais, evitando duplicação da auditoria.

## 3. Impacto esperado

- Elegibilidade e aceite da empresa.
- Flag/allowlist/limites.
- Runbook, alertas, conciliação diária e rollback.
- Suporte e go/no-go executivo.

Não há autorização de alteração em produção decorrente apenas da conclusão documental desta fase.

## 4. Requisitos

- **R7.1:** Elegibilidade e aceite da empresa.
- **R7.2:** Flag/allowlist/limites.
- **R7.3:** Runbook, alertas, conciliação diária e rollback.
- **R7.4:** Suporte e go/no-go executivo.
- **R7.S1:** preservar `company_id`, provider e ambiente em toda correlação.
- **R7.S2:** não expor secrets nem a divisão confidencial.
- **R7.F1:** consumir a decisão do motor financeiro; nunca copiar a fórmula.
- **R7.A1:** registrar evidências, riscos e decisões antes do gate.

## 5. Dependências

- Fases 1–5 aceitas.
- Decisão da fase 6.
- Tratamento A/B/C aprovado ou piloto restrito a D.
- [Validações pré-implementação](./25-mercado-pago-validacoes-pre-implementacao.md) aplicáveis completas.

## 6. Riscos específicos

- Incidente financeiro real.
- Rollback criar segunda cobrança.
- Operação sem cobertura.
- Regressão do Asaas ou de vendas históricas.

Mitigações e owners devem ser mantidos no [registro de riscos](./23-mercado-pago-registro-riscos.md).

## 7. Checklist técnico

- [ ] `PILOT-01` concluída e com evidência vinculada.
- [ ] `PILOT-02` concluída e com evidência vinculada.
- [ ] `PILOT-03` concluída e com evidência vinculada.
- [ ] `OPS-01` concluída e com evidência vinculada.
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

- **Pode analisar:** uma empresa elegível, limites, operação, conciliação e incidentes.
- **Pode alterar futuramente, somente com autorização desta fase:** piloto na allowlist e cenários expressamente aprovados.
- **Não pode alterar:** expansão para outras empresas/coortes ou cenários não aprovados.
- **Comportamento que deve permanecer idêntico:** tentativas existentes, Asaas e limites do piloto.
- **Ponto exato de parada:** relatório e go/no-go pós-piloto.
- **Atividades seguintes proibidas:** iniciar Fase 8 ou ampliar a allowlist.
- Cada execução exige prompt próprio que cite este PRD e os IDs do backlog; o Codex deve parar neste limite. Concluir esta fase não autoriza a próxima.

## 11. Evidências esperadas

PRs, diagramas, contratos, resultados de testes, pareceres e atas devem referenciar os IDs `PILOT-01, PILOT-02, PILOT-03, OPS-01`. Evidência comercial do Mercado Pago deve indicar país, produto, ambiente, versão/data e responsável externo.
