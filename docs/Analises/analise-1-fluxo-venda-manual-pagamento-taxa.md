# Análise 1 — Fluxo de venda manual + pagamento da taxa em `/admin/vendas`

## Escopo analisado
Esta análise cobre apenas a tela `/admin/vendas`, com foco no fluxo de **Nova Venda** na aba **Venda Manual** e no encadeamento com a ação já existente de **Pagar Taxa**.

---

## 1. Diagnóstico do fluxo atual

### 1.1 Onde a venda manual termina hoje
O fluxo de venda manual é finalizado dentro de `src/components/admin/NewSaleModal.tsx`, no `handleConfirm`.

Resumo do que acontece hoje:
1. o modal valida assentos e passageiros;
2. calcula valor bruto e taxa da plataforma;
3. insere a venda em `sales` com:
   - `status = 'reservado'`;
   - `sale_origin = 'admin_manual'`;
   - `platform_fee_status = 'pending'` quando existir taxa;
   - `reservation_expires_at` para validade operacional da reserva;
4. insere os tickets;
5. grava `sale_logs`;
6. mostra toast de sucesso;
7. busca novamente os tickets;
8. troca o wizard para `step === 4`, exibindo o **Comprovante de Reserva**;
9. no rodapé final, o único CTA disponível é **Fechar**.

Ou seja: o fluxo não segue para nenhuma próxima ação operacional após a criação da reserva. Ele apenas mostra o comprovante e encerra pelo botão `Fechar` (que chama `onSuccess`, fecha o modal e recarrega a listagem). 

### 1.2 Em que momento a venda recebe status `reservado`
A venda nasce como `reservado` no próprio `insert` em `sales`, dentro de `handleConfirm`. Isso é explícito no payload enviado ao Supabase para o fluxo manual. Não existe etapa posterior transformando manualmente para `reservado`; esse é o status inicial oficial da venda administrativa.

### 1.3 Como a taxa da plataforma é calculada
Ainda em `handleConfirm`, a taxa é calculada localmente a partir de:
- `grossTotal` da venda manual;
- `company.platform_fee_percent`.

A lógica atual é:
- se for venda manual;
- se `platform_fee_percent > 0`;
- e se `grossTotal > 0`;

então `platform_fee_amount = grossTotal * percentual`, arredondado para 2 casas, e `platform_fee_status = 'pending'`.

Se não houver taxa aplicável, o status fica `not_applicable`.

### 1.4 Onde o fluxo do pagamento da taxa começa hoje
Hoje o pagamento da taxa começa exclusivamente na tela `src/pages/admin/Sales.tsx`, por meio do handler `handlePayPlatformFee`.

Esse handler é acionado em dois pontos já existentes:
1. no menu de ações `...` da listagem, quando a venda está com taxa pendente/falha;
2. no modal de detalhes da venda, no bloco “Taxa da Plataforma”.

### 1.5 Como a ação **Pagar Taxa** funciona hoje
O handler `handlePayPlatformFee`:
1. chama a edge function `create-platform-fee-checkout` com `sale_id`;
2. a edge function valida que a venda existe e que `platform_fee_status === 'pending'`;
3. valida o valor da taxa;
4. resolve o `payment_environment` persistido na venda;
5. cria/recupera o customer no Asaas;
6. cria uma cobrança com `externalReference = platform_fee_<sale_id>`;
7. grava `platform_fee_payment_id` em `sales`;
8. registra log `platform_fee_checkout_created`;
9. devolve `invoiceUrl`;
10. o frontend abre a URL em nova aba com `window.open(data.url, '_blank')`.

### 1.6 Como a venda muda de `reservado` para `pago`
A mudança não é feita pelo modal de venda manual nem pelo botão do frontend.

A fonte de verdade continua sendo o fluxo financeiro assíncrono:
- no Asaas webhook, quando a cobrança da taxa é confirmada, a venda é atualizada para:
  - `platform_fee_status = 'paid'`;
  - `platform_fee_paid_at = confirmedAt`;
  - `status = 'pago'` se a venda ainda estiver `reservado`;
  - `payment_confirmed_at = confirmedAt`.

Esse desenho preserva a regra do projeto de que webhook/pagamento são a fonte de verdade no fluxo financeiro.

### 1.7 Por que o fluxo atual ficou desconectado
A desconexão acontece porque:
- `NewSaleModal` é responsável por **criar a reserva e mostrar o comprovante**;
- `Sales.tsx` é responsável por **acionar o checkout da taxa**;
- não existe hoje uma ponte explícita entre o `saleId` recém-criado no modal e o handler reutilizável de pagamento;
- o `step 4` do modal termina com um rodapé minimalista contendo apenas **Fechar**.

Na prática, o sistema já possui os dois fluxos completos, mas em componentes diferentes e sem encadeamento direto entre eles.

---

## 2. Mapeamento técnico objetivo

### 2.1 Arquivo/componente que cria a venda manual
- `src/components/admin/NewSaleModal.tsx`
- Função principal: `handleConfirm`

### 2.2 Arquivo/componente que dispara o pagamento da taxa
- `src/pages/admin/Sales.tsx`
- Função principal: `handlePayPlatformFee`

### 2.3 Função backend reutilizável já existente
- `supabase/functions/create-platform-fee-checkout/index.ts`

Essa function já encapsula a regra real de criação da cobrança, então ela é o melhor ponto de reaproveitamento. Não faz sentido duplicar essa lógica no modal.

### 2.4 Regra de proteção já existente
Há trigger no banco impedindo transição para `status = 'pago'` quando a taxa não estiver devidamente confirmada. Isso reduz o risco de o frontend promover a venda antes da confirmação financeira.

---

## 3. Viabilidade de encadear o pagamento

## Classificação
**Viável com baixo risco**, desde que o ajuste seja feito como extensão do fluxo final existente e reutilize o mesmo handler/backend já usado por **Pagar Taxa**.

### 3.1 O que torna viável
É viável porque:
- o `saleId` já fica disponível dentro do `handleConfirm` logo após o insert;
- o modal já possui um `step 4` de pós-criação, que é o lugar natural para encaixar o CTA sem inventar nova tela;
- o pagamento da taxa já existe e está isolado numa edge function reaproveitável;
- o status da venda continua nascendo como `reservado`, sem alterar regra de negócio;
- a promoção para `pago` continua dependendo do webhook, preservando a fonte de verdade.

### 3.2 O que precisa ser observado
Hoje `handlePayPlatformFee` está local em `Sales.tsx`. Para evitar duplicação, o ideal é extrair a chamada de pagamento para uma função compartilhada simples, por exemplo um utilitário/hook usado tanto pela listagem quanto pelo fluxo final do modal. Isso é um ajuste pequeno, não uma nova arquitetura.

### 3.3 Formas tecnicamente possíveis sem duplicar lógica
Após a criação bem-sucedida da reserva, é tecnicamente possível:
- abrir imediatamente o checkout da taxa;
- mostrar um CTA direto no comprovante final;
- adicionar botão primário/secundário no rodapé final;
- reaproveitar a mesma edge function `create-platform-fee-checkout`.

Tudo isso é possível sem mexer na regra de cálculo, sem alterar status de negócio e sem criar fluxo paralelo.

---

## 4. Avaliação das opções de UX

### Opção A — após criar a reserva, mostrar:
- **Pagar taxa agora**
- **Fechar e pagar depois**

#### Pontos fortes
- encaixa exatamente no `step 4` já existente;
- usa um momento em que a venda já foi criada com `saleId` válido;
- não muda a semântica do botão de confirmação da etapa anterior;
- reduz atrito sem “surpreender” o usuário com redirecionamento automático;
- mantém o comprovante visível antes da próxima ação;
- é a menor alteração de UX e de código.

#### Pontos fracos
- exige guardar referência da venda recém-criada no modal para chamar o pagamento;
- se o checkout abrir em nova aba, o usuário ainda fica no modal atual e pode não perceber automaticamente a atualização do status até refresh/webhook.

#### Avaliação
É a alternativa mais coerente com o desenho atual do código.

---

### Opção B — na etapa final da venda manual, substituir por dois CTAs:
- **Confirmar reserva**
- **Confirmar e pagar taxa**

#### Pontos fortes
- reduz um clique após a confirmação.

#### Pontos fracos
- a venda ainda não existe antes da confirmação; então “Confirmar e pagar taxa” na prática teria de:
  1. criar a venda;
  2. aguardar sucesso;
  3. iniciar o checkout da taxa.
- isso mistura duas intenções diferentes no mesmo submit;
- aumenta o risco de tratamento de erro confuso: a reserva pode ser criada e a abertura do checkout falhar, deixando a percepção de falha parcial;
- altera mais a semântica do passo 3 do wizard.

#### Avaliação
É viável, mas com risco maior e com UX menos previsível para suporte. Não parece a melhor escolha para ajuste mínimo.

---

### Opção C — ao concluir a reserva, abrir automaticamente a próxima etapa de pagamento

#### Pontos fortes
- é o caminho mais direto do ponto de vista operacional.

#### Pontos fracos
- pode gerar comportamento percebido como “automático demais” ou invasivo;
- depende de `window.open`/nova aba logo após uma sequência assíncrona, o que pode ser mais sensível a bloqueio de popup dependendo do navegador;
- tira do usuário a decisão explícita entre encerrar só a reserva ou já pagar;
- se houver falha na criação do checkout, o usuário termina no comprovante sem ter escolhido esse encadeamento.

#### Avaliação
É tecnicamente possível, mas menos consistente com o padrão atual da tela e menos previsível em UX.

---

## 5. Melhor solução recomendada

## Recomendação principal
**Opção A**: após criar a reserva e exibir o comprovante final, mostrar dois CTAs:
- **Pagar taxa agora**
- **Fechar e pagar depois**

### Justificativa objetiva
Essa opção é a melhor porque:
- reaproveita o ponto exato onde o fluxo hoje já termina (`step 4`);
- não altera a lógica de criação da venda;
- não altera o significado de `reservado` ou `pago`;
- não depende de nova tela;
- mantém a decisão explícita do usuário;
- é a menor intervenção possível no fluxo existente;
- facilita suporte e auditoria, porque a venda já foi criada antes de qualquer tentativa de checkout da taxa;
- permite reaproveitar integralmente a lógica do backend já funcional.

### Como ela entraria no fluxo real
Fluxo proposto mínimo:
1. usuário conclui a venda manual;
2. sistema cria a venda como `reservado` com `platform_fee_status = pending` quando aplicável;
3. modal mostra o **Comprovante de Reserva**;
4. no rodapé, se a venda tiver taxa pendente e o perfil tiver permissão, mostrar:
   - botão primário **Pagar taxa agora**;
   - botão secundário **Fechar e pagar depois**;
5. o botão **Pagar taxa agora** chama a mesma rotina de `handlePayPlatformFee` / `create-platform-fee-checkout`;
6. a venda só muda para `pago` por webhook, como já acontece hoje.

---

## 6. Escopo mínimo de implementação

### Arquivos que realmente precisariam ser alterados
1. `src/components/admin/NewSaleModal.tsx`
   - guardar os dados mínimos da venda recém-criada no estado final do modal;
   - exibir CTA de pagamento no `step 4` apenas quando houver `platform_fee_status` pendente/falha e permissão compatível;
   - evitar fechar automaticamente o fluxo antes da escolha do usuário.

2. `src/pages/admin/Sales.tsx`
   - extrair ou compartilhar a lógica hoje existente em `handlePayPlatformFee`, para não duplicar chamada/feedback.

3. Opcionalmente um utilitário/hook compartilhado pequeno, caso o projeto prefira reaproveitamento explícito:
   - exemplo conceitual: função utilitária para iniciar checkout da taxa.
   - só é necessário se a equipe quiser eliminar duplicação entre a listagem e o modal.

4. `supabase/functions/create-platform-fee-checkout/index.ts`
   - **não precisa mudar**, salvo se durante implementação surgir necessidade de resposta adicional. Pela análise atual, o backend já atende ao fluxo.

### O que não precisa ser alterado
- regra de cálculo da taxa;
- webhook Asaas/Stripe;
- trigger do banco;
- listagem principal de vendas;
- status oficiais da venda.

---

## 7. Riscos e cuidados

### 7.1 Duplicidade de cobrança
Risco:
- o usuário clicar repetidamente em **Pagar taxa agora** ou abrir checkout mais de uma vez.

Cuidados:
- desabilitar o botão enquanto a criação do checkout estiver em andamento;
- reaproveitar estado de loading semelhante ao `payingFee` já existente;
- se possível, refrescar a venda ao retornar/atualizar para refletir eventual `platform_fee_payment_id` e mudanças de status.

### 7.2 Fechamento prematuro do modal
Risco:
- o modal ser fechado via `onSuccess` antes do usuário tomar a decisão de pagar agora.

Cuidados:
- no `step 4`, manter o modal aberto até ação explícita do usuário;
- somente `Fechar e pagar depois` deve encerrar o fluxo.

### 7.3 Quebra do estado da venda recém-criada
Risco:
- o modal exibe comprovante, mas não guarda o objeto mínimo necessário para disparar o pagamento da taxa.

Cuidados:
- persistir em state pelo menos `saleId`, `platform_fee_amount`, `platform_fee_status` e talvez `status` da venda recém-criada.

### 7.4 Inconsistência entre UI e status
Risco:
- o usuário pagar a taxa em nova aba, mas o modal continuar mostrando reserva sem atualização imediata.

Cuidados:
- deixar claro no feedback que a confirmação depende do processamento financeiro/webhook;
- manter texto informando que a venda será atualizada após confirmação;
- ao fechar o modal, recarregar a listagem como já ocorre hoje.

### 7.5 Reabertura inadequada de fluxo já existente
Risco:
- duplicar no modal uma lógica diferente da usada no menu `...`.

Cuidados:
- não reimplementar a criação de cobrança;
- chamar o mesmo fluxo já usado por `Pagar Taxa`.

### 7.6 Permissão/perfil
Risco:
- o modal expor CTA para perfis que hoje não têm autorização equivalente.

Cuidados:
- manter a mesma regra hoje usada em `Sales.tsx` (`isGerente` no estado atual do código) para exibir o CTA.

### 7.7 Caso de taxa dispensada (`waived`)
Risco:
- assumir que taxa dispensada significa venda paga.

Cuidados:
- manter o comportamento atual: `waived` não promove automaticamente para `pago`;
- o CTA deve aparecer apenas quando fizer sentido (`pending` ou `failed`).

---

## 8. Conclusão objetiva

### Diagnóstico resumido
- a venda manual termina hoje no comprovante de reserva do `NewSaleModal`;
- o pagamento da taxa começa hoje em `Sales.tsx`, via ação de listagem/detalhe;
- a desconexão existe porque criação da reserva e pagamento da taxa vivem em pontos diferentes da tela, sem ponte direta entre eles.

### Avaliação final de viabilidade
**Viável com baixo risco.**

### Melhor abordagem recomendada
**Opção A** — manter o fluxo atual até o comprovante final e adicionar os CTAs:
- **Pagar taxa agora**
- **Fechar e pagar depois**

Essa é a solução mais consistente, previsível e aderente ao padrão atual do sistema.

---

## 9. Próximo passo recomendado

### Recomendação prática
**Dividir em 2 steps.**

#### Step 1 — ajuste pequeno de UX + reaproveitamento do handler
- extrair/compartilhar a rotina de pagamento da taxa;
- adicionar o CTA no rodapé do `step 4` do `NewSaleModal`;
- manter o restante do fluxo intacto.

#### Step 2 — validação operacional
- validar comportamento com webhook/atualização de status;
- confirmar mensagens, loading e prevenção de múltiplos cliques.

### Motivo para dividir em 2 steps
A implementação em si é pequena, mas há uma dependência operacional importante: o checkout abre externamente e a confirmação real acontece por webhook. Separar a entrega entre **encadeamento de UX** e **validação operacional do pós-pagamento** reduz risco de regressão e facilita homologação.

---

## 10. Decisão recomendada
Se a equipe quiser seguir com o menor ajuste seguro e coerente com o código atual, a decisão recomendada é:

**Implementar a Opção A em dois passos curtos, reaproveitando integralmente o fluxo já existente de `Pagar Taxa`, sem alterar regra de negócio nem criar fluxo paralelo.**
