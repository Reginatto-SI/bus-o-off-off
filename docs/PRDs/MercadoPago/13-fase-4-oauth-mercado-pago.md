# Fase 4 — OAuth Mercado Pago

**Status:** não iniciada
**PRD principal:** [02 — implementação futura](./02-mercado-pago-prd-principal-implementacao.md)
**Roadmap:** [20 — roadmap](./20-mercado-pago-roadmap.md) · **Tarefas:** [21 — backlog](./21-mercado-pago-backlog-tecnico.md)

## 1. Objetivo

Planejar conexão OAuth por empresa/ambiente inteiramente server-side.

## 2. Contexto

Esta fase executa somente o recorte definido no PRD principal. Asaas permanece oficial; a regra financeira e o fluxo vigente são invariantes. Resultados devem atualizar decisões, riscos e dúvidas nos registros centrais, evitando duplicação da auditoria.

## 3. Impacto esperado

- Start/callback com state de uso único.
- PKCE quando aplicável.
- Cofre, refresh, rotação, revogação e reconexão.
- Saúde da integração e auditoria.

Não há autorização de alteração em produção decorrente apenas da conclusão documental desta fase.

## 4. Requisitos

- **R4.1:** Start/callback com state de uso único.
- **R4.2:** PKCE quando aplicável.
- **R4.3:** Cofre, refresh, rotação, revogação e reconexão.
- **R4.4:** Saúde da integração e auditoria.
- **R4.S1:** preservar `company_id`, provider e ambiente em toda correlação.
- **R4.S2:** não expor secrets nem a divisão confidencial.
- **R4.F1:** consumir a decisão do motor financeiro; nunca copiar a fórmula.
- **R4.A1:** registrar evidências, riscos e decisões antes do gate.

## 5. Dependências

- Fase 3 aceita.
- Aplicação/redirect URIs MP.
- Secrets manager aprovado.
- Documentação OAuth oficial confirmada.
- [Validações pré-implementação](./25-mercado-pago-validacoes-pre-implementacao.md) aplicáveis completas.

## 6. Riscos específicos

- Sequestro de callback/state.
- Token no frontend/log.
- Refresh concorrente.
- Conta externa errada.
- Regressão do Asaas ou de vendas históricas.

Mitigações e owners devem ser mantidos no [registro de riscos](./23-mercado-pago-registro-riscos.md).

## 7. Checklist técnico

- [ ] `OAUTH-01` concluída e com evidência vinculada.
- [ ] `OAUTH-02` concluída e com evidência vinculada.
- [ ] `OAUTH-03` concluída e com evidência vinculada.
- [ ] `OAUTH-04` concluída e com evidência vinculada.
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

- **Pode analisar:** OAuth, secrets, callback, saúde, revogação e auditoria.
- **Pode alterar futuramente, somente com autorização desta fase:** fluxo OAuth server-side de sandbox estritamente autorizado.
- **Não pode alterar:** ativação do Mercado Pago no checkout, pagamento, split e produção.
- **Comportamento que deve permanecer idêntico:** checkout e processamento Asaas.
- **Ponto exato de parada:** conexão sandbox homologada sem criar cobrança.
- **Atividades seguintes proibidas:** iniciar POC/pagamento ou atividades das Fases 5–8.
- Cada execução exige prompt próprio que cite este PRD e os IDs do backlog; o Codex deve parar neste limite. Concluir esta fase não autoriza a próxima.

## 11. Evidências esperadas

PRs, diagramas, contratos, resultados de testes, pareceres e atas devem referenciar os IDs `OAUTH-01, OAUTH-02, OAUTH-03, OAUTH-04`. Evidência comercial do Mercado Pago deve indicar país, produto, ambiente, versão/data e responsável externo.
