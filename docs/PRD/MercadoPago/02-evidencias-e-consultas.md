# Mercado Pago — registro central de evidências e consultas

**Primeiro inventário:** 2026-10-19.  
**Finalidade:** guardar evidências reutilizáveis, seus limites e as condições para nova pesquisa. **Não substitui** PRDs normativos, relatórios de testes futuros nem decisão comercial assinada.

## Regras

1. Uma fonte pública prova o que **a documentação afirma**, não a habilitação efetiva da conta SmartBus.
2. Registrar para cada achado: ID, data de consulta, origem, versão/país/produto quando identificáveis, pergunta respondida, limite, decisão afetada e data de revisão futura **apenas se houver mudança**.
3. A resposta da IA de suporte, conversa verbal, publicação de terceiros ou código GitHub não comprova contrato, elegibilidade, liquidação nem homologação.
4. Evidência financeira ou comercial deve ter referência identificável, sem reproduzir tokens, dados bancários, números de documento ou contas.
5. Fontes aparentemente contraditórias entre APIs diferentes são **hipóteses de incompatibilidade**, não licença para escolher arbitrariamente uma API.

## Registro inicial

| ID | Consulta / fonte | Afirmação suportada | Limite / decisão que NÃO sustenta |
|---|---|---|---|
| E-001 | [Mercado Pago — pré-requisitos do split 1:1](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites) — consulta 2026-10-19 | A documentação distingue o 1:1 e declara o 1:N restrito a vendedores com carteira assessorada e contato comercial; lista requisitos cadastrais | Não prova que o SmartBus foi aceito nem tem acesso contratado |
| E-002 | [Mercado Pago — integração do checkout no split 1:1](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace) — consulta 2026-10-19 | Checkout Pro redireciona para o MP e usa `marketplace_fee` no fluxo de preferências; Transparente usa `application_fee` na Payments API; OAuth do vendedor é requisito da integração documentada | Não comprova split 1:N no Checkout Pro; cuidado com diferenças entre Payments API e Orders API |
| E-003 | [Mercado Pago — Split Payments 1:N (Orders API)](https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/resources/split-payments-1-n) — consulta 2026-10-19 | Recurso documentado para **Checkout Transparente via Orders API**; divisão em valores fixos ou percentuais, um principal e até 10 secundários; consentimento formal e `receiver_id`; orientação para obter informações do contato comercial | Não comprova acesso 1:N para SmartBus, contratação brasileira, composição exata de tarifas/estornos, ou compatibilidade com Checkout Pro |
| E-004 | [Mercado Pago — configuração 1:1](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/create-configuration) — consulta 2026-10-19 | Fluxo de criar aplicação Marketplace e integrar recursos suportados de split 1:1, inclusive Bricks nos contextos documentados | Não autoriza extrapolar Bricks para o 1:N |
| E-005 | [Mercado Pago — Checkout Pro Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/create-order) — consulta 2026-10-19 | Orders do Checkout Pro documenta `marketplace_fee` | **Ter Orders API em dois produtos não prova que o array `splits` de 1:N está disponível no Checkout Pro** |
| E-006 | [Auditoria interna histórica do SmartBus](../../Analises/analise-viabilidade-mercado-pago-marketplace.md), 2026-08-04, revisitada em 2026-10-19 | Mapeia acoplamentos Asaas, venda, webhook, snapshot, riscos e condicionantes; base histórica para F1 | É análise estática da época, não comprova estado de código em 2026-10-19, nem substitui revisão direcionada quando F1 for autorizada |

## Pendências de evidência — não repetir busca pública como substituto

| ID | Pergunta de negócio | Evidência que realmente encerra |
|---|---|---|
| E-P01 | O SmartBus terá habilitação brasileira 1:N? | Resposta formal com produto, elegibilidade, conta, país, condições comerciais e responsável |
| E-P02 | O modelo com empresa, marketplace, sócio global e representante por empresa é permitido? | Contrato + testes com recebedores correspondentes e regras de contas/consentimento |
| E-P03 | Checkout Transparente via Orders 1:N aceita Pix, cartão e as modalidades exigidas? | Matriz oficial do contrato + sandbox representativo |
| E-P04 | Valores líquidos, tarifas, arredondamento, estorno parcial e chargeback preservam as regras do produto? | Relatórios por recebedor, documentação contratual e cenários de teste |
| E-P05 | Como operar sandbox/produção, KYC/OAuth de todos os envolvidos, relatórios e SLA? | Onboarding e regras oficiais específicos da conta |

Vincular respostas a [Q-1N, Q-REV, Q-OA, Q-COM](../../PRDs/MercadoPago/24-mercado-pago-duvidas-abertas.md) e aos riscos/ADRs existentes. Se uma evidência substituir outra, **registrar o novo ID e a razão**; não remover a fonte histórica.

## Modelo para adicionar fonte

- **ID / data de consulta:**
- **Pergunta do backlog/dúvida:**
- **Fonte e link permanente / documento / protocolo:**
- **Autoridade:** oficial pública | resposta comercial formal | homologação sandbox | parecer interno | relato não vinculante
- **País, produto, versão e ambiente:**
- **Trecho/conclusão verificável em palavras próprias:**
- **Limitações e pontos contraditórios:**
- **Decisão, risco e tarefa impactados:**
- **Nova consulta necessária?** Apenas se documento atualizado, evidência insuficiente ou contradição apontada.
