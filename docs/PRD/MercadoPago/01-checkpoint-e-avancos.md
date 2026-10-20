# Mercado Pago — checkpoint único e histórico de avanços

**Atualizado em:** 2026-10-19  
**Objetivo:** permitir continuidade objetiva sem investigar repetidamente o que já foi analisado.  
**Fonte para autorização:** somente decisão expressa do responsável e os gates do [roadmap existente](../../PRDs/MercadoPago/20-mercado-pago-roadmap.md).

## 1. Posição atual

**Estado:** planejamento documental; implementação não iniciada por esta tarefa.  
**Gate de implementação:** A — pendente; sem autorização para a Fase 1.  
**Bloqueio comercial:** elegibilidade/habilitação do Split 1:N e compatibilidade integral com o modelo de liquidação e meios de pagamento do SmartBus.  
**Bloqueios adicionais:** onboarding dos recebedores e contas, tarifas e valores líquidos, refund/chargeback, conciliação, ambientes, segurança, aceite financeiro e operacional.  
**Próxima ação permitida:** contato comercial/documental; confirmar responsáveis, gates e critérios de decisão.  
**Não fazer:** iniciar código do Mercado Pago, alterar Asaas/PagBank, criar integração paralela, cadastrar credenciais reais em documento, ativar produção ou prometer split multipartes.

## 2. Linha de avanço por etapa

Convenção: `concluída com evidência` | `em análise` | `pendente` | `bloqueada` | `não aplicável`.

| Etapa | Estado em 2026-10-19 | Evidência necessária antes de marcar como concluída |
|---|---|---|
| D0 — Inventário documental GitHub | **concluída com evidência** | Inventário: 17 arquivos em `docs/PRDs/MercadoPago`; PRDs oficiais em `docs/PRD`; auditoria em `docs/Analises` |
| D1 — Organizar entrada e checkpoint | **em análise** | PR de documentação incorporado/revisado; links testados; arquivo de checkpoint efetivamente adotado |
| D2 — Analisar requisitos públicos de split | **concluída com evidência documental limitada** | Links oficiais no registro de evidências; não demonstra habilitação da conta |
| D3 — Obter resposta comercial 1:N | **pendente** | Resposta identificável do Mercado Pago sobre Brasil, conta SmartBus, produto e contrato |
| D4 — Escolher checkout para o produto-alvo | **bloqueada** | D3 e matriz de compatibilidade por meio; decisão formal e aprovação |
| F1 — Preparação de arquitetura | **não iniciada** | Gate A e autorização expressa |
| F2 — Camada de provedores | **não iniciada** | Aceite F1 e Gate B |
| F3 — Configuração por empresa | **não iniciada** | Aceite F2 e Gate B |
| F4 — OAuth Mercado Pago | **não iniciada** | Aceite F3 e Gate C |
| F5 — POC controlada 1:1 | **não iniciada** | Aceite F4 e Gate D; testes sandbox reais |
| F6 — Avaliação formal 1:N | **pesquisa documental inicial apenas** | Documentação comercial + testes/decisão; não marcar como fase concluída |
| F7 — Piloto controlado | **bloqueada** | Gates E e decisões financeiras |
| F8 — Expansão | **bloqueada** | Gate F após piloto |

**Atenção:** as oito fases F1–F8 já têm PRDs próprios no [índice legado](../../PRDs/MercadoPago/00-mercado-pago-indice-geral.md). Este quadro registra somente andamento, não substitui seus critérios de aceite.

## 3. Fatos estabelecidos versus hipóteses

| Informação | Categoria | Próxima verificação |
|---|---|---|
| Split 1:1 permite comissão entre vendedor e marketplace por integração autorizada | Documentado oficialmente; **não testado aqui** | POC futura |
| Split 1:N existe em documentação oficial da Orders API com recebedores secundários | Documentado oficialmente; **não habilitado aqui** | Solicitação comercial |
| Split 1:N é descrito para Checkout Transparente (Orders API) | Documentado oficialmente | Confirmar modalidades e contrato disponíveis ao SmartBus |
| Checkout Pro serve ao fluxo 1:1 | Documentado oficialmente | Não assumir suporte a 1:N |
| Split 1:1 resolveria sócio e representante por transferência automática | **Não demonstrado; tratar como falso para planejamento** | Não repetir essa premissa |
| Repasse interno posterior seria equivalente ao split contratual | **Não autorizado** | Só analisar mediante projeto e pareceres separados |
| Integrações Asaas/PagBank podem ser alteradas para facilitar o MP | **Não autorizado** | Preservar operação existente |

## 4. Histórico imutável de sessões

Adicionar uma entrada por sessão que tenha avanço **real**, do mais recente para o mais antigo. Nunca apagar linhas históricas; correção cita a entrada anterior.

### S-001 — 2026-10-19 — Revisão documental preliminar

- **Escopo:** inventário GitHub e fontes oficiais públicas; início do controle documental.
- **O que foi constatado:** há documentação extensa já existente; diretório `docs/PRDs/MercadoPago` é legado; 1:1 e 1:N são ofertas diferentes; 1:N está documentado no contexto de Checkout Transparente/Orders API e depende de contato comercial.
- **O que não foi feito:** implementação, homologação, OAuth, criação de aplicação, contato efetivo com Mercado Pago, teste de valores recebidos, alteração de PRDs normativos ou configuração.
- **Evidências:** E-001 a E-006 em [registro de evidências](./02-evidencias-e-consultas.md); auditoria histórica já existente.
- **Pendência:** resposta comercial e decisão de checkout; ajuste da posição histórica que assume Asaas como único gateway estrutural, sem alterar normas.
- **Retomar por:** D1 (validar a organização), depois D3 (comercial) e Gate A (se o responsável autorizar).
- **Entrega de documentação:** [Draft PR #794](https://github.com/Reginatto-SI/bus-o-off-off/pull/794), branch `docs/mercadopago-governanca-20261019`; **aguardando revisão e merge**, sem autorização de código ou deploy.

## 5. Modelo obrigatório de atualização

### S-NNN — AAAA-MM-DD — Assunto

- **Fase, gate e responsável:**
- **Pedido e escopo expressamente autorizados:**
- **Estado anterior → estado novo:**
- **O que foi feito, com PR/commit ou protocolo:**
- **Evidências verificáveis (IDs E-xxx):**
- **Teste/aceite e quem aprovou:**
- **O que não foi feito:**
- **Riscos/ADRs/dúvidas/backlog alterados (IDs existentes):**
- **Próximo passo exato, pré-requisitos e ponto de parada:**
- **Decisão:** GO / GO condicionado / NO-GO / pendente, com link.

## 6. Regra anti-loop

- Não abrir novas auditorias de viabilidade geral enquanto [a auditoria histórica](../../Analises/analise-viabilidade-mercado-pago-marketplace.md) e o [registro de evidências](./02-evidencias-e-consultas.md) responderem a pergunta.
- Toda nova consulta deve identificar **qual pergunta aberta**, qual informação mudou e qual decisão ela desbloqueia.
- Não chamar `pesquisado` de `testado`; `testado` não é `homologado`; `homologado` não é `autorizado para produção`.
- Não recriar outro roadmap, registro de riscos ou registro de decisões: atualizar os que já existem.
- Se uma sessão terminar sem avanço, registrar só o motivo do bloqueio quando necessário, sem criar novo PRD ou análise extensa.
