# Backlog técnico — Mercado Pago Marketplace

**Escala:** prioridade `P0` bloqueante, `P1` alta, `P2` normal; estimativa relativa `PP`, `P`, `M`, `G`, `GG` (não representa horas).
**Referências:** [roadmap](./20-mercado-pago-roadmap.md) · [PRDs por fase](./00-mercado-pago-indice-geral.md)

## Fase 1 — Preparação

| ID | Descrição | Pri. | Dependências | Impacto | Est. |
|---|---|---|---|---|---|
| ARQ-01 | Aprovar invariantes e mapa do ciclo atual | P0 | auditoria | evita regressão | M |
| ARQ-02 | Especificar `FinancialDecision` imutável | P0 | ARQ-01 | coerência financeira | M |
| ARQ-03 | Especificar estados/eventos neutros e status bruto | P1 | ARQ-01 | interoperabilidade | M |
| QA-01 | Criar plano de caracterização Asaas | P0 | ARQ-01 | baseline | G |

## Fase 2 — Providers

| ID | Descrição | Pri. | Dependências | Impacto | Est. |
|---|---|---|---|---|---|
| PROV-01 | Definir interface/registry/versionamento | P0 | ARQ-02/03 | fronteira mínima | G |
| PROV-02 | Definir capabilities e `unsupported` | P0 | PROV-01 | diferenças explícitas | M |
| PROV-03 | Planejar adapter Asaas sem mudança funcional | P0 | QA-01, PROV-01 | compatibilidade | GG |
| PROV-04 | Planejar orquestrador/finalização única | P0 | PROV-01 | evita fluxo paralelo | G |

## Fase 3 — Configuração

| ID | Descrição | Pri. | Dependências | Impacto | Est. |
|---|---|---|---|---|---|
| CFG-01 | Modelar integração company/provider/environment | P0 | PROV-01 | isolamento | G |
| CFG-02 | Modelar freeze provider/adapter/tentativa | P0 | CFG-01 | idempotência | G |
| CFG-03 | Planejar compatibilidade de vendas Asaas | P0 | CFG-02 | histórico | M |
| SEC-01 | Threat model, RLS, constraints e service-role predicates | P0 | CFG-01 | segurança tenant | G |

## Fase 4 — OAuth

| ID | Descrição | Pri. | Dependências | Impacto | Est. |
|---|---|---|---|---|---|
| OAUTH-01 | Confirmar OAuth/PKCE/scopes/redirects oficiais | P0 | resposta MP | contrato técnico | M |
| OAUTH-02 | Projetar state de uso único e callback tenant-bound | P0 | OAUTH-01, SEC-01 | antifraude | G |
| OAUTH-03 | Projetar cofre, refresh e rotação concorrente | P0 | secrets aprovados | sigilo | G |
| OAUTH-04 | Projetar revogação, reconexão, saúde e auditoria | P1 | OAUTH-03 | operação | M |

## Fase 5 — POC 1:1

| ID | Descrição | Pri. | Dependências | Impacto | Est. |
|---|---|---|---|---|---|
| POC-01 | Validar criação 1:1 e idempotência sandbox | P0 | F1–F4 | pagamento | G |
| POC-02 | Validar webhook, consulta e estados | P0 | POC-01 | convergência | G |
| POC-03 | Validar refund, tarifas e conciliação | P0 | POC-02 | financeiro | G |
| QA-02 | Executar timeout, replay, mismatch e isolamento | P0 | POC-01/02 | segurança operacional | G |

## Fase 6 — 1:N

| ID | Descrição | Pri. | Dependências | Impacto | Est. |
|---|---|---|---|---|---|
| MP1N-01 | Enviar questionário formal completo | P0 | contato MP | desbloqueio comercial | P |
| MP1N-02 | Validar contrato, custos, SLA, volume e KYC | P0 | MP1N-01 | viabilidade | G |
| MP1N-03 | Validar sandbox/refund/chargeback/conciliação | P0 | evidência MP | equivalência | GG |
| DEC-01 | Registrar decisão 1:N, D-only, ledger ou NO-GO | P0 | MP1N-02/03 | direção do produto | M |

## Fase 7 — Piloto

| ID | Descrição | Pri. | Dependências | Impacto | Est. |
|---|---|---|---|---|---|
| PILOT-01 | Definir elegibilidade, empresa, limites e aceite | P0 | DEC-01 | contenção | M |
| PILOT-02 | Preparar flag/allowlist/kill switch/rollback | P0 | PILOT-01 | controle | G |
| PILOT-03 | Executar e conciliar piloto com gates | P0 | PILOT-02 | evidência real | GG |
| OPS-01 | Ativar runbook, alertas, suporte e on-call | P0 | PILOT-02 | operação | G |

## Fase 8 — Expansão

| ID | Descrição | Pri. | Dependências | Impacto | Est. |
|---|---|---|---|---|---|
| ROLL-01 | Definir coortes opt-in e critérios | P0 | piloto aceito | expansão segura | M |
| ROLL-02 | Automatizar checklist sem automatizar autorização | P1 | ROLL-01 | escala | G |
| ROLL-03 | Expandir/recuar por métricas e gate | P0 | ROLL-01/02 | controle de risco | GG |
| OPS-02 | Revisar capacidade, SLOs e riscos por coorte | P1 | OPS-01 | sustentabilidade | M |

## Definição de pronto de uma tarefa

Descrição e dependências atendidas; PR/evidência ligada; testes e segurança revisados; riscos/dúvidas/ADR atualizados; nenhuma mudança de regra implícita; aceite do owner registrado.
