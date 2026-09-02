---
name: pagbank-official-api
description: Planeja, implementa, audita e diagnostica a integração direta do SmartBus com as APIs oficiais atuais do PagBank. Use para Connect Authorization, Order, PIX, cartão, parcelamento, split, idempotência, webhooks, consulta, estorno, chargeback, sandbox, produção e homologação. Não use como manual da PB Integrações, Connect Key, Payment Link ou checkout hospedado.
---

# PagBank Official API

Use esta Skill somente para a arquitetura direta:

`SmartBus → APIs oficiais PagBank`

Ela complementa, mas não substitui, a Skill `smartbus-payment-gateway`. Quando ambas estiverem disponíveis, leia primeiro `smartbus-payment-gateway`: ela define o produto e as regras financeiras; esta Skill traduz essas decisões para capacidades oficiais do PagBank.

## Limites obrigatórios

- Não usar PB Integrações, `Connect Key`, `ws.pbintegracoes.com` ou conhecimento da Skill `pagbank-connect` como se fossem PagBank oficial.
- Não propor Payment Link, link de pagamento ou checkout hospedado. Essa decisão está encerrada.
- Não alterar taxa, mínimo, teto, elegibilidade, snapshot, ledger ou divisão SmartBus para contornar limitação do gateway.
- Não remover, substituir, migrar ou quebrar o Asaas. PagBank entra ao lado dele.
- Não misturar credenciais, tokens, IDs, webhooks, logs ou pagamentos entre empresas ou ambientes.
- Não colocar access token, refresh token, client secret, token de webhook ou dados brutos de cartão no frontend, logs ou respostas ao usuário.
- Não marcar venda como paga por retorno do frontend. Apenas confirmação externa válida e convergente pode finalizar a venda.
- Não automatizar estorno ou política de chargeback sem decisão explícita de produto e financeiro.

## Ordem de trabalho

1. Leia [regras do SmartBus](references/smartbus-guardrails.md) antes de decidir arquitetura, dados ou comportamento financeiro.
2. Leia somente as referências aplicáveis ao trabalho:
   - onboarding e credenciais: [Connect e multiempresa](references/connect-multiempresa.md);
   - PIX, cartão, parcelamento e status: [pagamentos Order](references/order-pagamentos.md);
   - divisão financeira: [split](references/split.md);
   - criação segura, retry e confirmação: [idempotência e webhooks](references/idempotencia-webhooks.md);
   - cancelamento, estorno e contestação: [reversões](references/reversoes.md);
   - liberação de ambiente: [homologação](references/homologacao.md).
3. Inspecione código, schema, RLS e documentação real do projeto antes de propor mudanças. Reutilize o fluxo comum de finalização, tickets, logs e reconciliação.
4. Consulte a documentação oficial atual antes de implementar qualquer comportamento financeiro crítico. Use [fontes oficiais](references/fontes-oficiais.md) como ponto de partida, não como cópia eterna da documentação.
5. Classifique cada conclusão crítica como `COMPROVADO`, `PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO`, `NÃO COMPROVADO` ou `NÃO SUPORTADO`.
6. Se a evidência oficial e o comportamento observado divergirem, pare a liberação do recurso afetado, registre a divergência e exija homologação com PagBank. Não invente fallback financeiro.

## Arquitetura aprovada

- Produto técnico candidato: API de Pedidos e Pagamentos (`Order`).
- Primeira fase: PIX e cartão de crédito; parcelamento quando aplicável.
- Fora da primeira fase: boleto e venda manual administrativa.
- Onboarding preferencial: Connect Authorization, com autorização do vendedor e vínculo do token à empresa e ao ambiente corretos.
- Confirmação: `webhook prioritário → consulta PagBank como fallback → finalização comum idempotente`.
- Split: usar valores monetários inteiros em centavos (`FIXED`) quando a regra SmartBus exige montantes exatos.

Essas escolhas não liberam produção por si só. Os gates de [homologação](references/homologacao.md) continuam obrigatórios.

## Invariantes de implementação

- Uma empresa possui somente um gateway ativo para novas vendas.
- Trocar o gateway da empresa não altera cobranças já existentes.
- Toda venda mantém `gateway`, `environment`, IDs externos e credencial de origem imutáveis.
- Não existe fallback automático entre PagBank e Asaas.
- Gere uma chave de idempotência estável por operação lógica; retry reutiliza a mesma chave e payload.
- Salve correlação local antes da chamada externa sempre que a arquitetura permitir.
- Trate valores monetários como inteiros em centavos e defina deterministicamente o destino de centavos residuais.
- Valide soma do split contra o total antes do envio e concilie o split retornado após a criação.
- Considere `PAID` como pago/capturado. `WAITING`, `AUTHORIZED` e `IN_ANALYSIS` não finalizam a venda.
- Valide assinatura do webhook sobre o corpo bruto, antes de confiar no evento.
- Webhook duplicado, atrasado ou fora de ordem não pode duplicar ticket, comissão, ledger ou finalização.
- Consulta externa é fallback de confirmação e reconciliação, nunca justificativa para ignorar autenticidade do webhook recebido.
- Logs devem permitir rastrear empresa, venda, gateway, ambiente, operação, chave de idempotência, IDs PagBank e resultado, sem expor segredos ou dados sensíveis.

## Gates que não podem ser suavizados

Antes de produção, comprove no produto, conta e contrato PagBank efetivamente habilitados:

- Connect Authorization e scopes necessários para criar, consultar, dividir e estornar;
- identificação e rotação segura do token correto por empresa e ambiente;
- split `FIXED` com os quatro cenários SmartBus, até quatro recebedores, PIX, cartão e parcelamento;
- definição do primário, impacto das tarifas e valor líquido da empresa;
- chave pública/criptografia do cartão por conta conectada e estratégia 3DS;
- assinatura de webhook em cenário Connect multiempresa, inclusive qual token assina cada conta;
- idempotência no endpoint exato usado, timeout após criação e recuperação posterior;
- consulta de Order, Charge e Split com o token da conta correta;
- comportamento de refund customizado e saldo insuficiente;
- política de chargeback, `charge_transfer` e eventual uso de `liable`;
- isolamento completo entre Sandbox e Produção;
- homologação comercial/técnica do PagBank para marketplace/split.

Se qualquer gate crítico falhar, preserve o Asaas e mantenha PagBank desabilitado para novas vendas no escopo afetado.

## Resultado esperado em tarefas

Ao planejar, revisar ou implementar, informe objetivamente:

- decisão ou mudança proposta;
- evidência oficial e data de verificação;
- impacto no fluxo SmartBus e no Asaas;
- riscos financeiros e de isolamento multiempresa;
- o que está comprovado em documentação;
- o que ainda exige teste de Sandbox, homologação ou confirmação comercial;
- rollback técnico possível e efeitos externos que não são revertidos pelo código.
