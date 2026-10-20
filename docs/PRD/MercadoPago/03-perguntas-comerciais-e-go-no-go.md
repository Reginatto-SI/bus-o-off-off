# Mercado Pago — roteiro comercial e critérios de GO/NO-GO

**Situação:** questionário preparado; **ainda não enviado** nesta atividade.  
**Escopo:** viabilidade do Split 1:N para o SmartBus BR. Este roteiro não constitui aprovação comercial nem autorização de desenvolvimento.

## 1. Contexto mínimo a informar

O SmartBus BR é uma plataforma brasileira, multiempresa, de venda de passagens de ônibus em site/aplicativo próprio. Cada empresa tem a sua configuração de gateway; a plataforma calcula sua taxa por passagem e pode ter divisão interna entre marketplace, sócio global e representante vinculado à empresa.

**Necessidade central:** uma única cobrança deve contemplar a empresa vendedora e, quando aplicável, as parcelas dos três demais participantes, sem gerar cobranças paralelas e sem modificar a regra financeira oficial. Emissões de passagem dependem da confirmação do pagamento.

Não enviar percentuais comerciais internos, dados de compradores, credenciais ou identificadores reais de contas em contato inicial.

## 2. Perguntas ao time comercial/técnico — priorizadas

| Prioridade | Pergunta | Ligação às dúvidas existentes |
|---|---|---|
| P0 | A conta/plataforma SmartBus é elegível ao **Split 1:N no Brasil**, via **Checkout Transparente/Orders API**? Quem habilita, quais documentos, contrato, volume e prazo? | Q-1N-01, Q-COM-01 |
| P0 | Uma única transação pode ter empresa de transporte como recebedora principal e SmartBus, sócio global e representante como secundários, inclusive o mesmo sócio em vendas de diferentes empresas? | Q-1N-02, Q-1N-05 |
| P0 | O acesso a 1:N funciona em quais checkouts, operações de Pix/cartão, parcelamentos e ambientes? **Checkout Pro é ou não suportado para este 1:N específico?** | Q-1N-01, Q-1N-07 |
| P0 | São aceitos valores absolutos por participante, divisão precisa em centavos, resíduo e alteração/omissão segura de recebedor opcional? | Q-1N-03, Q-1N-04 |
| P0 | Como funcionam tarifas, saldo líquido, reserva, refund total/parcial, chargeback e falta de saldo em um participante? | Q-REV-01 a Q-REV-05 |
| P0 | Quais contas exigem KYC, autorização/consentimento e relacionamento com o titular primário? Como obter e gerenciar `receiver_id`? | Q-1N-06, Q-OA |
| P0 | Como verificar por API e relatório o valor efetivamente liquidado para **cada recebedor** e comprovar a conciliação? | Q-COM-04 |
| P1 | O sandbox cobre cenários multipartes, Pix, cartão, reversão e consentimento? Qual é o procedimento de habilitação e homologação antes de produção? | Q-COM-05 |
| P1 | Quais tarifas adicionais, SLA, limites operacionais, rate limits, atendimento de incidentes e responsabilidades contratuais/regulatórias? | Q-COM-02, Q-COM-03, Q-COM-06 |

Solicitar **resposta escrita**, com identificação de país, produto, versão, responsável, data e, quando houver, proposta comercial/documentação. Conversa com bot que descreva genericamente marketplace 1:1 **não encerra** nenhuma questão 1:N.

## 3. Mensagem inicial reutilizável

**Assunto:** SmartBus BR — Avaliação comercial para Split 1:N (Orders API) no Brasil

Prezados, a SmartBus BR opera uma plataforma própria de vendas de passagens para diversas empresas de transporte e está avaliando o Mercado Pago como gateway adicional.

Precisamos validar o uso de Split 1:N em uma cobrança única, com empresa vendedora como recebedora principal e até três beneficiários secundários ligados à plataforma, conforme a elegibilidade da venda.

A documentação indica que o 1:N via Checkout Transparente/Orders API exige contato comercial. Poderiam informar o procedimento para avaliação/habilitação da nossa conta no Brasil e confirmar os meios de pagamento, regras de consentimento dos recebedores, tarifas, estornos/chargeback, relatórios e ambiente de homologação?

Pedimos encaminhamento ao responsável comercial/técnico por esse produto e, se possível, resposta por escrito para seguirmos com a análise de viabilidade.

Atenciosamente,  
Equipe SmartBus BR

## 4. Quadro de decisão

| Cenário | Situação necessária para GO | Caso contrário |
|---|---|---|
| Pesquisa/documentação | Fontes registradas e lacunas identificadas | Continuar estudo direcionado |
| Arquitetura F1 | Gate A e autorização expressa, sem afetar gateways atuais | **Não iniciar F1** |
| POC 1:1 | Fases anteriores e Gate D aprovados; sandbox isolado; sem promessa multipartes | **Não ativar POC** |
| 1:N aderente à regra oficial | Habilitação escrita, requisitos de contas/checkout/meios/tarifas/reversões demonstrados e aceite técnico-financeiro | **NO-GO para equivalência 1:N em produção** |
| Piloto | Gate E completo, critérios financeiros e operacionais atendidos e autorização expressa | **Não vender em produção via MP** |

Uma alternativa de ledger/repasse posterior **não será assumida** como fallback. Exigiria projeto separado, critérios de liquidação/estorno e aprovações jurídica, contábil, financeira e executiva; a decisão permanece nos ADRs existentes.

## 5. Como encerrar esta pendência

- [ ] Contato encaminhado ao canal verificado do Mercado Pago.
- [ ] Protocolo, data, responsável e comprovante armazenados em local autorizado, sem segredos.
- [ ] Resposta formal recebida ou recusa documentada.
- [ ] Evidências E-P01 a E-P05 atualizadas com links seguros.
- [ ] Dúvidas Q-1N/Q-REV/Q-COM atualizadas, sem marcar abertas como resolvidas por suposição.
- [ ] Registro de decisão MP-ADR-025 atualizado com GO / GO condicionado / NO-GO, **apenas quando autorizado**.
- [ ] [Checkpoint](./01-checkpoint-e-avancos.md) atualizado com o próximo passo e data real.

**Ponto de parada:** avaliação comercial documentada. Não iniciar OAuth, checkout, split, código, produção ou repasses por conta deste roteiro.
