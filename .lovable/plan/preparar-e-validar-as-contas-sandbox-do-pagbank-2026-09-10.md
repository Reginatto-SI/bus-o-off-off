# Preparar e validar as contas Sandbox do PagBank

Objetivo: guardar com segurança as duas identidades de teste, validar o que a API oficial do PagBank realmente permite validar e mostrar isso em Empresa > Pagamentos. Nenhuma cobrança será criada nesta etapa.

## Avaliação do pedido (leitura honesta)

Boa parte da estrutura pedida já existe e está correta. Faz sentido avançar, mas com duas ressalvas:

1. **O token da empresa vendedora não deve virar um segredo global.** O sistema já tem, em Empresa > Pagamentos, um campo seguro que envia o token direto ao servidor, valida no PagBank e guarda criptografado ligado à empresa. Um segredo global quebraria o modelo multiempresa e teria que ser desfeito depois. Confirmado com você: usaremos o campo existente.
2. **A conta SmartBus não precisa de token nesta fase.** Nada no fluxo atual usa um token da plataforma: na divisão, a plataforma aparece apenas como recebedora, identificada pelo ID `ACCO_...`. Guardar um token sem uso só aumentaria exposição. Guardaremos apenas o identificador.

Também é preciso dizer com clareza: a API oficial do PagBank **não** oferece uma consulta que comprove PIX, cartão ou divisão habilitados numa conta. O que dá para provar sem cobrar é que o token é aceito no Sandbox. Todo o resto será marcado como `NÃO COMPROVADO` até a primeira cobrança real de teste — e a tela vai dizer isso com essas palavras, em vez de sugerir uma aprovação que não existe.

## Decisões já tomadas

- Empresa vendedora do teste: **BUSÃO OFF OFF**. A empresa está em Produção com Asaas e **continua assim**: cadastrar a conta de testes não muda o gateway nem o ambiente dela, e o cadastro é gravado exclusivamente como Sandbox.
- Conta da plataforma: apenas o identificador `ACCO_...` da conta `comercial@smartbus.com.br`.
- Nada de Produção é tocado. Asaas permanece intacto.

## O que será feito

### 1. Guardar o identificador da conta SmartBus
Pedirei o `ACCO_...` da conta da plataforma pelo formulário seguro de segredos, com o nome que o sistema já espera para o Sandbox. Valor nunca aparece em código, tela, log ou resposta.

### 2. Impedir a troca das duas identidades
Ao salvar a conta da empresa vendedora, o servidor recusa se o identificador informado for igual ao da plataforma, com mensagem clara. Hoje isso não é verificado e uma inversão passaria despercebida.

### 3. Validação honesta e repetível
- Nova ação "Validar novamente" no cartão: refaz a prova de autenticação no Sandbox e atualiza a data da última validação, sem criar cobrança.
- A resposta passa a registrar o que foi provado e o que não foi, sem inventar capacidade.

### 4. Painel de diagnóstico na tela existente
Dentro do cartão atual de Empresa > Pagamentos (sem criar área nova), uma lista curta:

- Conta conectada (identificador parcial) e função: empresa vendedora
- Conta da plataforma configurada: sim/não
- Ambiente: Sandbox
- Token aceito pelo PagBank: sim + data
- Pedidos (Order), PIX, cartão, divisão/marketplace: `NÃO COMPROVADO` — só após a primeira cobrança de teste

### 5. Banco de dados
Nenhuma migration. As colunas necessárias já existem.

### 6. Documentação
Atualizar o checkpoint e o runbook Sandbox com o que ficou provado, o que não ficou e qual é o próximo teste.

## Detalhes técnicos

- `supabase/functions/pagbank-connection/index.ts`: em `save_sandbox_token`, recusar `account_id` igual a `PAGBANK_MARKETPLACE_ACCOUNT_ID_SANDBOX` (`pagbank_account_identity_conflict`); nova ação `validate` reexecutando `probePagbankAuth` e atualizando `last_validated_at`/`last_error`; `status` passa a devolver `marketplace_configured` e um bloco `capabilities` com `auth_verified_at` e `order|pix|card|split: "unproven"`.
- `src/components/admin/PagbankConnectionCard.tsx`: renderizar o bloco de capacidades e o botão "Validar novamente", mantendo o padrão visual do cartão.
- Secret novo: `PAGBANK_MARKETPLACE_ACCOUNT_ID_SANDBOX` (somente o `ACCO_...`, não é token).
- Sem alteração em `create-pagbank-payment`, `pagbank-webhook`, split, taxa, Asaas ou vendas.
- Ao final: `bunx tsgo -p tsconfig.app.json --noEmit` e `bun run test`.

## Fora desta etapa

Cobrança PIX, QR Code, cartão, split real, refund, chargeback, venda de teste, qualquer uso de Produção.

## Próximo teste depois desta etapa

Primeira cobrança PIX Sandbox de valor baixo pela empresa BUSÃO OFF OFF em sessão de preview (ambiente efetivo Sandbox), com divisão para a plataforma, confirmando QR, webhook e conciliação da divisão — é ela que transforma PIX e divisão de `NÃO COMPROVADO` em comprovado.
