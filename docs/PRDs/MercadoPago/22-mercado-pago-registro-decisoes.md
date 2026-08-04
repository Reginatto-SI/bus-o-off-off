# Registro de decisões arquiteturais — Mercado Pago

**Uso:** distinguir regra vigente, conclusão de auditoria, proposta ainda pendente, aprovação formal e rejeição.
**Navegação:** [PRD principal](./02-mercado-pago-prd-principal-implementacao.md) · [riscos](./23-mercado-pago-registro-riscos.md) · [dúvidas](./24-mercado-pago-duvidas-abertas.md)

## 1. Classes e estados

| Classificação | Significado |
|---|---|
| `normativa vigente` | Diretriz oficial do SmartBus; não depende de aprovação deste projeto. |
| `conclusão técnica` | Resultado demonstrado pela auditoria; informa a decisão, mas não autoriza implementação. |
| `proposta` | Modelagem ainda não autorizada; permanece pendente até o gate e responsável competente. |
| `formalmente aprovada` | Decisão com responsável, data e evidência registrados. |
| `rejeitada` | Alternativa proibida/descartada, com justificativa preservada. |
| `substituída` | Decisão histórica sucedida por outra ADR. |

Não marcar proposta como aprovada por estar escrita em PRD. Toda aprovação futura exige responsável, data, evidência e gate. Não apagar decisões; vincular a sucessora.

## 2. Regras normativas vigentes

| ADR | Classificação | Decisão | Fundamento / consequência |
|---|---|---|---|
| MP-ADR-001 | normativa vigente | Asaas permanece funcional e oficial durante a evolução; MP é adicional | impede substituição ou regressão implícita |
| MP-ADR-002 | normativa vigente | O motor financeiro não pode ser duplicado | uma decisão alimenta snapshot, payload, diagnóstico, logs e ledger |
| MP-ADR-003 | normativa vigente | Provider e ambiente são congelados na venda ou tentativa | impede fallback e mistura entre tentativas |
| MP-ADR-004 | normativa vigente | Não haverá fallback automático MP → Asaas | evita cobrança dupla |
| MP-ADR-005 | normativa vigente | Uma venda não gera cobranças separadas por beneficiário | preserva o contrato financeiro oficial |
| MP-ADR-006 | normativa vigente | MP 1:1 não equivale a split multipartes | comissão única não liquida A/B/C |
| MP-ADR-007 | normativa vigente | MP 1:N não é disponível sem evidência formal | elimina suposição comercial |
| MP-ADR-008 | normativa vigente | Sócio global é elegível apenas por conta válida no provider/ambiente, sem status ou `company_id` | ausência redireciona parcela sem bloquear a venda |

## 3. Conclusões técnicas da auditoria

| ADR | Classificação | Conclusão | Consequência |
|---|---|---|---|
| MP-ADR-010 | conclusão técnica | Finalização única e webhook prioritário são partes reutilizáveis | adapters não devem duplicar finalização |
| MP-ADR-011 | conclusão técnica | Modelo persistente e superfícies atuais possuem acoplamento Asaas | evolução requer compatibilidade explícita |
| MP-ADR-012 | conclusão técnica | Repasse interno é alternativa de alto risco | exige projeto e aprovações separados |

## 4. Propostas pendentes de gate

| ADR | Classificação | Proposta | Gate de decisão |
|---|---|---|---|
| MP-ADR-020 | proposta | Introduzir registry/interface mínima e capabilities | Gate B / responsável de arquitetura |
| MP-ADR-021 | proposta | Persistir integração por `(company, provider, environment)` | Gate B / arquitetura e segurança |
| MP-ADR-022 | proposta | Usar envelope normalizado preservando status bruto | Gate B / arquitetura |
| MP-ADR-023 | proposta | Adotar cofre e ciclo OAuth server-side | Gate C / segurança |
| MP-ADR-024 | proposta | Executar POC sandbox 1:1 por feature flag interna | Gate D / produto, segurança e financeiro |
| MP-ADR-025 | proposta | Caminho de liquidação A/B/C: 1:N, D-only, ledger ou NO-GO | Fase 6 / responsáveis executivo, financeiro e jurídico |

## 5. Alternativas rejeitadas

| ADR | Classificação | Alternativa | Justificativa |
|---|---|---|---|
| MP-ADR-030 | rejeitada | Fallback automático MP → Asaas | pode gerar cobrança dupla e viola freeze |
| MP-ADR-031 | rejeitada | Cobranças separadas por beneficiário | viola regra de uma venda/pagamento |
| MP-ADR-032 | rejeitada | Copiar o motor financeiro em adapter MP | cria divergência financeira |

## 6. Modelo para nova decisão

```markdown
## MP-ADR-NNN — Título
- Classificação: normativa vigente | conclusão técnica | proposta | formalmente aprovada | rejeitada | substituída
- Gate, data e responsáveis:
- Contexto e evidências:
- Decisão:
- Alternativas consideradas/descartadas:
- Consequências positivas/negativas:
- Riscos e tarefas vinculados:
- Decisão substituída/substituta:
```

## 7. Decisões obrigatórias futuras

- estrutura de credenciais/cofre;
- modelo persistente de integração/tentativa/evento;
- contrato de provider e capabilities;
- algoritmo de status/reversão por provider;
- forma de liquidação A/B/C após Fase 6;
- critérios, SLOs e limites do piloto e expansão.
