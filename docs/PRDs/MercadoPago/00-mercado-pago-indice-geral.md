# Mercado Pago no SmartBus BR — Índice oficial

**Última revisão:** 2026-08-04
**Situação:** planejamento documental; implementação não autorizada

Esta pasta centraliza o guia oficial de uma possível integração futura do Mercado Pago. O [Asaas permanece o provedor oficial](./01-mercado-pago-viabilidade-decisao-e-ledger-interno.md). Nenhum documento desta pasta, isoladamente, autoriza alteração em código, banco, RLS, APIs, Edge Functions, componentes, secrets ou fluxo financeiro.

## Comece aqui

1. Leia a [auditoria técnica oficial](../../Analises/analise-viabilidade-mercado-pago-marketplace.md).
2. Consulte o [PRD principal e índice de implementação](./02-mercado-pago-prd-principal-implementacao.md).
3. Valide os [pré-requisitos antes de implementar](./25-mercado-pago-validacoes-pre-implementacao.md).
4. Execute as fases somente na ordem e nos gates do [roadmap](./20-mercado-pago-roadmap.md).

Cada fase exige autorização expressa e um **prompt próprio para o Codex**, referenciando o PRD da fase e seus IDs no backlog. Nenhuma fase é executada automaticamente: o Codex deve parar no ponto de conclusão definido, e o aceite de uma fase não autoriza iniciar a seguinte. Não são criados prompts de implementação neste conjunto documental.

## Fundamentos

- [01 — Viabilidade, decisão e ledger interno](./01-mercado-pago-viabilidade-decisao-e-ledger-interno.md)
- [02 — PRD principal da implementação futura](./02-mercado-pago-prd-principal-implementacao.md)

## PRDs por fase

1. [Fase 1 — Preparação da arquitetura](./10-fase-1-preparacao-arquitetura.md)
2. [Fase 2 — Camada mínima de provedores](./11-fase-2-camada-provedores.md)
3. [Fase 3 — Configuração por empresa](./12-fase-3-configuracao-provedor-empresa.md)
4. [Fase 4 — OAuth Mercado Pago](./13-fase-4-oauth-mercado-pago.md)
5. [Fase 5 — Prova de conceito 1:1](./14-fase-5-prova-conceito-1-1.md)
6. [Fase 6 — Avaliação Marketplace 1:N](./15-fase-6-avaliacao-marketplace-1-n.md)
7. [Fase 7 — Piloto controlado](./16-fase-7-piloto-controlado.md)
8. [Fase 8 — Expansão gradual](./17-fase-8-expansao-gradual.md)

## Gestão e governança

- [Roadmap, gates e pontos de decisão](./20-mercado-pago-roadmap.md)
- [Backlog técnico rastreável](./21-mercado-pago-backlog-tecnico.md)
- [Registro de decisões arquiteturais](./22-mercado-pago-registro-decisoes.md)
- [Registro de riscos](./23-mercado-pago-registro-riscos.md)
- [Dúvidas abertas](./24-mercado-pago-duvidas-abertas.md)
- [Validações pré-implementação](./25-mercado-pago-validacoes-pre-implementacao.md)

## Regras de manutenção

- Evitar reproduzir a auditoria: referenciá-la.
- Atualizar decisão, risco, dúvida e tarefa nos registros próprios.
- Toda fase exige aceite explícito; conclusão técnica não implica autorização para a próxima.
- Itens dependentes do Mercado Pago devem permanecer `bloqueados` até evidência formal.
- Alterações de regra financeira exigem processo próprio e estão fora deste projeto.
- Qualquer atividade fora dos limites do PRD autorizado é proibida.
