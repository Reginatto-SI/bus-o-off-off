# 02 — PRD principal: implementação futura do Mercado Pago Marketplace

**Última revisão:** 2026-08-04
**Status:** planejamento; não autorizado para desenvolvimento
**Base oficial:** [auditoria de viabilidade](../../Analises/analise-viabilidade-mercado-pago-marketplace.md)
**Navegação:** [índice](./00-mercado-pago-indice-geral.md) · [roadmap](./20-mercado-pago-roadmap.md) · [backlog](./21-mercado-pago-backlog-tecnico.md)

## 1. Visão geral

Organizar a evolução futura do SmartBus para suportar um provedor selecionável por empresa, preservando o Asaas e avaliando Mercado Pago. A implementação somente poderá começar após o checklist de validação e deverá passar por oito fases com gates independentes.

## 2. Objetivos

- preservar o ciclo único de venda, ticket, confirmação e reconciliação;
- manter o motor financeiro oficial independente do provedor;
- isolar empresa, provedor e ambiente em toda operação;
- conectar a conta Mercado Pago da empresa exclusivamente por OAuth server-side;
- validar 1:1 sem prometer split multipartes;
- condicionar 1:N a confirmação formal comercial e técnica;
- habilitar piloto e expansão somente com evidência operacional.

## 3. Contexto

A arquitetura e os acoplamentos comprovados estão na auditoria. O Asaas é o provedor oficial e funcional. Mercado Pago é candidato adicional, não substituto. `application_fee`/`marketplace_fee` 1:1 não liquida nativamente as parcelas de sócio e representante.

## 4. Escopo futuro

- fronteira mínima de providers e capabilities;
- provider por empresa/ambiente e provider congelado na venda/tentativa;
- OAuth, criação, consulta, webhook, reembolso e conciliação MP;
- POC sandbox 1:1; avaliação 1:N; feature flag; piloto; rollout opt-in;
- observabilidade, idempotência, segurança e compatibilidade Asaas.

## 5. Fora do escopo

- substituir ou degradar o Asaas;
- copiar ou alterar o motor financeiro e o split oficial;
- fallback automático entre gateways;
- cobranças separadas por beneficiário;
- considerar 1:N disponível sem contrato/evidência;
- repasse interno sem projeto e aprovações jurídica, contábil e financeira;
- armazenar/exibir tokens no frontend.

## 6. Arquitetura pretendida

```text
Venda (company + provider + environment + adapter version)
  -> orquestrador de pagamentos
     -> decisão financeira imutável (motor oficial)
     -> adapter selecionado + capabilities
        -> Asaas | Mercado Pago
  -> evento normalizado / consulta
  -> finalização compartilhada e idempotente
  -> snapshot + logs + ledger coerentes
```

A interface de provider não deve apagar diferenças. Toda operação não suportada retorna estado explícito. Credenciais são resolvidas server-side pelo triplo `(company_id, provider, environment)`.

## 7. Princípios

1. Evidência antes de suposição.
2. Compatibilidade regressiva com vendas Asaas.
3. Provider e ambiente imutáveis durante a tentativa.
4. Webhook prioritário; consulta é fallback.
5. Uma finalização de venda/tickets.
6. Uma decisão financeira alimenta snapshot, payload, log e ledger.
7. Fail closed para identidade/valor/assinatura; fail open somente para recebedor interno ausente conforme regra vigente.
8. Segredos nunca atravessam o frontend.
9. Feature flag e expansão por empresa.
10. Decisão comercial não é inferida de capacidade técnica.

### Regra do sócio global

O sócio é global da plataforma, não pertence a empresa cliente e nunca é filtrado por `company_id`. Status administrativo não determina elegibilidade financeira. A única condição operacional para recebimento direto é uma conta ou wallet válida no provider **e no ambiente da venda**, sem completar produção com sandbox. Conta ausente não bloqueia a venda: a parcela é redirecionada conforme os quatro cenários oficiais, e a mesma decisão deve alimentar snapshot, payload, diagnóstico, logs e ledger.

## 8. Requisitos funcionais

| ID | Requisito |
|---|---|
| RF-01 | Administrador autorizado visualiza provider e saúde por ambiente. |
| RF-02 | Empresa conecta/reconecta/revoga MP via OAuth sem visualizar token. |
| RF-03 | Nova venda congela provider, ambiente, integração e versão do adapter. |
| RF-04 | Orquestrador cria/consulta pagamento apenas no provider congelado. |
| RF-05 | Idempotência e consulta resolvem resultados ambíguos sem cobrança duplicada. |
| RF-06 | Webhook validado e deduplicado correlaciona empresa, ambiente, valor e referência. |
| RF-07 | Webhook e fallback reutilizam a finalização única. |
| RF-08 | Diagnóstico e conciliação exibem provider/status sem revelar divisão confidencial. |
| RF-09 | Reembolso e chargeback obedecem matriz homologada por provider. |
| RF-10 | Asaas continua operando sem regressão e vendas históricas permanecem consultáveis. |

## 9. Requisitos não funcionais

- isolamento tenant/ambiente demonstrado por testes RLS e server-side;
- tokens criptografados/cofre, rotação, auditoria e menor privilégio;
- constraints de unicidade para tentativa, pagamento e evento;
- logs estruturados sem dados sensíveis, com provider/version/correlation id;
- tolerância a retry, duplicação, atraso e ordem invertida de webhook;
- rastreabilidade entre requisito, tarefa, decisão, risco, teste e evidência;
- rollback sem trocar provider de tentativa em curso;
- métricas e alertas por provider, ambiente e empresa.

## 10. Premissas

- Asaas permanece oficial.
- Ambientes têm a mesma regra; apenas credenciais/endpoints/dados externos variam.
- 1:1 possui somente vendedor e marketplace sob as hipóteses da auditoria.
- 1:N está indisponível até confirmação formal.
- Regra financeira e confidencialidade permanecem invariantes.

## 11. Dependências

- aprovação deste conjunto documental e da arquitetura;
- respostas do [registro de dúvidas](./24-mercado-pago-duvidas-abertas.md);
- aplicação, contas e ambiente de teste MP;
- solução de secrets aprovada;
- matriz de reembolso/chargeback;
- feature flag, rollback, suporte e responsáveis definidos;
- aprovação comercial para qualquer uso de 1:N.

## 12. Riscos

O registro único é [23 — riscos](./23-mercado-pago-registro-riscos.md). Bloqueadores: falsa equivalência 1:1, mistura tenant/ambiente, duplicidade após timeout, token exposto, divergência entre decisão/payload/ledger e reversão após liquidação.

## 13. Critérios de aceite do projeto

- oito fases aprovadas nos respectivos critérios;
- invariantes financeiros e isolamento cobertos por testes;
- Asaas sem regressão;
- OAuth e ciclo MP homologados;
- conciliação fecha valor/status/tarifa/comissão;
- solução A/B/C decidida formalmente, sem assumir 1:N;
- piloto atinge métricas e não apresenta incidente crítico;
- operação, suporte e rollback aprovados.

## 14. Entrada em produção

Exige checklist [25](./25-mercado-pago-validacoes-pre-implementacao.md) completo, fase 7 encerrada, go/no-go assinado, credenciais de produção segregadas, webhooks homologados, alertas/runbook/on-call ativos, reconciliação aprovada e empresa piloto com aceite. Cenários A/B/C só entram se a forma de liquidação estiver formalmente aprovada.

## 15. Roadmap

| Ordem | Fase | Gate principal |
|---:|---|---|
| 1 | Preparação da arquitetura | invariantes e contratos aprovados |
| 2 | Camada de providers | Asaas passa por testes sem mudança funcional |
| 3 | Configuração por empresa | isolamento e freeze comprovados |
| 4 | OAuth MP | segurança e ciclo de token homologados |
| 5 | POC 1:1 | ciclo sandbox e conciliação comprovados |
| 6 | Avaliação 1:N | decisão comercial registrada |
| 7 | Piloto | autorização executiva e guardrails ativos |
| 8 | Expansão | SLOs do piloto atendidos |

Detalhes, dependências e bifurcações: [roadmap completo](./20-mercado-pago-roadmap.md).

## 16. Governança

Decisões entram no [registro arquitetural](./22-mercado-pago-registro-decisoes.md); riscos no [registro de riscos](./23-mercado-pago-registro-riscos.md); dúvidas no [registro aberto](./24-mercado-pago-duvidas-abertas.md); execução no [backlog](./21-mercado-pago-backlog-tecnico.md). Divergência entre documentos deve ser resolvida no PRD principal e vinculada a uma decisão.

Cada fase somente começa após seu gate, autorização expressa e um prompt independente para o Codex que cite o respectivo PRD e IDs do backlog. O Codex deve executar apenas esse recorte e parar ao concluir a fase. Conclusão, merge ou aceite de uma fase não inicia nem autoriza a próxima; alteração fora do PRD da fase é proibida. Este conjunto não contém nem autoriza a criação antecipada desses prompts.
