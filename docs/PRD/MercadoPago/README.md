# Mercado Pago — central de acompanhamento documental do SmartBus BR

**Início desta central:** 2026-10-19  
**Natureza:** índice e controle operacional; não é um novo PRD e não altera regras financeiras.  
**Situação:** preparação documental; nenhuma fase de desenvolvimento ou produção autorizada.

> **Comece sempre por aqui.** Este arquivo é a porta de entrada para retomar o trabalho sem repetir auditorias ou confundir documentação vigente com proposta.

## 1. Onde está cada informação

| Necessidade | Fonte única indicada |
|---|---|
| Saber exatamente onde paramos e o próximo passo | [01 — Checkpoint e avanços](./01-checkpoint-e-avancos.md) |
| Consultar o que já foi pesquisado, com origem e limite da evidência | [02 — Evidências e consultas](./02-evidencias-e-consultas.md) |
| Preparar contato comercial e determinar GO/NO-GO | [03 — Perguntas comerciais e critérios de decisão](./03-perguntas-comerciais-e-go-no-go.md) |
| Regras financeiras oficiais | [PRD 01 — Taxa e divisão](../PRD%2001%20%E2%80%94%20Regra%20Oficial%20de%20Divis%C3%A3o%20da%20Taxa%20entre%20Marketplace%2C%20S%C3%B3cio%20e%20Representante.txt) |
| Regras multi-gateway | [PRD 04 — Múltiplos gateways](../Financeiro/PRD%2004%20%E2%80%94%20M%C3%BAltiplos%20Gateways%20e%20Forma%20de%20Liquida%C3%A7%C3%A3o%20das%20Comiss%C3%B5es.txt) e [PRD 05 — Configuração por empresa](../Financeiro/PRD%2005%20%E2%80%94%20Configura%C3%A7%C3%A3o%20de%20Gateway%20por%20Empresa.txt) |
| Estudo técnico histórico | [Auditoria de viabilidade](../../Analises/analise-viabilidade-mercado-pago-marketplace.md) |
| Especificação das fases planejadas | [Índice legado dos 17 documentos](../../PRDs/MercadoPago/00-mercado-pago-indice-geral.md) |
| Decisões, riscos e dúvidas detalhados | [ADRs](../../PRDs/MercadoPago/22-mercado-pago-registro-decisoes.md), [riscos](../../PRDs/MercadoPago/23-mercado-pago-registro-riscos.md) e [perguntas abertas](../../PRDs/MercadoPago/24-mercado-pago-duvidas-abertas.md) |

## 2. Política de organização

- A pasta canônica de PRDs novos é `docs/PRD/`. Os **17 documentos históricos** do Mercado Pago seguem temporariamente em `docs/PRDs/MercadoPago/`, que é legada. Eles são **referenciados, não copiados**, para não criar versões conflitantes.
- A eventual migração física desses documentos exigirá revisão de links e uma tarefa própria; não faz parte desta etapa.
- Os documentos desta central são registros de acompanhamento, **não uma segunda fonte de regras**. Quando houver conflito, aplicam-se `docs/README.md`, as Diretrizes Oficiais e os PRDs financeiros vigentes.
- Auditorias e achados técnicos continuam em `docs/Analises/`; evidências comerciais e checkpoints ficam aqui, sem duplicar a auditoria.
- Não publicar credenciais, tokens, dados pessoais de compradores, wallets reais, payloads sensíveis ou divisão interna confidencial em evidências.

## 3. Estado resumido em 2026-10-19

- **Documentação e viabilidade:** revisão inicial concluída; não equivale a homologação.
- **Split 1:1:** documentado oficialmente para marketplace; capacidade não comprovada no SmartBus.
- **Split 1:N:** documentação oficial da Orders API existe; disponibilidade comercial **para SmartBus no Brasil ainda não comprovada**.
- **Escolha final do checkout:** **pendente**. Checkout Pro pode servir à prova 1:1, mas **não deve ser presumido compatível com o 1:N**; a página oficial do 1:N descreve Checkout Transparente via Orders API.
- **Código, dados, configuração de produção:** nenhuma mudança autorizada por esta central.
- **Próxima atividade prioritária:** obter respostas comerciais documentadas enquanto se prepara, separadamente, o gate documental da Fase 1.

## 4. Regra de retomada de qualquer sessão

1. Ler este índice e [o checkpoint](./01-checkpoint-e-avancos.md).
2. Verificar nos [registros de evidências](./02-evidencias-e-consultas.md) se a pergunta **já foi respondida**; reconsultar só por mudança de versão, contradição ou lacuna explícita.
3. Consultar dúvidas, riscos e ADRs **pelos seus IDs existentes**, sem criar numeração paralela.
4. Declarar qual fase e qual gate serão tratados. Não implementar fase não autorizada.
5. Ao encerrar, **atualizar primeiro o checkpoint**, depois evidências e, se necessário, os registros existentes de decisão/risco/dúvida/backlog.
6. Uma pesquisa, PRD, aprovação de documentação ou PR de documentação **não autoriza merge de código, migration, mudança financeira ou deploy**.

## 5. Sincronização

Este conjunto poderá ser espelhado no Google Drive **após** revisão e incorporação ao GitHub. Não fazer sincronização automática nesta atividade; comparar previamente versões dos dois locais e preservar documentos mais recentes do Drive, conforme `docs/README.md`.
