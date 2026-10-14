# 00 — LEIA PRIMEIRO — PagBank Sandbox: estado real, o que já foi testado e o que NÃO repetir

> **Documento operacional prioritário do PagBank enquanto o fluxo básico Sandbox não estiver fechado.**
>
> Antes de criar novos diagnósticos, trocar credenciais, mexer em webhook, refatorar integração ou investigar endpoints adicionais, leia este arquivo.
>
> **Objetivo atual é simples:** fazer **PIX e cartão de crédito funcionarem em Sandbox com Split**, ponta a ponta, antes de buscar uma integração "perfeita".

Atualizado em: **2026-10-13**

---

## 1. Meta atual — não ampliar escopo

Até esta meta funcionar, NÃO abrir novas frentes.

### PIX Sandbox
Fluxo mínimo esperado:

1. SmartBus cria a venda.
2. SmartBus cria uma Order PIX no PagBank pela conexão `connect_sms`.
3. O payload inclui o Split esperado.
4. O PagBank cria a Order e devolve um único recurso `SPLI_...`.
5. O QR Code PIX é exibido ao comprador.
6. Após pagamento, o SmartBus consulta a Order no PagBank.
7. Se o PagBank retornar `PAID`, a venda é finalizada uma única vez.
8. A passagem é emitida uma única vez.

### Cartão Sandbox
Fluxo mínimo esperado:

1. SmartBus cria a venda.
2. SmartBus cria a Order/cartão pela conexão `connect_sms`.
3. O payload inclui o Split esperado.
4. O PagBank cria a Order e devolve um único recurso `SPLI_...`.
5. Se a cobrança retornar paga, a venda é finalizada uma única vez.
6. A passagem é emitida uma única vez.
7. Cartão recusado deve permanecer não pago.

### Regra temporária para o básico
Enquanto `GET /splits/{id}` continuar retornando 403 no Sandbox:

- a presença de **um único** `SPLI_...`/link `rel: SPLIT` na Order comprova apenas que o PagBank **aceitou/criou o recurso de Split**;
- isso pode ser tratado como **`accepted_unverified`** para permitir o fluxo Sandbox;
- isso **não** significa que os valores dos recebedores foram conciliados/comprovados;
- a conciliação detalhada do Split fica para uma etapa posterior e **não deve bloquear o QR Code ou a venda básica Sandbox**.

---

## 2. Conexão correta — NÃO recomeçar daqui

### Conexão homologada atual

- Connection ID: `824df77f-9d91-4c8a-9b18-ea51ba052407`
- `credential_mode = connect_sms`
- `status = connected`
- `is_current = true`
- seller termina em `...D480`
- `access_token_enc` presente
- `refresh_token_enc` presente

Esta conexão já foi comprovada como capaz de consultar Orders criadas no fluxo marketplace.

### Conexão manual histórica

- Connection ID: `1be1ae6d-29b2-4b38-84f1-c365e6bd5de1`
- `credential_mode = sandbox_manual_token`
- `is_current = false`
- manter somente no histórico

### NÃO repetir

- não trocar novamente para `sandbox_manual_token`;
- não recriar conexão SMS sem necessidade objetiva;
- não refazer OAuth browser;
- não copiar access token para TXT;
- não usar token tradicional para tentar reproduzir Orders marketplace;
- não alterar `is_current` sem evidência concreta.

---

## 3. O que já foi comprovado

### 3.1 Token tradicional

Foi possível criar uma cobrança PIX direta Sandbox de R$ 0,01 com token tradicional do seller.

Isso prova apenas cobrança direta da própria conta.

**Não usar esse resultado como base para o fluxo marketplace/Connect.**

### 3.2 Consulta real usando `connect_sms`

#### PIX existente

- Order: `ORDE_3DF26723-A68D-4392-B47F-530DCB34B630`
- Charge: `CHAR_DDB650E1-FABA-4E1B-875E-2806E486DACD`
- Split: `SPLI_2D316D1D-5709-4EAC-980D-36F098E0B780`

Resultados reais:

- `GET /orders/{id}` → **200**
- status → **PAID**
- Charge presente na Order
- Split presente na Order
- link `rel: SPLIT` presente
- `GET /orders?charge_id=...` → **200**
- `GET /charges/{id}` → **406**
- `GET /splits/{id}` → **403**

#### Cartão existente

- Order: `ORDE_7591B58A-C658-45BC-9C9B-710FB3897ED5`
- Charge: `CHAR_6D914E89-4519-4988-9378-136EF7853FF3`
- Split: `SPLI_29AC8034-CA53-4003-AB39-ECCA4D34B19E`

Resultados reais:

- `GET /orders/{id}` → **200**
- status → **PAID**
- Charge presente na Order
- Split presente na Order
- link `rel: SPLIT` presente
- `GET /orders?charge_id=...` → **200**
- `GET /charges/{id}` → **406**
- `GET /splits/{id}` → **403**

### Conclusão prática dessas consultas

- a conexão `connect_sms` está funcionando;
- Order é consultável;
- Order por Charge ID é consultável;
- o PagBank cria e referencia o recurso de Split;
- a consulta direta de Split está bloqueada;
- a consulta direta de Charge retornando 406 **não deve bloquear o fluxo básico**, porque a Charge é visível pela própria Order e por `/orders?charge_id`.

---

## 4. Vendas Sandbox que já chegaram longe

### PIX anterior

Já houve piloto PIX de aproximadamente R$ 106 com:

- valor da empresa esperado no payload: R$ 100;
- taxa SmartBus esperada no payload: R$ 6;
- Order criada;
- Charge criada;
- recurso Split criado;
- QR criado;
- Order posteriormente consultada como `PAID`;
- passagem emitida.

A consulta detalhada de `/splits/{id}` continuou bloqueada com 403.

### Cartão anterior

Já houve cobrança Sandbox de cartão de aproximadamente R$ 106 com:

- valor da empresa esperado no payload: R$ 100;
- taxa SmartBus esperada no payload: R$ 6;
- Order criada;
- Charge criada;
- recurso Split criado;
- pagamento concluído;
- Order consultável como `PAID`;
- passagem registrada.

Houve atraso/ruído na tela de confirmação, mas isso é posterior ao objetivo mínimo de conseguir cobrar.

---

## 5. Bloqueio REAL atual do PIX

Venda mais recente:

- sale: `8e124db3…`
- Order: `ORDE_91DF2963-6B77-4A56-8295-A695CF60AF15`
- Charge: `CHAR_C413E205…`
- status externo: `WAITING`

A Order foi criada pelo PagBank.

O SmartBus, porém, marcou a tentativa como falha:

`pagbank_split_not_confirmed`

Consequência:

- QR Code não foi exibido;
- tela informou cobrança em verificação;
- corretamente não foi criada uma segunda cobrança.

### Causa de implementação

O PIX hoje exige confirmação detalhada dos recebedores do Split antes de considerar a Order utilizável.

Mas o PagBank:

- cria um recurso `SPLI_...`;
- retorna o link de Split na Order;
- bloqueia `GET /splits/{id}` com 403.

O cartão já possui tratamento mais simples: quando há um único `SPLI_...` e os recebedores não podem ser lidos, aceita como `accepted_unverified`.

**Próxima correção mínima:** aplicar ao PIX a mesma ideia conservadora do cartão para não bloquear o QR Code quando existe exatamente um Split criado pelo provedor.

Não marcar Split como reconciliado. Apenas permitir o fluxo básico.

### Resultado após PR #769 — teste de 2026-10-08

Criação PIX Sandbox com Split e exibição do QR foi comprovada.

- sale: `0a90f91f-08d5-41e7-a395-60fc860c8bfc`
- Order: `ORDE_CE74C7E6-3B91-4AEE-BF0B-22DDDF6DAF09`
- Charge: `CHAR_2AF06611-4D1F-4646-8550-C30305EAC952`
- Split: `SPLI_31CBB3C9-9213-4DA7-A9FA-389B89873930` (único)
- `split_status = accepted_unverified`; tentativa `succeeded`; status externo `WAITING`
- QR Code e copia-e-cola exibidos na confirmação; venda `pendente_pagamento`
- Conexão: `connect_sms` `824df77f…`, seller `…D480`
- Webhook inicial (WAITING) rejeitado 401 — problema conhecido da seção 6, não investigado.

PIX **ainda não** concluído de ponta a ponta: falta pagamento e Order `PAID`.

---

## 6. Webhook — conhecido, mas NÃO é prioridade para liberar o básico

Último teste:

- webhook PagBank chegou;
- header `x-authenticity-token` presente;
- `x-payload-signature` ausente;
- foi usado somente o token de webhook associado à conexão `connect_sms`;
- validação retornou **401 `pagbank_signature_mismatch`**;
- nenhuma venda foi finalizada pelo webhook.

### Regra até o fluxo básico funcionar

**Não gastar mais tempo com assinatura de webhook agora.**

A confirmação de pagamento pode ser feita por consulta autoritativa da Order no PagBank usando a conexão `connect_sms`.

O webhook deve continuar seguro e pode continuar rejeitando assinatura inválida.

Depois que PIX e cartão básicos estiverem funcionando de ponta a ponta por consulta direta, o webhook volta para a fila de homologação.

### NÃO fazer agora

- não comparar vários tokens novamente;
- não aceitar fallback inseguro;
- não trocar algoritmo sem prova;
- não bloquear venda básica Sandbox por causa do webhook;
- não criar novos endpoints de diagnóstico apenas para assinatura.

---

## 7. O que NÃO investigar novamente sem evidência nova

Estas frentes já consumiram tempo e não devem ser reabertas automaticamente:

1. **OAuth browser do PagBank** — não é necessário para o fluxo atual.
2. **Troca entre token manual e Connect SMS** — a conexão correta já está definida.
3. **Token tradicional do seller para Orders marketplace** — já comprovado que é outro contexto.
4. **GET /splits/{id}** — retorna 403 com as credenciais já testadas.
5. **GET /charges/{id}** — retorna 406; usar Order/Order por Charge no fluxo básico.
6. **Assinatura de webhook** — deixar para depois do básico.
7. **Produção** — permanece bloqueada.
8. **Refatoração ampla da integração** — proibida enquanto o básico não passar.
9. **Nova arquitetura, novas tabelas ou novos modos de credencial** — não criar.
10. **Asaas** — não misturar nesta tarefa.

---

## 8. Regra para qualquer IA ou desenvolvedor que continuar daqui

Antes de alterar código, responder:

### Esta mudança é indispensável para fazer PIX ou cartão Sandbox funcionar com Split?

Se a resposta for **não**, não faça agora.

### Ordem obrigatória de trabalho

1. liberar PIX com QR;
2. pagar PIX Sandbox;
3. consultar Order;
4. finalizar venda e emitir passagem uma vez;
5. testar cartão aprovado;
6. testar cartão recusado;
7. somente depois voltar para webhook, conciliação detalhada do Split, parcelamento, 3DS e produção.

---

## 9. Critério de sucesso da fase atual

A fase básica PagBank Sandbox será considerada concluída quando:

### PIX

- Order criada;
- Split solicitado;
- exatamente um recurso `SPLI_...` retornado;
- QR Code exibido;
- pagamento realizado;
- `GET Order` retorna `PAID`;
- venda finalizada uma vez;
- passagem emitida uma vez.

### Cartão

- Order criada;
- Split solicitado;
- exatamente um recurso `SPLI_...` retornado;
- cartão aprovado conclui pagamento;
- Order confirma `PAID`;
- venda finalizada uma vez;
- passagem emitida uma vez;
- cartão recusado não finaliza a venda.

### Não é requisito desta fase

- `GET /splits/{id}` = 200;
- webhook homologado;
- reconciliação detalhada de receivers;
- parcelamento;
- 3DS;
- Produção.

---

## 10. Princípio final

**Primeiro fazer funcionar. Depois endurecer, reconciliar e homologar tudo que faltar.**

Não transformar uma limitação acessória do Sandbox em bloqueio para provar o fluxo essencial.


---

## 11. Regra permanente de aprendizado — alimentar este arquivo a cada teste

Este arquivo é a memória operacional obrigatória da integração PagBank Sandbox.

A partir de agora, sempre que ocorrer qualquer um destes casos:

- teste novo;
- erro novo;
- hipótese descartada;
- endpoint que não funciona;
- credencial que não serve para determinado fluxo;
- comportamento confirmado;
- armadilha descoberta;
- correção aplicada;
- decisão de simplificação;

este documento deve ser atualizado antes de abrir uma nova frente de investigação.

### Cada atualização deve registrar no mínimo

1. **o que foi testado**;
2. **qual era o objetivo**;
3. **qual foi o resultado real**;
4. **o que ficou comprovado**;
5. **o que foi descartado**;
6. **o que NÃO deve ser repetido**;
7. **qual é o próximo passo mínimo**.

### Regra contra repetição

Nenhuma IA, desenvolvedor ou ferramenta deve repetir um teste já registrado como inconclusivo, bloqueado ou desnecessário sem existir uma evidência nova concreta que justifique repetir.

Se houver nova evidência, registrar primeiro por que o teste antigo precisa ser reaberto.

### Regra de escopo para a fase básica

Até PIX e cartão Sandbox com Split passarem de ponta a ponta:

- não ampliar arquitetura;
- não criar novos modos de credencial;
- não adicionar boleto;
- não adicionar recorrência;
- não adicionar parcelamento;
- não adicionar 3DS;
- não exigir webhook para concluir a prova funcional;
- não exigir conciliação detalhada de Split;
- não abrir Produção.

O foco é somente:

- **PIX à vista**;
- **cartão de crédito em pagamento único**;
- **Split entre empresa vendedora e SmartBus**;
- **consulta autoritativa da Order para confirmar pagamento**;
- **finalização idempotente da venda**;
- **emissão única da passagem**.

Só depois desse fluxo básico comprovado os demais recursos entram em uma nova fase.

---

## 12. Correção local do bloqueio PIX — 2026-10-07

**O que mudou e por quê:** o gate PIX rejeitava com `pagbank_split_not_confirmed` uma Order válida com QR e um único Split referenciado apenas porque os recebedores não estavam visíveis. Agora, como no cartão, aceita essa resposta como `accepted_unverified`, após validar referência, IDs, total da cobrança e soma do plano esperado. O QR continua obrigatório. Se os recebedores estiverem visíveis, a conferência integral continua obrigatória; divergências, Split totalmente ausente e múltiplos Splits continuam bloqueados.

O estado é registrado na coluna existente `payment_attempts.split_status` e nos logs, tanto na criação quanto na recuperação por referência. `accepted_unverified` não torna a conciliação bem-sucedida, não marca `split_ready` como comprovado e não é registrado como Split validado. A confirmação financeira continua dependendo da consulta autoritativa da Order. Não houve alteração na consulta GET Split, nas credenciais, na conexão/OAuth, no cartão ou no webhook.

**O que os testes locais provaram:** 184 testes relevantes passaram em 11 arquivos, com 18 testes novos e ajuste do teste que exigia o bloqueio antigo. Foram cobertos QR obrigatório, Split único sem detalhes, Split ausente ou múltiplo, referência/valores/soma divergentes, recebedores parcialmente visíveis, cartão, assinatura de webhook e integridade financeira. Os testes da Edge Function, com banco e PagBank simulados, comprovaram retorno do QR, persistência de `accepted_unverified` sem comprovar `split_ready`, recuperação sem nova Order e reutilização com finalização após consulta da Order `PAID`. TypeScript do app, `deno check` da Edge Function, build, lint dos testes alterados e `git diff --check` passaram. A revisão confirmou que a lógica de webhook e de confirmação financeira permaneceu idêntica à `main`.

**Ainda não comprovado:** nenhuma venda real Sandbox foi executada nesta etapa. Não registrar PIX como funcionando antes desse teste. O próximo passo mínimo é validar no runtime Sandbox a exibição do QR, o pagamento de teste, a consulta da Order e a finalização com emissão única da passagem. A conciliação detalhada dos recebedores continua pendente para outra fase.

**Não repetir nesta etapa:** investigação de credenciais, conexão/OAuth, webhook ou GET Split. A limitação já documentada de leitura do Split não deve voltar a bloquear a prova do fluxo PIX básico.


---

## 13. PIX Sandbox — confirmação de pagamento e emissão de passagens (2026-10-08)

Consulta somente leitura ao banco conectado ao Lovable após o teste real da PR #769:

- Venda: `0a90f91f-08d5-41e7-a395-60fc860c8bfc`.
- Order: `ORDE_CE74C7E6-3B91-4AEE-BF0B-22DDDF6DAF09`.
- Charge: `CHAR_2AF06611-4D1F-4646-8550-C30305EAC952`.
- Split: `SPLI_31CBB3C9-9213-4DA7-A9FA-389B89873930`.
- QR Code PIX R$ 106,00 exibido no checkout, confirmado no teste funcional anterior.
- `sales.status = pago`.
- `payment_attempts.external_status_raw = PAID`, `normalized_status = paid`, `state = succeeded`.
- `payment_attempts.split_status = accepted_unverified` — **não** comprova reconciliação detalhada do Split.
- Apenas **1** registro em `payment_attempts` para a venda.
- **2 passagens emitidas** em `tickets`, uma de ida (assento 53, número `SB-001699`) e outra de volta (`VOLTA-1`, número `SB-001700`), ambas registradas no mesmo instante. São dois trechos diferentes; a quantidade não indica duplicação.

### O que ficou comprovado

Criação da Order PIX Sandbox com Split único referenciado, apresentação do QR Code, registro posterior de pagamento `PAID` no SmartBus, atualização da venda para `pago` e emissão de duas passagens para dois trechos distintos. A prova ocorreu sem precisar de consulta detalhada `GET /splits/{id}`.

### Limites da prova

Esta auditoria verificou o **estado persistido no banco**, não executou nova consulta HTTP ao PagBank. A origem exata da confirmação (consulta autoritativa ou outro mecanismo) e a idempotência sob reprocessamento ainda precisam de verificação específica; não afirmar que foram comprovadas somente por esta leitura. O Split permanece `accepted_unverified`, sem valores dos recebedores conciliados.

### Não repetir / próximo passo mínimo

Não voltar a OAuth, troca de credenciais, GET Split, GET Charge ou investigação de assinatura de webhook para provar o PIX básico. Preservar o caso PIX como marco funcional real. Próximo passo: validar cartão de crédito Sandbox com Split no mesmo fluxo mínimo, sem ampliar escopo; em revisão separada, confirmar a origem da atualização `PAID` e a idempotência da finalização.

---

## 14. Cartão de crédito Sandbox — teste real com Split (2026-10-08)

Uma venda pelo checkout público normal, sem alteração de código, conexão `connect_sms` atual (seller `…D480`), cartão oficial de teste PagBank (Visa final 2097, criptografado no navegador):

- Venda: `e0790200-13d5-4fd8-b770-d981320be1e6`.
- Order: `ORDE_B20DF8BA-1BDC-4559-8468-0C0073116552`.
- Charge: `CHAR_852B560D-9B4C-4078-9321-6E7430B80E4F`.
- Split: `SPLI_7226C60B-4BAD-419D-8412-00D43013863E` (único).
- `split_status = accepted_unverified` — não comprova conciliação dos recebedores.
- Status externo `PAID`; confirmação por consulta autoritativa (`pagbank_card_confirm_on_create`), já que o webhook continua rejeitado 401 (problema conhecido).
- `sales.status = pago`; 1 registro em `payment_attempts`; 2 passagens (ida assento 52 `SB-001701`, volta `SB-001702`); bloqueios liberados; sem duplicidade.

**Comprovado:** o fluxo básico Sandbox de PIX + cartão de crédito à vista com Split foi comprovado. Nenhuma alteração de código foi necessária. Pendentes (fora deste marco): webhook autenticado e conciliação detalhada do Split.

---

## 15. Cartão de crédito Sandbox — recusa controlada (2026-10-09)

Venda pelo checkout público normal, sem alteração de código, conexão `connect_sms` atual (seller `…D480`), cartão oficial de recusa PagBank (Visa final 0766, criptografado no navegador):

- Venda: `bb2d3ab9-4977-410f-9902-e9281a01bcb9`.
- Order: `ORDE_642A69DB-3413-499D-8731-357770DFB74A`.
- Charge: `CHAR_98E2FF04-AF52-4B65-8280-8A96D0DF64A1`.
- Split referenciado: `SPLI_89C48132-53BF-4381-B118-DE053EC3DF02`.
- Status externo: `DECLINED`.
- `payment_attempts`: 1 registro, `state = failed`, `error_code = pagbank_card_declined`, detalhe `charge_declined`.
- `sales.status = pendente_pagamento` (não `pago`); 0 passagens; nenhuma segunda cobrança; nenhuma confirmação por consulta.
- Interface: redireciona para a confirmação, que mostra "Aguardando confirmação do pagamento" / "Aguardando Pagamento", sem passagem. Não há mensagem explícita de recusa (o texto ainda cita "Asaas") — ponto de UX, não de integridade financeira.

### Fase básica PagBank Sandbox concluída

- PIX aprovado com Split;
- cartão à vista aprovado com Split;
- cartão recusado sem finalização indevida.

Pendências fora deste marco: webhook autenticado e conciliação detalhada do Split.

### Correção de UX após o teste de recusa

Foi corrigida a inconsistência visual identificada no teste negativo: quando o checkout PagBank recebe `pagbank_card_declined`, a navegação sinaliza explicitamente a recusa e a tela de confirmação mostra “Pagamento não aprovado”, sem sugerir que a cobrança ainda está aguardando confirmação. A tela também deixa de exibir textos específicos do Asaas em vendas PagBank.

A correção é exclusivamente de UX: não altera criação de Order/Charge, Split, confirmação financeira, status da venda, webhook, credenciais, banco ou emissão de passagens.


---

## 16. Portal do Desenvolvedor SmartBus — log 404 com token da plataforma (2026-10-09)

Foi identificado no Portal do Desenvolvedor Sandbox da conta SmartBus um log de:

- método: `GET`;
- recurso: `/orders/ORDE_7591B58A-C658-45BC-9C9B-710FB3897ED5`;
- resposta: `404 NOT_FOUND`;
- autenticação feita com o token direto da conta/portal SmartBus.

Esse mesmo Order já havia sido consultado com sucesso no fluxo marketplace usando a conexão `connect_sms` do vendedor e retornado `200 / PAID`.

### O que ficou comprovado

O token direto do Portal do Desenvolvedor SmartBus e o `access_token` delegado da conexão Connect do vendedor pertencem a contextos diferentes. Para consultar/criar Orders em nome do vendedor conectado, deve ser usado o token vinculado àquele vendedor via Connect.

Portanto, um `404` no Portal do Desenvolvedor da SmartBus ao consultar uma Order criada em nome do vendedor **não indica falha da Order nem falha do checkout**. Ele indica que a requisição foi feita no contexto de credencial errado para aquele recurso.

### Não repetir

- não usar o token direto do Portal do Desenvolvedor SmartBus para validar Orders marketplace criadas em nome do vendedor;
- não interpretar esses `404` como perda ou inexistência da Order sem antes consultar com a conexão `connect_sms` correta;
- não trocar a conexão corrente do vendedor por causa desse log.

### Próximo passo mínimo

Com PIX, cartão aprovado e cartão recusado já comprovados, a próxima frente é a homologação segura do webhook PagBank. Antes de alterar a validação, comparar o comportamento real recebido no SmartBus com a documentação oficial vigente e determinar qual modelo de assinatura se aplica ao webhook de Orders nesta integração.


---

## 17. Portal do Desenvolvedor do vendedor — contraste entre token direto e Connect (2026-10-09)

Foram localizados logs no Portal do Desenvolvedor Sandbox da própria conta vendedora.

### Evidência 1 — GET de Orders marketplace retorna 404 com token direto do vendedor

O token direto do Portal do Desenvolvedor do vendedor tentou consultar Orders já conhecidas do fluxo marketplace/Connect e recebeu `404 NOT_FOUND`.

Isso reforça que o token direto do seller não possui o mesmo contexto de acesso do `access_token` delegado obtido pela conexão `connect_sms`.

### Evidência 2 — POST /orders direto com o mesmo token retorna 201

Com o token direto do Portal do vendedor, um `POST /orders` PIX simples criou com sucesso uma nova Order própria da conta, retornando `201`, Charge `WAITING` e QR Code. O payload não continha Split e a resposta trouxe `notification_urls: []`.

### Conclusão operacional

Existem dois contextos diferentes de credencial mesmo quando ambos se relacionam ao mesmo vendedor:

- **token direto do Portal do vendedor**: cria/consulta Orders diretas da própria conta;
- **token delegado Connect (`connect_sms`)**: cria/consulta Orders do fluxo marketplace em nome daquele vendedor.

Não usar o token direto do vendedor para validar Orders marketplace/Connect e não interpretar o `404` como inexistência da Order.

### Relação com o webhook 401

Essa nova evidência não resolve sozinha a assinatura do webhook, mas reduz a hipótese de que o token direto do seller seja o segredo correto para validar notificações do fluxo marketplace. A investigação do webhook deve manter separados: token direto do seller, access token Connect e segredo/token específico de webhook/documentação do provedor.

Não alterar credenciais nem conexão corrente com base nesses logs.


---

## 18. Webhook PagBank 401 — auditoria Codex sem causa comprovada (2026-10-09)

A auditoria do código e dos testes não comprovou a causa exata do `401 pagbank_signature_mismatch`. Nenhuma correção foi aplicada por hipótese.

### Evidências confirmadas

- O webhook real observado usa `x-authenticity-token`.
- Não há evidência suficiente para migrar esse fluxo para `x-payload-signature`.
- A implementação atual calcula SHA-256 sobre `token + "-" + payload`.
- O corpo é lido com `req.text()`; não há reserialização JSON, embora eventual BOM fosse removido.
- Não há evidência de BOM nem prova byte a byte da entrega real.
- A validação usa exclusivamente `webhook_token_enc` da conexão vinculada.
- Não está comprovado que esse valor corresponda ao segredo efetivamente usado pelo PagBank para assinar a entrega.
- A confirmação por consulta autoritativa da Order continua funcionando e não foi alterada.

### O que ficou descartado nesta etapa

- não migrar automaticamente para `x-payload-signature`;
- não desativar validação;
- não aceitar fallback inseguro;
- não trocar credenciais por tentativa;
- não alterar idempotência nem finalização financeira.

### Validação da auditoria

- 365 testes existentes passaram;
- 31 testes auxiliares passaram;
- build passou;
- TypeScript passou;
- `git diff --check` passou.

### Próximo teste mínimo

Confirmar com o PagBank qual segredo/contexto assina uma entrega específica do webhook de Orders e, se possível, comparar os bytes originais usados na origem com os bytes recebidos no runtime, sem expor credenciais ou payloads sensíveis.

Até existir essa evidência, manter o webhook rejeitando assinaturas inválidas e continuar usando a consulta autoritativa da Order como fallback seguro.


---

## 19. Pesquisa GitHub — assinatura webhook Connect e próximo diagnóstico (2026-10-09)

Foi realizada pesquisa aprofundada em implementações públicas no GitHub para o header `x-authenticity-token`, incluindo projetos que integram PagBank Orders e um projeto com arquitetura OAuth/Connect multiempresa.

### Consenso encontrado para Orders sem Connect

Diversas implementações independentes reproduzem a mesma regra publicada pelo PagBank:

`SHA-256(token_da_conta + "-" + payload_bruto)`

O token citado nas cópias da documentação oficial é o **token da conta fornecido via iBanking**. O payload deve ser exatamente o corpo bruto recebido, sem reserialização. Implementações públicas também mostram que isso é SHA-256 simples, não HMAC.

### Ponto ainda ambíguo sob Connect

O repositório público `12-apps/shared-packages` documenta explicitamente a mesma lacuna encontrada no SmartBus: em uma conexão PagBank Connect, o provedor entrega `access_token/refresh_token`, mas a documentação de autenticidade fala no token direto da conta. Eles classificam como não comprovado qual segredo realmente assina a entrega Connect.

Os candidatos considerados por esse projeto são:

- token direto da conta vendedora;
- access token Connect;
- token direto da plataforma;
- webhook token configurado;
- client secret da aplicação Connect.

O commit público `c5e0bc470104cc8931565da42c10321944a3ef8b` criou um diagnóstico específico para descobrir o assinante comparando, em memória, uma entrega real contra todos os candidatos, sem fazer nova chamada ao PagBank.

### Situação do SmartBus

O webhook atual preserva `rawBody` com `req.text()` e calcula a fórmula correta, mas para vendas vinculadas a uma conexão testa somente o valor armazenado em `connection.webhook_token_enc`. Os logs persistidos guardam presença do header e hash do corpo, não o corpo bruto nem a assinatura apresentada; portanto as entregas antigas não possuem dados suficientes para a comparação offline completa.

### Próximo teste mínimo recomendado

Em Sandbox e somente para diagnóstico, comparar **em memória** uma nova entrega real contra os candidatos que já existirem de forma segura no backend. Registrar apenas:

- qual rótulo de candidato coincidiu; ou
- `none` se nenhum coincidiu.

Não persistir nem logar segredo, assinatura recebida, payload bruto ou hashes derivados de cada segredo.

Esse diagnóstico não deve aceitar o webhook, não deve confirmar venda e não deve alterar a regra atual de segurança. O comportamento permanece fail-closed até existir uma correspondência comprovada.

Se nenhum candidato coincidir, a próxima hipótese passa a ser diferença nos bytes efetivamente recebidos/runtime, e não deve ser corrigida por tentativa.

---

## 16. Diagnóstico da credencial que assina o webhook Connect (2026-10-09)

- Implantado em `pagbank-webhook` (somente Sandbox, somente quando a assinatura já foi rejeitada).
- Compara em memória o `x-authenticity-token` com: `connect_access_token`, `connection_webhook_token`, `platform_account_token`, `application_client_secret`, `environment_webhook_token` — apenas da venda/conexão/ambiente da notificação.
- Registra só `matched_candidate` e a lista de nomes comparados (`sale_integration_logs.response/payload` → `signature_diagnostic`). Nenhum token, hash, assinatura ou payload é gravado.
- Nenhuma regra de segurança foi flexibilizada: o webhook continua respondendo 401 e não finaliza venda.
- **Status: PRONTO PARA TESTE REAL.** O resultado depende de uma nova notificação real; o problema NÃO está resolvido.


---

## 20. Diagnóstico real de assinatura Connect — nenhum candidato conhecido coincidiu (2026-10-09)

Foi executado um novo teste PIX Sandbox após a publicação do diagnóstico seguro de assinatura.

- Venda: `b6aeeae2-2147-4271-9281-eb1f37d75376`
- Order: `ORDE_BA5A0B6F-A27C-4AA1-B633-8BF5195DBBA2`
- Charge: `CHAR_79B79E2D-82E9-43E3-81FB-561FA39FF1E7`
- Split: `SPLI_13B8D8DF-D676-4B01-8A72-0CA12AE762F4`
- valor: R$ 106,00
- conexão: `824df77f-9d91-4c8a-9b18-ea51ba052407`
- seller: `…D480`

### Resultado do webhook WAITING

O PagBank enviou webhook com `x-authenticity-token` presente e sem `x-payload-signature`.

O diagnóstico comparou, somente em memória:

- `connect_access_token`
- `connection_webhook_token`
- `platform_account_token`
- `application_client_secret`

Resultado:

`matched_candidate = none`

O webhook permaneceu rejeitado com `401 pagbank_signature_mismatch`.

### Resultado do webhook PAID

Após aproximadamente 5 minutos, o PagBank enviou nova notificação `PAID`.

O mesmo conjunto de candidatos foi comparado.

Resultado novamente:

`matched_candidate = none`

O webhook continuou rejeitado com `401 pagbank_signature_mismatch`.

### Confirmação financeira

A Order foi consultada autoritativamente logo depois e retornou `PAID`. A venda foi atualizada para `pago` e a passagem foi emitida normalmente pelo fluxo de fallback seguro.

### Conclusão

Ficou comprovado que, nesta conexão Connect Sandbox, a assinatura real **não corresponde** a nenhum dos quatro candidatos comparados acima.

Isso reduz o problema a duas frentes principais ainda não comprovadas:

1. o PagBank pode estar assinando com o **token direto da conta vendedora** (token da conta/iBanking), que é diferente do `access_token` Connect e não foi usado neste diagnóstico;
2. pode existir divergência nos bytes exatos do payload usados na origem e recebidos pelo runtime.

Não alterar a segurança do webhook. Não aceitar múltiplos candidatos em produção. O próximo teste deve ser mínimo e servir apenas para distinguir essas duas hipóteses.


---

## 21. Token direto do vendedor também descartado como assinante (2026-10-10)

Novo teste PIX Sandbox executado após incluir o token direto da conta vendedora como candidato apenas de diagnóstico.

- Venda: `3e18a3f3-ec64-4e20-ab0d-be6bc66da8af`
- Order: `ORDE_8D506A8A-85A7-426B-831D-0926D43838FA`
- Charge: `CHAR_EC31493A-8933-4785-9766-FC103DFFCF6E`
- Split: `SPLI_34393061-A00A-4B53-ADCB-8FF9EBFCD79A`
- valor: R$ 106,00
- conexão: `824df77f-9d91-4c8a-9b18-ea51ba052407`
- seller: `…D480`

### Resultado WAITING

O webhook chegou com `x-authenticity-token` e sem `x-payload-signature`.

Candidatos comparados somente em memória:

- `connect_access_token`
- `connection_webhook_token`
- `platform_account_token`
- `application_client_secret`
- `seller_account_token`

Resultado:

`matched_candidate = none`

O webhook permaneceu rejeitado com `401 pagbank_signature_mismatch`.

### Resultado PAID

Após aproximadamente 5 minutos, o PagBank enviou nova notificação `PAID`.

Os mesmos cinco candidatos foram comparados.

Resultado novamente:

`matched_candidate = none`

O webhook continuou rejeitado com `401 pagbank_signature_mismatch`.

### Confirmação financeira

Logo depois, a consulta autoritativa da Order retornou `PAID`. A venda foi atualizada para `pago` e a passagem foi emitida normalmente pelo fallback seguro.

### Conclusão

O token direto da conta vendedora também está descartado como assinante real dessas notificações Connect Sandbox.

Com os principais candidatos de credencial testados e todos retornando `none`, a hipótese prioritária passa a ser diferença entre os bytes usados pelo PagBank para gerar a assinatura e os bytes efetivamente entregues ao runtime antes de `req.text()`, ou algum detalhe de transporte/codificação ainda não observado.

Não alterar a segurança do webhook. O próximo diagnóstico deve focar somente na preservação e comparação segura dos bytes recebidos, sem persistir payload bruto ou segredo.

---

## 17. Preparação para Produção — Etapa 1 (2026-10-10)

Implementado (sem tocar webhook, assinatura, OAuth, Connect, Split, credenciais ou liberação de Produção):

- **Emissão única:** função de banco `issue_sale_tickets_from_staging` com trava por venda + índice único `tickets (sale_id, trip_id, passenger_cpf, seat_label)` (vale para itens sem poltrona física e ida/volta). Usada pela finalização comum.
- **Validação antes de finalizar:** `PAID` só finaliza se Order, `reference_id`, valor (centavos), moeda BRL, ambiente e conexão coincidirem com a venda (`_shared/pagbank/order-integrity.ts`). Divergência é registrada e bloqueia.
- **Recuperação automática:** o cleanup (cron de 1 min) consulta até 20 vendas PagBank `pendente_pagamento` com Order criada nas últimas 24 h, usando a credencial/ambiente da venda. Só consulta; nunca cria cobrança.
- **Cleanup protegido:** antes de cancelar venda PagBank com Order, consulta oficial. `PAID` → finaliza; `WAITING`/indisponível/indeterminado → preserva venda e passageiros; `DECLINED`/`CANCELED` → cancelamento normal. Vendas Asaas inalteradas.

Pendente para Produção: webhook autenticado (a função `pagbank-webhook` recebe a mesma finalização no próximo deploy dela), conciliação detalhada do Split, decisão sobre vendas PagBank `WAITING` além de 24 h (hoje ficam preservadas, sem cancelamento automático), homologação e liberação.

---

## 22. Correção da emissão parcial — 2026-10-11 (Codex)

**Causa comprovada na base `f4a0271e`:** o helper e a RPC retornavam ao encontrar
qualquer ticket; o índice CPF/trecho/label confundia itens legítimos repetidos.
O `ON CONFLICT DO NOTHING` seguido de limpeza não provava emissão integral.

**Correção preparada, ainda não implantada/homologada no Sandbox:** migration
Drizzle `0002_recover_partial_ticket_issuance` (mesmo mecanismo da Etapa 1),
registrada no journal. Adiciona `tickets.sale_passenger_id` com índice único e
`sales.expected_ticket_count`. Substitui apenas o índice lógico anterior;
constraints de ocupação física continuam valendo. O ID do item distingue ida,
volta e itens repetidos sem poltrona. A RPC exige venda paga e empresa correta,
mantém a trava transacional, vincula tickets históricos apenas por correspondência
única e snapshots compatíveis, insere os ausentes e verifica cobertura integral
antes de registrar a quantidade esperada e apagar o staging. Qualquer conflito
provoca rollback, preservando passageiros e tickets anteriores.

A finalização compartilhada não considera mais um ticket suficiente quando há
staging ou divergência da quantidade esperada. Falhas de leitura não comprovam
consistência. O nome legado `inconsistent_paid_without_ticket` foi preservado
para compatibilidade dos consumidores, incluindo emissão parcial.
A recuperação PagBank também seleciona vendas pagas com staging ou quantidade
persistida divergente, independentemente da janela de 24h. Reutiliza GET Order,
validação de integridade e finalização comum; nunca cria cobrança. Tentativas
pendentes continuam com a janela existente. A seleção de vendas pagas prioriza
as menos recentemente consultadas para reduzir repetição de casos problemáticos.
Há reserva de capacidade para pendentes quando ambas as filas têm candidatos;
vendas pagas completas não entram novamente pela lista de tentativas recentes.
A reconciliação manual transmite o gateway da venda à finalização, evitando
escrita de status PagBank em campos específicos Asaas.

**Evidências locais:** 394 testes Vitest em 36 arquivos aprovados, incluindo
recuperação de venda já paga e finalização compartilhada PagBank/Asaas. Em
PostgreSQL 16 descartável, a migration real passou em 14 cenários com dados
sintéticos: emissão completa, parcial histórica 1/2 → 2/2 sem duplicação, parcial
com IDs e itens repetidos, ida/volta, ausência de poltrona, reexecução, ambiguidade
histórica, incompatibilidade de snapshot, conflito de assento com rollback,
empresa errada, venda não paga, manifesto incompleto, emissão Asaas e seleção da fila paga.
Duas conexões PostgreSQL concorrentes retornaram `created` e `skipped_existing`,
com exatamente duas passagens e staging limpo. Harness versionado em
`tests/database/partial-ticket-issuance.mjs`; instruções no README adjacente.
Build Vite, TypeScript do app e `git diff --check` passaram. O lint do teste novo
passou; o teste Etapa 1 mantém três usos preexistentes de `any` apontados pelo lint.
Este banco usa schema mínimo: não prova todos os triggers/RLS do Supabase real.

**Limitações:** vendas históricas cujo staging já foi apagado e cuja quantidade
esperada nunca foi persistida não permitem reconstrução confiável por contagem.
Não inventar passageiros nem declarar essas vendas integralmente reconciliadas.
Correspondência histórica ambígua exige revisão operacional; não escolher um item
arbitrário. Remoção de um ticket após emissão completa é detectada pela quantidade,
mas, sem staging, não pode ser recuperada automaticamente. Sem mudanças em webhook,
OAuth, Connect, Split, credenciais, regras comerciais, Asaas específico ou Produção.

**Implantação futura:** aplicar migration antes de atualizar os consumidores da
finalização compartilhada; implantar funções que a importam, inclusive via
status-sync (sem alterar código/autenticação do webhook). Validar com schema real
Sandbox e repetir confirmação simultânea, caso parcial e pagamento com navegador
fechado. Não houve escrita no banco do projeto, merge, deploy ou pagamento real.
Não declarar homologação apenas pelos testes locais.

**Cron confirmado pelo responsável:** job 1 `cleanup-expired-seat-locks`, ativo,
`*/5 * * * *`; 20 execuções a cada 5min com `succeeded`. O command/resultado HTTP
não foi fornecido: não comprova chamada/sucesso da recuperação PagBank.
Esta tarefa não altera periodicidade. Não repetir OAuth, GET Split/Charge ou
investigações básicas de PIX/cartão. Próximo passo mínimo: revisar a PR, validar
migration e consumidores no Sandbox e confirmar o command do cron.

## 23. PR #771 — compatibilidade com trigger físico (2026-10-11)

**Bloqueio comprovado na revisão:** a versão `4f005ad8` selecionava também itens
já emitidos e dependia de `ON CONFLICT DO NOTHING`. O trigger físico BEFORE INSERT
executa antes da resolução do conflito e rejeita a reinserção do assento legítimo.
Os 14 cenários da seção 22 não incluíam esse trigger: não comprovavam implantação.

**Refinamento da mesma migration ainda não aplicada ao projeto:** o INSERT usa
`NOT EXISTS` pela identidade do item, depois da vinculação/validação dos tickets
históricos. O `ON CONFLICT DO NOTHING` foi retirado. A trava por venda e a
verificação integral antes da limpeza permanecem. Nenhuma alteração na função,
trigger ou regra de ocupação física existente.

**Caminhos alternativos:** `NewSaleModal` emite tickets legados sem ID do staging.
O índice lógico antigo foi mantido como índice parcial para esses registros
(`sale_passenger_id IS NULL`). Um trigger separado de identidade serializa os
writers pela mesma trava da RPC, impede inserir tickets sem identidade numa venda
que já possui emissão por item/quantidade esperada, impede remover a identidade e
exige que uma identidade nova corresponda a um item existente da venda paga, da
mesma empresa, passageiro, trecho e lugar. A unicidade global por item continua.
Isso preserva a emissão manual legada sem reabrir duplicação pela retirada do
índice. Não altera as policies existentes, nem amplia permissões das RPCs.
O trigger de identidade precede alfabeticamente o físico, adquirindo primeiro a
trava por venda. Divergências retornam erro e preservam staging/tickets anteriores.

**Evidência:** 25 cenários aprovados em PostgreSQL 16 isolado, carregando diretamente
do repositório o resolvedor físico e a função `assert_physical_seat_available_for_ticket`
e instalando o mesmo trigger BEFORE INSERT/UPDATE. Reproduzido o erro da versão
anterior (`Assento já ocupado neste trecho`), com rollback; depois comprovado
1/2 → 2/2 para assentos físicos PagBank e Asaas. Duas conexões concorrentes
recuperaram uma venda física parcial, sem duplicar. Também cobertos conflito
físico externo com rollback da vinculação histórica, itens sem poltrona, ida/volta,
ambiguidade, permissões RPC, execução por service_role e inserção pública legada
com a policy `Public can create tickets` real do repositório. A policy foi testada
em tabelas auxiliares sintéticas; não representa todas as policies do ambiente.

A suíte existente foi reexecutada: 394 testes em 36 arquivos aprovados;
`git diff --check` passou. Não houve alteração TypeScript neste refinamento.

**Pendências obrigatórias de implantação:** sem acesso aos catálogos/dados e versões
implantadas, não há prova de igualdade entre repositório e Supabase atual. Conferir
índices, triggers, constraints, policies/grants, proprietário das funções, migrations
aplicadas e dados históricos. Conferir especialmente writers legados, mistura de
identidades e assentos que hoje conflitam. Testar no schema completo Sandbox antes
de implantação; a suíte isolada não cobre todos os triggers de vendas e tickets.
Se `0002` já estiver aplicada em algum ambiente, não reexecutar sua versão editada:
será necessária migration incremental nesse ambiente. Nenhuma foi aplicada pelo Codex.

Ordem futura, dependente de aprovação: validar compatibilidade no Sandbox; aplicar
migration transacional em janela controlada (DDL pode bloquear writers); verificar
RPCs e permissões; merge/publicação coordenados de todos os consumidores da
finalização compartilhada. Se merge disparar publicação automática, preparar o
banco antes dele. Preservar evidências e plano de rollback sem apagar pagamentos.
Não executar rollback cego para a RPC antiga depois de tickets por item terem sido
emitidos. Produção PagBank segue bloqueada. Não repetir OAuth, Connect, Split,
GET Charge/Split, diagnósticos de webhook ou testes básicos já comprovados.

## 24. PR #771 — histórico aplicado alinhado à main (2026-10-12)

O responsável informou que o Lovable aplicou com sucesso a migration `0002` e
registrou o arquivo/journal na main. Essa informação atualiza as notas históricas
anteriores de "ainda não aplicada"; o Codex não executou nem repetiu a migration.

Comparação com a main `00afb912`: o SQL funcional era idêntico à PR, mas a main
não possui newline final. O journal da main usa `when = 1791799668965`, diferente
da data originalmente preparada na PR. A branch da PR incorpora essa main e
preserva integralmente seus dois arquivos, sem alterar bytes, tag, idx ou data.
SHA-256 do SQL: `f467e8c7553b9a8b4fab6b61989fc31aeb7381bf019a8244fb59f4600155ce96`.
SHA-256 do journal: `045cb171c9b03898d02a263ef51a7d0369067802ea4f211a29408c89fd9de4ee`.
Esses hashes identificam os arquivos versionados da main; não são nova consulta
à tabela de histórico do banco. O snapshot e os tipos gerados pelo Lovable também
são preservados. Não há diferença desses arquivos no merge proposto contra main.

O código de recuperação/finalização/reconciliação e os testes da PR permanecem
inalterados neste alinhamento. As colunas, nomes/argumentos/retornos das RPCs
utilizados pelo código coincidem com o SQL da main e os tipos gerados atuais.
Não criar outra migration, regenerar/formatar `0002`, alterar sua data nem
reaplicá-la. A publicação dos seis consumidores continua etapa separada:
asaas-webhook, pagbank-webhook, verify-payment-status, reconcile-sale-payment,
create-pagbank-payment e cleanup-expired-locks. Produção PagBank segue bloqueada.
Nenhum banco, deploy, pagamento ou merge da PR foi executado pelo Codex.
Validação após incorporar main: 394 testes em 36 arquivos e TypeScript do app
aprovados; conferência byte a byte/SHA-256 e `git diff --check` aprovados.
Os testes SQL anteriores continuam aplicáveis porque o SQL funcional não mudou;
nenhuma migration foi executada novamente nesta etapa.

## 25. Venda manual multi-gateway — início autorizado (2026-10-12)

Plano aprovado para Draft PRs por etapas. Etapa 1 protege criação da taxa com
sessão/gerente da empresa ou developer e corrige conta emissora na consulta manual
Asaas. Regras financeiras e payload mantidos; testes locais de autorização e
caracterização: 9 aprovados. Nenhum deploy, banco externo, pagamento ou credencial
alterado. Detalhes em VENDA_MANUAL_MULTIGATEWAY.md. Produção PagBank bloqueada.

## 26. Venda manual multi-gateway — implementação em Drafts (2026-10-12)

Plano implementado por etapas cumulativas: Drafts #772, #774, #775, #776, #777
e #778 (validação final). Base inicial `6051424e`;
revalidada a main `1271ddd3`/PR documental #773, que reforça a regra comum manual.
Detalhes, arquivos, gates e procedimento de recuperação em
[VENDA_MANUAL_MULTIGATEWAY.md](./VENDA_MANUAL_MULTIGATEWAY.md).

O fluxo novo, atrás de flags desligadas, registra venda/staging/operação atomicamente,
calcula taxa/benefícios no backend com regras compartilhadas, cobra somente a taxa
pela conta da plataforma e congela gateway/ambiente/conta/snapshot. Claim exclusivo
e consulta por referência impedem recriação após resultado incerto. Confirmação
financeira/ledger persistem antes da tentativa de emissão; liberação e emissão
integral usam uma transação com a RPC 0002. Isenção é derivada no backend e auditada.
Direitos de terceiros são preservados em conciliação sem transferências automáticas.

Migrations novas 0003–0006 são propostas/versionadas; **nenhuma foi aplicada no
SmartBus pelo Codex**. 0002 e seu snapshot permanecem byte a byte iguais à main;
SHA-256 SQL continua `f467e8c7553b9a8b4fab6b61989fc31aeb7381bf019a8244fb59f4600155ce96`.
Entradas históricas do journal, incluindo data/idx/tag da 0002, foram preservadas;
apenas entradas novas foram acrescentadas.

Evidência local final: **445 testes Vitest em 41 arquivos**, TypeScript do app,
build Vite (aviso de tamanho de bundles) e Deno dos nove consumidores aprovados.
**33 cenários PostgreSQL 16 isolado** do fluxo manual e **25 cenários** da emissão
compartilhada anterior aprovados. Venda simulada de 10 itens de R$ 100 emitiu 10
tickets e taxa de R$ 60. Venda física com 1/2 tickets recuperou 2/2 sob duas
conexões concorrentes com os triggers físicos reais do repositório. Falha preserva
prova financeira/staging; reserva física incerta vencida continua ocupada.

PagBank manual é um contexto **direto da plataforma**, exclusivo Sandbox, distinto
do Connect público do vendedor. Modelo candidato documentado: x-authenticity-token,
SHA-256(token + hífen + corpo original em texto), um único token da conta/plataforma.
Assinatura inválida permanece 401; webhook nunca substitui GET autoritativo.
**Não comprovado em Sandbox real neste novo contexto**, inclusive captura/encoding
no runtime publicado e conta/token corretos. O 401 Connect público e sua investigação
pendente não foram corrigidos nem enfraquecidos por esta tarefa.

Próximo passo mínimo: revisar Drafts em ordem, conferir schema completo Sandbox e
contratos reais Asaas; autorizar migrations/publicação coordenada dos nove
consumidores e frontend; depois executar piloto Asaas Sandbox. PagBank manual exige
homologação própria antes de habilitar sua flag Sandbox. Cron informado pelo
responsável continua em **5 minutos**, sem alteração; fila manual não tem corte de
24 horas. Vínculos históricos não foram importados por suposição.

Sem deploy, merge de PR, pagamento externo, edição de banco/credenciais ou ativação
de flags nesta implementação. Produção PagBank permanece bloqueada. Não repetir
OAuth, conexão, GET Split/Charge, PIX/cartão básicos já comprovados. Recuperar por
correção adiante, preservando dados e IDs: não restaurar índices antigos/apagar
passagens/recriar cobranças para simular rollback.

## 27. Correção localizada da ordem de locks — antes dos merges (2026-10-12)

Bloqueio confirmado em PostgreSQL 16 descartável: o guard das migrations 0005 e
0006 adquiria a trava de emissão mesmo para vendas sem operação privada. Um UPDATE
da venda pública Asaas, já com a linha bloqueada, esperava essa trava; emissão
concorrente, já com a trava, esperava a linha. Ambas as definições anteriores
reproduziram `deadlock detected` com conexões reais e barreiras por pg_stat_activity.

Correção de três linhas em cada definição: verificar existência de operação
privada e retornar antes do advisory lock para vendas públicas/legadas. Para
vendas geridas, trava e SELECT do estado após sua aquisição permanecem intactos.
Nenhuma regra financeira, contrato de RPC, credencial, webhook ou código de
checkout foi alterado. 0002, snapshot e journal permanecem preservados.

PRs atualizadas: #776 (0005/teste), #777 (incorporação cumulativa por rebase) e
#778 (0006/evidências). #772, #774 e #775 permanecem sem alterações.

Validação desta correção: fixture da etapa 4, **15 cenários**, e **6 cenários
direcionados** aprovados; conjunto final, **33 cenários da fixture** e **12 cenários
direcionados**, aprovados. Os 12 incluem duas reproduções EXPECTATIVAS da falha
antiga e demonstram: UPDATE público Asaas/PagBank e legado sem depender da trava;
emissão/reconciliação concorrentes com exatamente dois tickets; bloqueio de
cancelamento gerido após mudança de estado durante a espera; duas confirmações
geridas com emissão integral e ledger único. A suíte TypeScript/Vitest anterior
não foi repetida: não houve alteração de aplicação. git diff --check aprovado.

Harness: executar `tests/database/manual-fee.mjs` e depois
`tests/database/manual-fee-lock-order.mjs`, no mesmo container de teste descartável
identificado por TICKET_TEST_CONTAINER. Não aceita URL de banco do projeto.
SQL/migrations versionados foram carregados SOMENTE na fixture isolada para testes;
nenhuma migration foi aplicada no SmartBus. Não há nova migration ou PR.

O bloqueio identificado foi eliminado. Integração de código aprovada na sequência
#772 → #774 → #775 → #776 → #777 → #778, mantendo publicação intermediária suspensa.
Antes da publicação, permanecem os gates do runbook: conferir banco conectado,
aplicar os arquivos oficiais 0003–0006 e publicar coordenadamente os consumidores.
Testes isolados não comprovam schema/versões implantadas ou homologação financeira.
Nenhum merge de PR, deploy, pagamento, credencial ou flag operacional foi alterado.
PagBank em Produção permanece bloqueado.

## 28. Venda manual — criação e recuperação do PIX sem consulta por referência (2026-10-12)

Base desta correção: `main` em `13a786841e217ef96193285b6a0ff274226fbee0`,
incluindo a elegibilidade de carteiras da PR #779. O responsável informou que
0003–0006 já foram aplicadas manualmente no Lovable Cloud. Esse relato não é uma
verificação direta do schema conectado. **Não reaplicar 0002–0006.** Nenhum desses
arquivos, journal, snapshot, beneficiário, flag ou dado financeiro foi alterado.

**Causa comprovada no código e na documentação:** o adapter manual executava
`GET /orders?reference_id=...` antes do POST. O endpoint oficial por parâmetros
exige `charge_id`; `reference_id` não é um filtro documentado. O HTTP 400 e
`manual_fee_query_failed` da operação `bff984ad-246d-493e-b527-cabacc6cef89`, venda
`72897a70-c44c-4180-b657-124a6d187063`, R$ 6,00, foram informados pelo responsável;
não foram obtidos por novo acesso a logs/banco nesta sessão. Essa sequência
interrompe a criação e o catch comum preserva a operação como `indeterminate`.

**Correção localizada:** após o claim exclusivo já existente, uma operação nova
apta envia somente `POST /orders`, com a referência e `x-idempotency-key` originais
da operação e somente o valor da taxa. ID conhecido usa somente
`GET /orders/{order_id}`; nem clique repetido nem reconciliação cria outra Order.
As validações comuns de ID/referência/valor/ambiente/conta emissora permanecem;
`PAID` exige BRL, e moeda divergente declarada em resposta pendente também falha.
Resposta íntegra sem texto QR conserva ID e estado pendente para recuperar o QR
por GET. Resposta sem prova suficiente de integridade não é persistida como paga.
Os artefatos válidos continuam no componente PIX existente. Sem QR, a tela pede
nova consulta, sem iniciar outra cobrança.

HTTP 400/401/403/422 de criação, sem ID e sem indicação de falha de transporte,
retorna `manual_fee_create_rejected`; timeout/rede, conflito 409, 429, 5xx ou
resposta de sucesso sem dados utilizáveis retornam erro inconclusivo. Essa
distinção orienta o operador, **não autoriza novo POST ou expiração**: o catch
compartilhado mantém conservadoramente `indeterminate`. Nenhuma transição
automática para `prepared`/`terminal`, isenção ou liberação foi adicionada.

### Limite de idempotência e operação antiga

Fontes oficiais consultadas nesta sessão (páginas Markdown disponíveis):

- [Consulta por parâmetros](https://developer.pagbank.com.br/reference/consultar-pedido-parametros):
  somente `charge_id` documentado como parâmetro obrigatório.
- [Consulta por ID](https://developer.pagbank.com.br/reference/consultar-pedido):
  `GET /orders/{order_id}`.
- [Criar pedido](https://developer.pagbank.com.br/reference/criar-pedido):
  `POST /orders`, schema com `reference_id` e `qr_codes`.
- [Chaves de idempotência](https://developer.pagbank.com.br/docs/chaves-publicas-e-de-idempotencia):
  descreve repetição da mesma resposta ao reenviar a mesma chave, mas não informa
  prazo de retenção nem detalha escopo/replay do endpoint Orders. O OpenAPI de
  criação consultado não detalha o header de idempotência.

**NÃO COMPROVADO:** janela segura de replay de Orders para esta operação/conta.
O payload original completo não está persistido; `expiration_date` era calculado
com o horário da chamada. Não presumir que chave + referência + valor bastam para
reconstruir uma tentativa antiga idêntica. Portanto **não há reenvio automático**
de POST nesta correção, nem teste que declare comprovado um replay externo seguro.

A operação informada permanece `indeterminate`, sem ID, reserva preservada e sem
passagens liberadas. Clique, consulta e cron retornam/logam
`manual_fee_order_id_required`, sem GET inválido ou POST. O cron de cinco minutos
continua sendo reconciliação, nunca pagamento automático. `service.ts` e
`runtime.ts` foram revisados e não precisaram de alteração; claim, ledger,
finalização integral e política de expiração são os mesmos para ambos gateways.

**Intervenção mínima necessária:** o responsável deve conciliar, em leitura,
na conta da plataforma Sandbox, a referência original e o histórico de tentativas,
obtendo do PagBank a Order correspondente ou prova de ausência, junto do contrato
de retenção/replay aplicável. Se existir Order, validar ID, referência, R$ 6,00,
BRL e conta/ambiente antes de autorizar seu vínculo auditado à mesma operação.
Essa vinculação administrativa não foi executada nem ganhou endpoint nesta PR.
Se não existir Order, somente evidência conclusiva de ausência/ausência de POST
e autorização específica permitem planejar uma retomada auditada da mesma operação.
Esta PR não fornece reset de estado ou instrução SQL para contornar o bloqueio.
Não criar outra operação, referência ou chave; não confiar em consulta vazia ou
na ausência de ID local; não receber/copiar tokens para investigação.

### Validação e implantação pendente

Testes direcionados, com transporte/banco simulados, cobrem criação exclusiva da
taxa de R$ 6,00; header/chave originais; persistência e apresentação do QR; ausência
temporária de QR com ID recuperável; consultas/repetições; concorrência; operação
antiga sem ID; timeout/5xx/409/resposta ilegível/rejeição; falha de persistência;
integridade e isolamento; PAID recuperado sem POST; contratos Asaas e criação PIX
pública existentes. Não houve pagamento Sandbox/real, execução SQL, migration,
backfill, alteração da operação informada, merge ou deploy.

Resultado local: **101 testes passaram em 7 arquivos**, incluindo regressões
Asaas/checkout público; TypeScript do app, `deno check --cached-only` dos seis
consumidores abaixo e `git diff --check` passaram. Não foi executada suíte SQL,
nem foram consultados secrets, logs privados ou o banco conectado.

**Sem nova migration.** Após revisão/merge autorizado, republicar coordenadamente
os consumidores do adapter incorporado via `manual-fee/runtime.ts`:
`create-platform-fee-checkout`, `verify-payment-status`, `reconcile-sale-payment`,
`cleanup-expired-locks`, `asaas-webhook` e `pagbank-webhook`. Publicar também o app
para as mensagens corrigidas; não mudar flags durante a publicação. Os webhooks
precisam da versão compartilhada, mas sua autenticação não foi alterada.

Próximo teste mínimo, somente com autorização posterior: nova operação manual
Sandbox apta, R$ 6,00, comprovar um único POST/Order e exibição PIX; repetir clique,
fechar navegador, pagar e comprovar consulta backend + taxa confirmada + emissão
integral/ledger sem duplicidade. Para a operação antiga, conciliação precede
qualquer retomada. Mocks não homologam conta emissora, API real, assinatura,
retenção de idempotência ou liquidação. Não repetir OAuth/Connect, trocar
credenciais, investigar GET Split/Charge ou os testes públicos básicos encerrados.
PagBank em Produção permanece bloqueado.

## 29. Diagnóstico de rejeições na taxa manual PagBank (2026-10-13)

Base: `main` em `92125c2ac45ed016680e7b8cb8b635c1e7adecfd`, após merge da #780.
A `main` contém registro de publicação das seis funções; esse registro não foi
tratado como teste financeiro ou inspeção do runtime conectado nesta sessão.

O responsável informou rejeição na operação `534d9db0-fb36-4359-9805-f59a97cfbc4a`,
venda `e2b38d78-17d5-4f00-a4ff-9fb6c7c5c1c1`, Sandbox, R$ 6,00. O HTTP 422 visto
no SmartBus é interno: **não comprova o HTTP original nem a causa da rejeição**.
O cliente já entregava `status` e `data.error_messages`; o adapter descartava
esse contexto ao lançar `manual_fee_create_rejected`. Não corrigir `qr_codes`
ou substituir por `charges` sem evidência do motivo real.

**Melhoria exclusivamente de observabilidade:** o adapter preserva uma observação
sanitizada no erro, e o fluxo comum registra uma única ocorrência em
`sale_integration_logs`, usando `logSaleIntegrationEvent`, com
`event_type=manual_fee_gateway_failure`, `provider=pagbank` e direção de saída.
Registra empresa/venda/operação, gateway/ambiente, etapa `POST /orders` ou
`GET /orders/{id}`, HTTP original, HTTP/código interno, classificação, data/hora
e até cinco códigos/parâmetros/descrições seguras do provedor. Não altera a
resposta simples ao operador, o payload Pix ou as transições financeiras.

Classificações diagnósticas distinguem 401/403 (autorização), rejeição/dado
obrigatório informado pelo provedor, 409, 429/5xx, rede/timeout sem HTTP, resposta
inesperada, integridade e persistência local após resposta externa. São evidências
de HTTP/mensagem, não confirmação de hipótese sobre conta, credencial ou capacidade
Pix. Falha local de persistência conserva o HTTP externo observado (por exemplo,
201), sem apresentar esse HTTP como rejeição do PagBank.

**Sanitização:** não armazena request/response brutos, headers, tokens, clientes,
documentos, telefones, e-mails ou chave de idempotência. Códigos seguem formatos
permitidos e vocabulário técnico; parâmetros seguem allowlist de campos/índices;
valores sensíveis conhecidos são excluídos. Descrições são normalizadas para
frases fixas: texto desconhecido é omitido, pois regex de mascaramento isolada
não protege nomes ou segredos inesperados. Campos desconhecidos são descartados,
há limites de tamanho/quantidade e nenhuma interpolação de texto bruto em log.

O logger existente passa a reconhecer também erros retornados pelo insert do
Supabase, além de exceções; retorna sucesso/falha, sem lançar erro financeiro.
Falha da auditoria gera fallback sanitizado `manual_fee_gateway_failure` nos
logs da função. A mensagem bruta de erro do banco não é logada: somente SQLSTATE
ou código genérico. Demais consumidores continuam ignorando o retorno do logger.

### Consulta autorizada e limites

No app, usar **`/admin/diagnostico-vendas`**, selecionar empresa e Sandbox,
abrir o diagnóstico técnico existente e a aba **Logs recentes**. A ocorrência
exibe HTTP original e JSON sanitizado; não criar outra tela. A rota mantém o
guard existente de **developer em desktop**. Operadores não recebem esses detalhes
na resposta de criação. Queries continuam filtradas por empresa/ambiente, e a
leitura direta da tabela permanece sujeita às RLS já existentes, inclusive a
policy histórica de membros da empresa. Não foi criada promessa de restrição
exclusiva a developers na tabela, nem houve alteração de RLS/permissões.

No Lovable Cloud, o responsável autorizado também pode consultar o registro em
`sale_integration_logs` por venda/empresa/ambiente, ou os logs da Edge Function
quando houver fallback. A estrutura versionada já suporta PagBank e os campos
usados; o schema/RLS efetivamente conectado não foi acessado nem verificado.
Conferir esses acessos na implantação, sem alterar as policies por suposição.

**Sem recuperação retroativa:** a melhoria não inventa HTTP/detalhes perdidos.
As operações `534d9db0-fb36-4359-9805-f59a97cfbc4a` e
`bff984ad-246d-493e-b527-cabacc6cef89` continuam intactas e inconclusivas sem ID.
Retries continuam bloqueados, sem POST adicional; consultas locais sem resposta
do provedor não sobrescrevem a causa original com uma nova ocorrência externa.
Não resetar estados, liberar reservas, alterar chaves ou reprocessar essas vendas.

### Evidências e implantação pendente

**139 testes passaram em 11 arquivos**, incluindo 32 novos cenários de diagnóstico,
logger e autorização; preservação de HTTP, campos, sanitização, respostas inesperadas,
classificações, concorrência/retries existentes, erro de persistência com HTTP 201,
fallback de auditoria, resposta simples ao operador, ownership/role e guard da
tela técnica. Regressões direcionadas de Asaas e criação PIX pública passaram.
TypeScript do app, checagem Deno de oito funções (seis manuais + duas criações
públicas), lint do helper puro e teste do logger, e `git diff --check` passaram.
Todos os transportes/bancos de teste são mocks; nenhum acesso financeiro externo,
pagamento, consulta ao banco conectado, SQL, backfill, deploy ou merge foi feito.

**Sem nova migration; não reaplicar 0002–0006.** Após revisão/merge autorizado,
republicar as seis funções que incorporam o fluxo manual: `create-platform-fee-checkout`,
`verify-payment-status`, `reconcile-sale-payment`, `cleanup-expired-locks`,
`asaas-webhook`, `pagbank-webhook`; publicar o frontend para o detalhe na tela existente.
O retorno adicional do logger não exige mudança de contrato nos demais consumidores.
Não mudar flags, conta, credenciais, beneficiários, cálculo, split, ledger ou emissão.

Próximo passo mínimo: publicar somente após autorização, conferir acesso e
persistência do diagnóstico no ambiente implantado; analisar a resposta sanitizada
de uma próxima tentativa Sandbox explicitamente autorizada antes de propor ajuste
financeiro. Não reproduzir a rejeição nem repetir pagamentos nesta sessão. Não
reabrir OAuth/Connect, PIX/cartão públicos, GET Split/Charge ou assinatura encerrados.
PagBank em Produção permanece bloqueado.

## 30. customer.name na taxa manual — causa específica pendente (2026-10-13)

Base da análise: `main` em `bf85e6967c2a85fed3d6984ec7b47d88751c5217`.
O responsável informou publicação da #781 e um incidente na operação
`256d3750-1d20-423e-9c24-e34eeeafe20c`, venda
`43d67b91-8d28-401b-ac99-a0e71251f2b4`: `POST /orders`, Sandbox, taxa R$ 6,00,
HTTP original 400, código `40002`, parâmetro `customer.name`, com o nome empresarial
`Empresa Padrão (Teste)`. Não houve leitura do banco/logs privados ou reprodução
financeira pelo Codex. O responsável confirmou que não possui a descrição original.

**COMPROVADO pelo relato:** o parâmetro rejeitado. **NÃO COMPROVADO:** a regra
específica violada e a causa raiz. Não atribuir o erro a acentos, parênteses,
limite de tamanho, uso de nome empresarial ou identidade divergente por hipótese.

### Fontes oficiais atuais consultadas

- [Criar pedido](https://developer.pagbank.com.br/reference/criar-pedido), página
  e OpenAPI oficiais consultados nesta sessão, versão indicada `4.1`, documento
  atualizado em 2026-09-01. `customer.name` é string, descrito assim:

  > Nome do cliente, devendo conter nome e sobrenome. Caracteres especiais são
  > permitidos, porém eles serão removidos. Apóstrofo e números são aceitos e não
  > serão removidos.

  O texto não especifica regex/conjunto de caracteres, tratamento exato de
  acentos/parênteses nem limites numéricos (`minLength`/`maxLength`) para esse campo.
  No objeto customer consultado, somente `tax_id` aparece em `required`; a descrição
  do nome não fornece uma regra executável completa para nomes empresariais.
  `tax_id` admite CPF de 11 ou CNPJ de 14 caracteres. Isso não comprova que qualquer
  nome cadastrado represente corretamente o titular do documento de uma operação.
- [Códigos de erro Order](https://developer.pagbank.com.br/reference/codigos-de-erro-order),
  documento atualizado em 2026-08-26: `40002` = `invalid_parameter`, “Valor informado
  no parâmetro é inválido ou não corresponde ao formato esperado”, HTTP 400.
  O código não identifica sozinho qual caractere, tamanho ou condição foi rejeitado.

Essas são leituras de documentação pública, sem chamadas à API financeira. O
texto sobre remoção de caracteres descreve o comportamento do provedor; não prova
que uma remoção arbitrária no cliente corrigiria o incidente nem autoriza mudar
identidade, acrescentar sobrenome fictício ou truncar razão social.

### Código e identidade do pagador

- `manual-fee/decision.ts`, `prepareManualFeeDecision`: congela
  `snapshot.customer.name = company.name`, documento de `document_number` ou `cnpj`
  somente com dígitos, e e-mail da empresa. Não escolhe `legal_name`/`trade_name`.
- `manual-fee/pagbank.ts`: transmite exatamente esse nome congelado. Há validação
  de e-mail, mas não há normalização ou validação específica de `customer.name`.
  A decisão valida o comprimento do documento como CPF/CNPJ, sem demonstrar
  correspondência cadastral entre o documento e o nome do pagador.
- Checkout público, `create-pagbank-payment`: usa o comprador da venda,
  `String(sale.customer_name ?? "Cliente").slice(0, 60)`, sem remover acentos ou
  parênteses. O limite 60 é uma implementação existente, **não um limite oficial
  demonstrado nesta investigação**; não copiá-lo para a taxa manual como prova.
- Asaas manual: cria/reutiliza customer pelo documento e usa o mesmo nome
  congelado. Não impor a ele restrições presumidas do PagBank.

A empresa é a pagadora da taxa no fluxo aprovado. Uma identidade empresarial
pode ser coerente com CNPJ, mas é necessário confirmar nome/razão social e tipo
CPF/CNPJ do titular real por procedimento autorizado. O tipo do documento desta
operação não foi fornecido nem consultado; não inferir inconsistência. Se houver
CPF, confirmar a identidade real do pagador antes de propor qualquer mudança.
Não trocar para proprietário, operador ou passageiro apenas para passar na API.
O campo `legal_name` existente não deve substituir automaticamente um snapshot
congelado ou um nome verdadeiro sem evidência e decisão sobre esse vínculo.

### Resultado e próximo passo mínimo

**Nenhuma transformação ou correção funcional implementada.** A Draft desta
sessão contém somente checkpoint/runbook. Não foram inventados validadores,
limites, regex, nomes substitutos ou testes de aceitação que presumam essas regras.
Caracterização do código não provaria que o PagBank aceita a string: a pendência
é do contrato/regra externa. Nenhum teste financeiro real ou Sandbox foi executado.

Alternativa mais segura: o responsável deve solicitar ao suporte PagBank a regra
exata violada em `customer.name`, usando o horário e a referência originais da
requisição rejeitada na conta emissora Sandbox. Pedir confirmação de caracteres,
comprimento e tratamento de nome empresarial para CPF/CNPJ. Transcrever somente
regra/motivo sem segredos ou dados pessoais; não enviar tokens ou payload bruto
por canais de diagnóstico do SmartBus. Conferir a identidade cadastral em paralelo.
Não repetir POST para descobrir por tentativa e erro, nem reprocessar a operação.

Se a descrição original ainda estiver disponível em um registro autorizado,
analisá-la sem persistir/expor o conteúdo bruto. Ela não está no diagnóstico
sanitizado existente: não afirmar recuperação retroativa. Somente após a regra
confirmada preparar a menor validação/normalização permitida, antes da criação
externa, preservando o cadastro e a identidade. Os testes futuros deverão cobrir
acentos/parênteses, apóstrofos/números, vazios/tipos e limites então comprovados,
payload exato, preservação do original, validação prévia, ausência de retries e
regressões Asaas/checkout público. Mocks não homologam aceitação real.

Operações `bff984ad-246d-493e-b527-cabacc6cef89`,
`534d9db0-fb36-4359-9805-f59a97cfbc4a` e
`256d3750-1d20-423e-9c24-e34eeeafe20c` permanecem intactas, inconclusivas sem ID.
Nenhum estado, referência, chave, snapshot, reserva ou passagem foi alterado.
A observabilidade da #781 e as regras financeiras permanecem integralmente iguais.

Validação desta entrega documental: `git diff --check` e conferência de ausência
de mudanças em código/migrations. Não foram repetidas suítes de regressão sem
mudança funcional. **Sem migration e sem Edge Function a republicar por esta PR.**
Não reaplicar 0002–0006. Sem SQL, backfill, merge, deploy, alteração de cadastro,
credencial, flag, beneficiário, payload Pix, webhook ou regra comercial.

A próxima venda manual não é declarada pronta para homologar uma correção deste
incidente: a regra ainda precisa ser esclarecida. Não habilitar fluxo ou pagamentos
por este documento. PagBank em Produção permanece bloqueado.

## 31. Comprovante manual acompanha confirmação e emissão (2026-10-13)

Base: `main` em `09a6fcbafa3d2c10738a6592f6a6bbd23722c9ea`. O responsável relatou
novo teste manual PagBank Sandbox na venda `b4203646-a1c9-453d-85eb-d0ea4f255d97`:
taxa R$ 6,00, operação `confirmed`, externo `PAID`, venda `pago` e dois registros
em tickets. O comprovante continuou reservado mesmo após o toast de confirmação.
Esse relato não é uma conferência individual dos tickets ou de liquidação; o
Codex não acessou o banco nem reproduziu pagamento. Não atribuir esse resultado
à Draft documental #782 como se tivesse implementado correção de customer.name.

**Causa comprovada no frontend:** `NewSaleModal` guardava `confirmationData` e
`createdSaleSummary` da criação; o construtor local fixava a apresentação reservada,
e o rodapé permanecia estático. `ManualFeePixDialog` consultava o backend e mostrava
o toast, mas o callback em Sales recarregava somente a listagem, sem atualizar o
comprovante aberto. O diálogo reaberto por Sales também guardava uma cópia antiga
da venda e dos tickets. Não era evidência de nova falha da confirmação financeira.

**Correção somente frontend:** a apresentação da etapa final foi extraída para
`ManualSaleReceiptContent`, preservando os componentes/estilo atuais. Um único
hook `useManualSaleReceipt` é usado tanto por esse conteúdo quanto pelo diálogo
manual de Sales. Lê a venda, tickets e somente `state`/`snapshot.items` da operação
privada, filtrados por empresa/venda e protegidos pelas RLS existentes. Não lê
credenciais, cliente pagador, alocações ou ledger. O ambiente é o persistido na venda;
não cria branch por gateway nem decide o financeiro por hostname/notificação.

A confirmação PIX existente emite apenas uma dica de recarga, por sale ID. Essa
dica não marca pago: o comprovante relê os registros oficiais. Para Asaas/checkout
externo e futuros gateways, a mesma leitura observa o resultado dos webhooks e da
recuperação backend existente, inclusive ao voltar de outra aba. Não há nova
consulta automática ao gateway ou POST financeiro por esse acompanhamento.

Estados visuais:

- Taxa pendente: reserva, sem QR operacional e com ação de pagamento quando
  elegível. Antes da ação, relê o estado; clique repetido é coalescido e usa o
  `startPlatformFeeCheckout` existente, com as proteções backend intactas.
- Taxa confirmada/isenta, emissão ainda não integral: “Pagamento confirmado.
  Estamos finalizando suas passagens.” Sem solicitar novo pagamento ou apresentar
  QR operacional/PDF de passagem liberada; comprovante de reserva permanece disponível.
- Conclusão: exige confirmação oficial e venda `pago`, tickets completos com IDs
  e QR únicos. Para emissão com identidade, confere contagem esperada e IDs dos
  itens; quando há operação gerida, confronta também o manifesto imutável por
  item/trecho/assento. Contagem igual, sozinha, não basta. Snapshots geridos ausentes
  ou divergentes não liberam o comprovante. Legados sem operação preservam o
  contrato histórico de venda paga/tickets, sem inventar manifesto retroativo.

Após conclusão, a janela permanece aberta, o título/status/rodapé se atualizam,
a ação de pagamento desaparece e os cards recebem IDs, números, QR, dados de
passageiro e horário de confirmação persistidos. Reutiliza PassengerTicketList,
TicketCard e exportador PDF existentes. A indicação de conclusão é discreta, sem
toasts novos repetitivos ou recarga da página; a janela fecha só por ação do usuário.

Leitura a cada 10 segundos enquanto o comprovante estiver ativo, até 30 atualizações
automáticas; pausa em aba oculta e para em concluído/encerrado. Requisições
simultâneas do mesmo comprovante são coalescidas, com abort/timeout de 15 segundos.
Há botão “Consultar novamente” para retomar explicitamente. Falha temporária
preserva o último snapshot e confirmação conhecida, sem voltar a pedir pagamento;
respostas de contexto anterior são ignoradas. Trocar empresa não exibe dados de
outro contexto. Fechar desliga o acompanhamento; reabrir consulta o estado atual.
O backend continua sua recuperação independente de janela/navegador.

**Validação:** 107 testes passaram em 9 arquivos, com 49 novos cenários de dados,
hook, comprovante e confirmação PIX. Cobrem pendente → confirmada/emissão → concluída,
um ticket existente de dois esperados, igual contagem com item/trecho/assento
errado, QR duplicado/ausente, ida/volta/itens legítimos sem assento, isolamento,
evento sem prova de pagamento, falha/timeout, concorrência, pausa/fechamento/reabertura,
retirada da ação de pagamento, prevenção de clique duplicado e dados definitivos
na chamada real do TicketCard ao exportador PDF mockado. Regressões direcionadas
Asaas, criação PIX pública e fluxo comum passaram. TypeScript do app, lint dos
três módulos novos de produção e `git diff --check` aprovados. Build Vite aprovado,
com saída em `/tmp`, sem executar o gerador de versão ou publicar artefatos.

**Sem nova migration; não reaplicar 0002–0006. Nenhuma Edge Function a republicar.**
Após revisão/merge autorizado, basta publicar o frontend pelo fluxo habitual do
Lovable. Não há modificação em banco, RPC, backend, webhook, credenciais, flags,
cálculo/divisão, ledger ou regras de emissão. Nenhum SQL, backfill, pagamento,
venda externa, merge ou deploy foi executado nesta tarefa.

Pendente após publicação autorizada: validar no navegador conectado a leitura
com as RLS reais, atualização sem fechar o comprovante, PDF e reabertura; conferir
individualmente os itens da venda relatada pelo procedimento autorizado. Os testes
com mocks não homologam o registro real, assinatura ou liquidação. A pendência do
capítulo 30 permanece como histórico sem causa específica comprovada. PagBank em
Produção permanece bloqueado.
