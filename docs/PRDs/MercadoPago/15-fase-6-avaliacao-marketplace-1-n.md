# Fase 6 — Avaliação técnica e comercial Marketplace 1:N

**Status:** não iniciada
**PRD principal:** [02 — implementação futura](./02-mercado-pago-prd-principal-implementacao.md)
**Roadmap:** [20 — roadmap](./20-mercado-pago-roadmap.md) · **Tarefas:** [21 — backlog](./21-mercado-pago-backlog-tecnico.md)

## 1. Objetivo

Obter evidência formal e decidir se 1:N atende os quatro cenários; esta fase não implementa 1:N.

## 2. Contexto

Esta fase executa somente o recorte definido no PRD principal. Asaas permanece oficial; a regra financeira e o fluxo vigente são invariantes. Resultados devem atualizar decisões, riscos e dúvidas nos registros centrais, evitando duplicação da auditoria.

## 3. Impacto esperado

- Questionário formal completo.
- Contrato/custos/SLA/volume.
- Sandbox multi-recebedor.
- Matriz refund/chargeback/tarifas.
- ADR GO, GO condicionado ou NO-GO.

Não há autorização de alteração em produção decorrente apenas da conclusão documental desta fase.

## 4. Requisitos

- **R6.1:** Questionário formal completo.
- **R6.2:** Contrato/custos/SLA/volume.
- **R6.3:** Sandbox multi-recebedor.
- **R6.4:** Matriz refund/chargeback/tarifas.
- **R6.5:** ADR GO, GO condicionado ou NO-GO.
- **R6.S1:** preservar `company_id`, provider e ambiente em toda correlação.
- **R6.S2:** não expor secrets nem a divisão confidencial.
- **R6.F1:** consumir a decisão do motor financeiro; nunca copiar a fórmula.
- **R6.A1:** registrar evidências, riscos e decisões antes do gate.

## 5. Dependências

- Contato comercial MP.
- Documentação aplicável ao Brasil.
- POC 1:1 como evidência auxiliar.
- [Validações pré-implementação](./25-mercado-pago-validacoes-pre-implementacao.md) aplicáveis completas.

## 6. Riscos específicos

- Assumir oferta não contratada.
- KYC ou saldo de beneficiário bloquear venda.
- Responsabilidade financeira indefinida.
- Regressão do Asaas ou de vendas históricas.

Mitigações e owners devem ser mantidos no [registro de riscos](./23-mercado-pago-registro-riscos.md).

## 7. Checklist técnico

- [ ] `MP1N-01` concluída e com evidência vinculada.
- [ ] `MP1N-02` concluída e com evidência vinculada.
- [ ] `MP1N-03` concluída e com evidência vinculada.
- [ ] `DEC-01` concluída e com evidência vinculada.
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

- **Pode analisar:** documentação, contrato, sandbox e evidências comerciais 1:N.
- **Pode alterar futuramente, somente com autorização desta fase:** somente questionário, testes autorizados e registro de decisão.
- **Não pode alterar:** implementar 1:N, ledger, repasses, checkout ou produção.
- **Comportamento que deve permanecer idêntico:** Asaas, 1:1 e regras vigentes.
- **Ponto exato de parada:** ADR formal escolhe 1:N, D-only, ledger separado ou NO-GO.
- **Atividades seguintes proibidas:** implementar a decisão ou iniciar piloto/expansão.
- Cada execução exige prompt próprio que cite este PRD e os IDs do backlog; o Codex deve parar neste limite. Concluir esta fase não autoriza a próxima.

## 11. Evidências esperadas

PRs, diagramas, contratos, resultados de testes, pareceres e atas devem referenciar os IDs `MP1N-01, MP1N-02, MP1N-03, DEC-01`. Evidência comercial do Mercado Pago deve indicar país, produto, ambiente, versão/data e responsável externo.
