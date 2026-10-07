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
