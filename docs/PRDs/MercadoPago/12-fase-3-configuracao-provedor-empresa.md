# Fase 3 — Configuração de provedores por empresa

**Status:** não iniciada
**PRD principal:** [02 — implementação futura](./02-mercado-pago-prd-principal-implementacao.md)
**Roadmap:** [20 — roadmap](./20-mercado-pago-roadmap.md) · **Tarefas:** [21 — backlog](./21-mercado-pago-backlog-tecnico.md)

## 1. Objetivo

Definir seleção segura por empresa e ambiente e congelamento na venda/tentativa.

## 2. Contexto

Esta fase executa somente o recorte definido no PRD principal. Asaas permanece oficial; a regra financeira e o fluxo vigente são invariantes. Resultados devem atualizar decisões, riscos e dúvidas nos registros centrais, evitando duplicação da auditoria.

## 3. Impacto esperado

- Configuração `(company, provider, environment)`.
- Provider/adapter/integration congelados.
- RLS e constraints multi-tenant.
- Leitura compatível de vendas Asaas legadas.

Não há autorização de alteração em produção decorrente apenas da conclusão documental desta fase.

## 4. Requisitos

- **R3.1:** Configuração `(company, provider, environment)`.
- **R3.2:** Provider/adapter/integration congelados.
- **R3.3:** RLS e constraints multi-tenant.
- **R3.4:** Leitura compatível de vendas Asaas legadas.
- **R3.S1:** preservar `company_id`, provider e ambiente em toda correlação.
- **R3.S2:** não expor secrets nem a divisão confidencial.
- **R3.F1:** consumir a decisão do motor financeiro; nunca copiar a fórmula.
- **R3.A1:** registrar evidências, riscos e decisões antes do gate.

## 5. Dependências

- Fase 2 aceita.
- Modelo de dados e threat model aprovados.
- [Validações pré-implementação](./25-mercado-pago-validacoes-pre-implementacao.md) aplicáveis completas.

## 6. Riscos específicos

- Mistura entre tenants/ambientes.
- Troca de provider em tentativa.
- IDs MP em campos Asaas.
- Regressão do Asaas ou de vendas históricas.

Mitigações e owners devem ser mantidos no [registro de riscos](./23-mercado-pago-registro-riscos.md).

## 7. Checklist técnico

- [ ] Comportamento Asaas caracterizado antes de refatoração; nenhuma renomeação, movimentação ou adaptação ocorre sem testes de regressão.
- [ ] Vendas Asaas históricas, payload, split, webhook, confirmação e reconciliação permanecem idênticos; mudança observável bloqueia a fase.
- [ ] `CFG-01` concluída e com evidência vinculada.
- [ ] `CFG-02` concluída e com evidência vinculada.
- [ ] `CFG-03` concluída e com evidência vinculada.
- [ ] `SEC-01` concluída e com evidência vinculada.
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

- **Pode analisar:** modelo multiempresa, freeze, compatibilidade, banco e RLS em projeto aprovado.
- **Pode alterar futuramente, somente com autorização desta fase:** somente estruturas/configuração previstas no PRD quando expressamente autorizadas.
- **Não pode alterar:** OAuth, checkout MP, webhook MP e mudança de regra financeira.
- **Comportamento que deve permanecer idêntico:** Asaas atual e leitura/reconciliação de vendas históricas.
- **Ponto exato de parada:** provider/ambiente/tentativa isolados e aceitos sem ativar MP.
- **Atividades seguintes proibidas:** iniciar OAuth ou atividades das Fases 4–8.
- Cada execução exige prompt próprio que cite este PRD e os IDs do backlog; o Codex deve parar neste limite. Concluir esta fase não autoriza a próxima.

## 11. Evidências esperadas

PRs, diagramas, contratos, resultados de testes, pareceres e atas devem referenciar os IDs `CFG-01, CFG-02, CFG-03, SEC-01`. Evidência comercial do Mercado Pago deve indicar país, produto, ambiente, versão/data e responsável externo.
