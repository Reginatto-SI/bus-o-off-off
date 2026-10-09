# 00 — LEIA PRIMEIRO — PagBank Sandbox: estado real, o que já foi testado e o que NÃO repetir

> **Documento operacional prioritário do PagBank enquanto o fluxo básico Sandbox não estiver fechado.**
>
> Antes de criar novos diagnósticos, trocar credenciais, mexer em webhook, refatorar integração ou investigar endpoints adicionais, leia este arquivo.
>
> **Objetivo atual é simples:** fazer **PIX e cartão de crédito funcionarem em Sandbox com Split**, ponta a ponta, antes de buscar uma integração "perfeita".

Atualizado em: **2026-10-07**

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
