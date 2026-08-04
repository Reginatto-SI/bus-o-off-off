# Roadmap — Mercado Pago Marketplace

**Status:** planejamento
**Referências:** [PRD principal](./02-mercado-pago-prd-principal-implementacao.md) · [backlog](./21-mercado-pago-backlog-tecnico.md) · [dúvidas](./24-mercado-pago-duvidas-abertas.md)

## 1. Sequência e dependências

```text
F1 Arquitetura → F2 Providers → F3 Configuração → F4 OAuth → F5 POC 1:1
                                                          ↓
                                          F6 Decisão comercial 1:N
                                                          ↓
                               GO/GO condicionado/NO-GO financeiro
                                                          ↓
                                        F7 Piloto → F8 Expansão
```

| Fase | Predecessora obrigatória | Marco | Bloqueio de saída | Decisão |
|---|---|---|---|---|
| F1 | documentação aprovada | contratos/invariantes | regra ou ownership indefinido | arquitetura aceita? |
| F2 | F1 | adapter Asaas caracterizado | regressão Asaas | fronteira mínima serve? |
| F3 | F2 | provider congelado | RLS/tenant/ambiente não comprovados | modelo seguro? |
| F4 | F3 | OAuth homologado | state/cofre/refresh/revogação incompletos | conexão segura? |
| F5 | F4 | ciclo sandbox 1:1 | duplicidade, webhook ou conciliação falham | POC comprovou 1:1? |
| F6 | evidência MP; pode pesquisar em paralelo, encerra após F5 | ADR de liquidação | respostas/contrato 1:N ausentes | 1:N, D-only, ledger ou NO-GO? |
| F7 | F1–F6 e aprovação executiva | primeira venda piloto conciliada | risco crítico/rollback/SLA | continuar piloto? |
| F8 | F7 | primeira coorte | SLO ou capacidade insuficiente | ampliar, manter ou recuar? |

## 2. Marcos

- **M0 — prontidão documental:** checklist pré-implementação aprovado.
- **M1 — neutralidade controlada:** Asaas opera através da fronteira sem mudança observável.
- **M2 — isolamento:** provider/configuração/tentativa não cruzam tenant ou ambiente.
- **M3 — conexão MP:** OAuth seguro e auditável em sandbox.
- **M4 — POC técnica:** pagamento 1:1, webhook, consulta, refund e conciliação evidenciados.
- **M5 — decisão financeira:** caminho para A/B/C e D formalmente decidido.
- **M6 — piloto:** volume limitado, SLO e reconciliação cumpridos.
- **M7 — expansão:** coortes opt-in aprovadas.

## 3. Gates comerciais do Mercado Pago

Dependem de confirmação formal: disponibilidade/limites 1:N, participantes, OAuth/KYC, valores fixos, beneficiário opcional, meios, tarifas, refunds, chargebacks, saldo insuficiente, sandbox, relatórios, contrato, volume, SLA e custos. Pesquisa pode ocorrer paralelamente às fases 1–5, mas **F6 não encerra e F7 não inicia** sem decisão registrada.

## 4. Pontos de decisão

1. Após F1: prosseguir ou revisar arquitetura.
2. Após F5: POC técnica aprovada, repetir ou encerrar.
3. Em F6: (a) 1:N formal; (b) piloto restrito ao cenário D; (c) projeto separado de ledger aprovado; (d) NO-GO e manter Asaas.
4. Após F7: expandir, estabilizar, suspender novas adesões ou rollback.

## 5. Regras de planejamento

Não usar calendário para ultrapassar gate. Nenhuma dependência comercial vira “resolvida” por inferência. Uma tentativa em curso jamais troca provider no rollback. Cada marco atualiza backlog, riscos, dúvidas e ADRs.

Cada fase exige prompt próprio para o Codex, com referência ao PRD e backlog correspondentes, além de autorização posterior ao gate aplicável. O Codex deve parar no ponto de conclusão da fase. Nenhuma fase é automática, a conclusão de uma não autoriza a seguinte e qualquer atividade fora do PRD autorizado é proibida. Os prompts não fazem parte deste entregável e só podem ser preparados quando a fase for expressamente autorizada.

Perguntas 1:N podem ser investigadas em paralelo e **não bloqueiam F1, nem a preparação arquitetural**. Elas bloqueiam a conclusão de F6, o início de qualquer piloto que prometa A/B/C e toda implantação ou comunicação de equivalência financeira completa.
