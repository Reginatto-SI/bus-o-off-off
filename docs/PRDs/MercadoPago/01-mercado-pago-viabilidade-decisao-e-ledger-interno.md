# 01 — PRD Mercado Pago: Viabilidade, Decisão Arquitetural e Ledger Interno

Data da revisão: 2026-06-13

Tipo de documento: **PRD de viabilidade, decisão arquitetural e restrições operacionais**.

> Este documento **não é um PRD de implementação**. Ele não autoriza criação de migrations, edge functions, checkout Mercado Pago, webhook Mercado Pago ou alteração do fluxo Asaas. O objetivo é registrar a decisão oficial do projeto antes de qualquer implementação futura.

## 1. Objetivo

Estabelecer a posição oficial do SmartBus BR sobre Mercado Pago como possível gateway alternativo, com foco em:

- viabilidade técnica;
- restrições comerciais do Split Payments;
- impacto no modelo financeiro atual;
- necessidade de ledger interno para sócio e representante no modelo 1:1;
- bloqueadores antes de implementação;
- critérios mínimos para um piloto futuro.

## 2. Contexto

O SmartBus BR é uma plataforma multiempresa de venda de passagens de ônibus. Cada empresa possui suas próprias vendas, eventos, integrações, ambiente de pagamento e diagnóstico operacional.

Hoje, o gateway oficial é o **Asaas**. O fluxo atual possui:

- venda com status inicial `reservado` ou `pendente_pagamento`;
- `company_id` como base de isolamento multiempresa;
- `payment_environment` persistido na venda;
- criação de cobrança no gateway;
- split financeiro;
- webhook como fonte prioritária de confirmação;
- `verify-payment-status` como fallback de convergência;
- finalização idempotente;
- tickets gerados somente após confirmação válida;
- logs de integração;
- diagnóstico administrativo.

A tela administrativa envolvida é:

```txt
/admin/empresa → guia Pagamentos
```

## 3. Status da decisão

| Tema | Status oficial |
|---|---|
| Mercado Pago aprovado para implementação | **Não aprovado** |
| Mercado Pago substitui Asaas | **Não** |
| Asaas continua gateway oficial e padrão | **Sim** |
| Mercado Pago pode ser avaliado futuramente | **Sim, com restrições** |
| Split 1:N Mercado Pago | **Depende de validação comercial no Brasil** |
| Mercado Pago 1:1 com sócio/representante | **Depende de decisão formal sobre ledger interno** |
| Piloto futuro | **Somente com critérios mínimos atendidos** |

## 4. Relação com o Asaas

O Mercado Pago **não substitui o Asaas neste momento**.

O Asaas continua sendo o gateway oficial porque o fluxo atual já está integrado a:

- configuração por empresa;
- sandbox/produção;
- criação de cobrança;
- split financeiro;
- webhook;
- fallback por verify;
- finalização idempotente;
- geração de tickets;
- logs;
- diagnóstico administrativo.

Qualquer integração futura com Mercado Pago deve:

- manter Asaas intacto;
- não alterar `create-asaas-payment` sem justificativa específica;
- não alterar `asaas-webhook` sem justificativa específica;
- não quebrar empresas que já usam Asaas;
- preservar vendas antigas vinculadas ao gateway original usado no momento da criação da cobrança.

## 5. Decisão recomendada

A decisão recomendada é:

> **Pausar implementação e validar comercialmente Split 1:N com Mercado Pago antes de desenvolver qualquer integração completa.**

Mercado Pago pode ser considerado futuramente em dois caminhos:

1. **Piloto restrito 1:1**, somente para empresas cuja operação aceite split 1:1 ou que tenham aceite formal de ledger interno para sócio/representante.
2. **Integração mais aderente ao modelo atual**, apenas se o Mercado Pago Brasil confirmar comercialmente e contratualmente Split 1:N adequado ao SmartBus BR.

## 6. Modelo Mercado Pago 1:1

No modelo Mercado Pago 1:1, o gateway dividiria o pagamento apenas entre:

- empresa vendedora;
- marketplace SmartBus BR.

A documentação oficial do Mercado Pago Brasil informa que, em Split Payments 1:1, Checkout Pro e Checkout Transparente realizam a divisão entre vendedor e marketplace. No Checkout Pro, a comissão do marketplace é informada como `marketplace_fee`; no Checkout Transparente, como `application_fee`.

Fontes oficiais Brasil:

- [Mercado Pago Brasil — Split Payments 1:1: pré-requisitos](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/prerequisites)
- [Mercado Pago Brasil — Integrar checkout em Split Payments 1:1](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace)
- [Mercado Pago Brasil — Como integrar checkout em marketplace](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/how-tos/integrate-marketplace)

## 7. Limitação do Mercado Pago 1:1

O modelo 1:1 **não atende diretamente** a composição financeira completa que pode existir no SmartBus BR:

- empresa de ônibus;
- Marketplace SmartBus BR;
- sócio;
- representante.

No modelo 1:1:

- a comissão total da plataforma seria recebida pela conta do SmartBus BR;
- a divisão entre Marketplace, Sócio e Representante **não ocorreria diretamente no Mercado Pago**;
- sócio e representante precisariam ser tratados por ledger interno e repasse posterior.

Portanto, Mercado Pago 1:1 não deve ser tratado como equivalente funcional completo ao Asaas para empresas que dependem de split direto multi-partes.

## 8. Dependência do Split 1:N

A documentação oficial do Mercado Pago Brasil sobre Split Payments 1:1 informa que o modelo 1:N está disponível apenas para vendedores de carteira assessorada em contato com a equipe comercial do Mercado Pago.

Decisão do projeto:

- Split 1:N é **dependência comercial** para equivalência mais próxima ao modelo financeiro completo do SmartBus BR;
- a disponibilidade de Split 1:N precisa ser validada no Brasil, com contrato e condições comerciais específicas;
- enquanto essa validação não existir, Mercado Pago não deve ser implementado como substituto do Asaas.

Mesmo com Split 1:N aprovado, ainda seria necessário validar:

- quantidade máxima de recebedores;
- exigência de conta Mercado Pago para sócio/representante;
- funcionamento com Pix e cartão;
- suporte em Checkout Pro ou necessidade de Checkout Transparente/API;
- regras de reembolso, chargeback e disputa;
- relatórios de conciliação por recebedor;
- sandbox habilitado para 1:N;
- prazos de liquidação e liberação.

## 9. Ledger interno para sócio e representante

### 9.1 Regra para Mercado Pago 1:1

Caso Mercado Pago avance no modelo 1:1 e exista sócio ou representante, a divisão entre Marketplace, Sócio e Representante precisará ser registrada em ledger interno do SmartBus BR.

Esse ledger deverá controlar, no mínimo:

- venda;
- evento;
- empresa;
- gateway;
- ambiente;
- valor bruto pago;
- taxa do Mercado Pago;
- comissão total recebida pela Marketplace;
- parcela da Marketplace;
- parcela do sócio;
- parcela do representante;
- status do repasse;
- competência ou período de fechamento;
- data prevista de repasse;
- data efetiva de repasse;
- tratamento em caso de estorno ou chargeback.

### 9.2 O que o código atual já ajuda a sustentar

O código atual já possui elementos que ajudam a futura modelagem, mas não fecham a solução:

- `company_id` para isolamento multiempresa;
- `payment_environment` na venda;
- `payment_method` na venda;
- `sale_integration_logs` com `provider`, IDs externos, payload e resposta;
- `split_snapshot_*` em `sales` para congelamento financeiro;
- `representative_commissions` como base de comissão de representante;
- finalização idempotente centralizada em `payment-finalization`.

### 9.3 Lacunas atuais

Ainda faltam definições e modelagem para:

- `payment_gateway` persistido na venda;
- campos externos genéricos por gateway;
- ledger financeiro genérico para sócio/representante no contexto Mercado Pago;
- política de fechamento;
- política de repasse;
- reversão de ledger em chargeback/estorno;
- diagnóstico de split externo versus ledger interno.

## 10. Política de fechamento ainda pendente

A política de fechamento de comissões e repasses **ainda precisa ser definida por financeiro/produto**.

Opções possíveis:

1. fechamento por venda;
2. fechamento por evento;
3. fechamento mensal por empresa;
4. fechamento mensal por representante;
5. combinação de empresa + evento + competência.

Enquanto essa política não for definida, Mercado Pago 1:1 **não deve ser implementado em produção** para empresas que dependam de divisão com sócio ou representante, exceto se houver aceite formal de ledger interno e repasse posterior.

## 11. Impacto em checkout

Se Mercado Pago avançar futuramente:

- o comprador **não deve escolher o gateway** no checkout público;
- Mercado Pago não deve aparecer como opção pública ao lado de Asaas;
- a escolha do gateway deve ser configuração administrativa da empresa;
- a venda deve nascer com `payment_gateway`, `company_id`, `payment_environment` e `payment_method`;
- o checkout deve continuar simples para o comprador;
- redirect de sucesso do Mercado Pago não pode confirmar pagamento;
- venda online só pode virar paga após webhook ou verify válido;
- vendas antigas devem continuar vinculadas ao gateway original da cobrança.

Para menor risco, se houver piloto futuro, a opção preferida é **Checkout Pro**, porque se aproxima do padrão atual de abertura de cobrança externa e reduz mudanças no frontend público.

## 12. Impacto em webhook

Se Mercado Pago avançar, deve existir webhook separado:

```txt
mercado-pago-webhook
```

Esse webhook deve:

- validar assinatura/origem conforme documentação oficial;
- deduplicar eventos;
- buscar detalhes do pagamento quando necessário;
- validar `external_reference` contra `sale.id`;
- validar `company_id`;
- validar `payment_gateway='mercado_pago'`;
- validar ambiente/sandbox/produção;
- normalizar status externo;
- chamar a finalização idempotente comum apenas quando o pagamento estiver confirmado;
- registrar logs com gateway, ambiente, empresa, venda e ID externo.

Fonte oficial Brasil sobre Webhooks e assinatura:

- [Mercado Pago Brasil — Webhooks / validação de origem](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/notifications/webhooks)
- [Mercado Pago Brasil — Configurar notificações de pagamento](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/payment-notifications)

## 13. Impacto em diagnóstico

O diagnóstico administrativo precisaria mostrar:

- gateway usado;
- ambiente;
- empresa;
- venda;
- ID externo do pagamento;
- ID de preferência, se Checkout Pro;
- status externo cru;
- status interno normalizado;
- eventos recebidos;
- eventos duplicados;
- falhas OAuth/token;
- falhas webhook;
- divergência entre gateway e venda;
- split externo 1:1;
- ledger interno de sócio/representante;
- estorno/chargeback;
- venda paga sem ticket;
- cobrança criada sem venda vinculada.

Diagnóstico Mercado Pago 1:1 deve deixar claro quando sócio/representante não aparecem no gateway porque serão tratados internamente.

## 14. Impacto em `/admin/empresa`

A guia Pagamentos teria que diferenciar claramente:

- Asaas: gateway oficial e padrão;
- Mercado Pago: possibilidade futura/piloto restrito.

Se Mercado Pago avançar, a conexão da empresa exigirá OAuth:

1. admin da empresa clica em conectar Mercado Pago;
2. usuário autoriza no Mercado Pago;
3. backend troca autorização por tokens;
4. tokens são armazenados com segurança por empresa e ambiente;
5. tela mostra status da integração.

A documentação oficial do Mercado Pago Brasil informa que o marketplace deve usar OAuth para obter `access_token` do vendedor.

Fontes oficiais Brasil:

- [Mercado Pago Brasil — OAuth](https://www.mercadopago.com.br/developers/pt/docs/security/oauth)
- [Mercado Pago Brasil — Obter Access Token](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation)
- [Mercado Pago Brasil — Criar configuração / Redirect URL](https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/integration-configuration/create-configuration)

Status mínimos na tela:

- não configurado;
- conectado em sandbox;
- conectado em produção;
- token expirado;
- permissão revogada;
- webhook não configurado;
- pronto para piloto 1:1;
- bloqueado por Split 1:N não validado;
- bloqueado por política de ledger/fechamento pendente.

## 15. Riscos financeiros

- Comissão do Mercado Pago e comissão do marketplace podem exigir conciliação diferente do Asaas.
- A documentação do Mercado Pago Brasil informa que a comissão Mercado Pago é descontada antes da comissão marketplace no fluxo 1:1, mas o SmartBus deve tratar isso como **ponto a confirmar em conciliação real e contrato comercial**, pois pode variar por produto, meio de pagamento, país ou condição contratual.
- Sócio/representante podem depender de repasse interno posterior.
- Repasse manual pode atrasar ou falhar.
- Chargeback pode ocorrer após repasse interno já realizado.
- Empresa pode questionar valor líquido recebido.
- Marketplace pode assumir obrigação financeira adicional ao reter e redistribuir comissão.

## 16. Riscos operacionais

- Mistura de ambiente sandbox/produção se tokens forem configurados incorretamente.
- Token OAuth expirado ou revogado impedir novas cobranças.
- Falha de webhook pode atrasar emissão de tickets.
- Verify pode confirmar sem webhook observado, exigindo logs claros.
- Gateway da venda não pode mudar depois da cobrança criada.
- Vendas antigas precisam continuar no gateway original.
- Diagnóstico precisa evitar confusão entre split externo e ledger interno.

## 17. Riscos de suporte

- Suporte precisará explicar por que Mercado Pago mostra apenas empresa + marketplace no modelo 1:1.
- Sócio/representante podem questionar ausência no extrato do gateway.
- Empresa pode questionar taxa Mercado Pago, comissão marketplace e líquido final.
- Logs sem gateway/ambiente/ID externo dificultam atendimento.
- Se Asaas e Mercado Pago coexistirem, diagnóstico precisa ser explícito por provider.

## 18. Riscos de chargeback/estorno

Antes de implementar Mercado Pago, é obrigatório definir:

- como estorno total afeta ledger interno;
- como estorno parcial afeta sócio/representante;
- como chargeback afeta repasses já feitos;
- se tickets emitidos serão cancelados, marcados ou apenas diagnosticados;
- como suporte identifica venda paga, estornada, contestada ou divergente;
- como recompor saldo se repasse interno já ocorreu.

Sem essa política, Mercado Pago 1:1 não deve ir para produção em empresas com sócio/representante.

## 19. Bloqueadores antes de implementar

São bloqueadores:

1. Falta de confirmação comercial do Split 1:N, se multi-recebedor direto for requisito.
2. Ausência de decisão formal sobre ledger interno para Mercado Pago 1:1.
3. Ausência de política de fechamento de comissões.
4. Ausência de política de repasse para sócio/representante.
5. Ausência de regra de chargeback/estorno no ledger.
6. Ausência de UX clara para OAuth em `/admin/empresa`.
7. Ausência de estratégia de renovação/revogação de token.
8. Ausência de modelagem segura de credenciais por empresa/ambiente.
9. Ausência de testes sandbox por empresa/seller.
10. Ausência de diagnóstico multi-gateway.
11. Ausência de regra de elegibilidade para piloto.
12. Ausência de validação jurídica/financeira sobre retenção e repasse interno.
13. Ausência de decisão formal sobre Checkout Pro versus Checkout Transparente.

## 20. Perguntas para o comercial do Mercado Pago

1. Split 1:N está disponível para o modelo SmartBus BR no Brasil?
2. Quais critérios para carteira assessorada?
3. Há contrato específico para marketplace de passagens/serviços de transporte?
4. Quantos recebedores podem participar de uma cobrança?
5. Sócio e representante podem ser recebedores diretos?
6. Todos os recebedores precisam ter conta Mercado Pago?
7. Split 1:N funciona para Pix e cartão?
8. Split 1:N funciona com Checkout Pro ou exige Checkout Transparente/API?
9. Como são tratados reembolso parcial, total e chargeback em 1:N?
10. Como a taxa Mercado Pago é aplicada em relação à comissão marketplace?
11. A ordem de desconto documentada no 1:1 se mantém no contrato proposto para o Brasil?
12. É possível configurar data de liberação da comissão marketplace?
13. É possível configurar data de liberação por recebedor?
14. Há relatório/API para conciliar recebedores por pagamento?
15. Há sandbox com 1:N habilitado?
16. Existem limites mínimos/máximos para comissão ou recebedores?
17. Existem restrições regulatórias para transporte/passagens?
18. Há webhook específico para split/repasses?
19. Qual SLA de suporte em incidentes financeiros?
20. Quais condições comerciais mudam entre Checkout Pro e Checkout Transparente?

## 21. Critérios mínimos para permitir piloto

Mercado Pago só deve ser permitido em piloto se todos os critérios abaixo forem atendidos:

1. Asaas permanece oficial e intacto.
2. Empresa piloto aceita operação com split 1:1, ou possui aceite formal de ledger interno para sócio/representante.
3. Política mínima de ledger, fechamento, repasse e chargeback está aprovada.
4. OAuth por empresa/ambiente está definido.
5. Tokens serão armazenados e renovados com segurança.
6. Checkout público não exibirá escolha de gateway ao comprador.
7. Venda registrará gateway original usado na criação da cobrança.
8. Webhook Mercado Pago terá validação de origem e deduplicação.
9. Finalização de pagamento reutilizará rotina idempotente comum.
10. Diagnóstico mostrará gateway, ambiente, ID externo, logs e ledger.
11. Testes sandbox cobrem Pix, cartão, pagamento pendente, rejeição, estorno e webhook duplicado.
12. Há plano de rollback para novas vendas.

## 22. Conclusão final

A conclusão oficial do projeto é:

- **Mercado Pago é apenas possibilidade futura.**
- **Mercado Pago não está aprovado para implementação.**
- **Mercado Pago não substitui o Asaas neste momento.**
- **Asaas continua sendo o gateway oficial e padrão do SmartBus BR.**
- **Split 1:N precisa de validação comercial no Brasil antes de qualquer equivalência com o modelo financeiro atual.**
- **Mercado Pago 1:1 exige decisão formal sobre ledger interno para sócio e representante.**
- **A política de fechamento de comissões ainda precisa ser definida.**
- **Qualquer implementação futura depende de nova decisão técnica, financeira, jurídica e comercial.**
