# Configuracao do Webhook Stripe + Polling na Confirmacao

## Situacao Atual

O pagamento Stripe funciona corretamente (dinheiro entra, split de 7,5% aplicado). Porem a tela de confirmacao fica presa em "Aguardando Confirmacao" porque:

1. O webhook Stripe nao esta configurado no painel Stripe, entao o Stripe nao avisa o sistema quando o pagamento e confirmado
2. A tela de confirmacao carrega os dados uma unica vez e nao atualiza automaticamente

## Parte 1: Configurar o Webhook no Stripe (acao manual do usuario)

Voce precisa configurar o webhook no painel do Stripe para que ele envie notificacoes ao sistema.

### Passo a passo:

1. Acesse o Stripe Dashboard ([https://dashboard.stripe.com](https://dashboard.stripe.com))
2. Va em **Developers > Webhooks**
3. Clique em **Add endpoint**
4. Configure:
  - **URL do endpoint**: `https://cdrcyjrvurrphnceromd.supabase.co/functions/v1/stripe-webhook`
  - **Eventos para escutar**: selecione `checkout.session.completed`
5. Apos criar, copie o **Signing Secret** (comeca com `whsec_...`)
6. Volte ao Lovable e me informe o signing secret para eu configurar como variavel de ambiente (`STRIPE_WEBHOOK_SECRET`)

### Importante sobre modo de teste:

- Certifique-se de estar no **modo teste** do Stripe ao criar o webhook
- Use a URL exata acima — e o endereco publico da funcao de backend

## Parte 2: Polling automatico na tela de Confirmacao (alteracao de codigo)

Mesmo com o webhook configurado, pode haver um atraso de alguns segundos entre o pagamento e a chegada do webhook. Para que o usuario nao fique preso na tela "Aguardando Confirmacao", a pagina deve consultar automaticamente o status da venda a cada poucos segundos ate confirmar.

### Alteracoes no arquivo `src/pages/public/Confirmation.tsx`:

- Quando a URL contem `?payment=success` e o status da venda ainda e `reservado`, ativar um **polling** que consulta o banco a cada 3 segundos
- Quando o status mudar para `pago`, parar o polling e atualizar a interface automaticamente
- Limite maximo de tentativas (ex: 60 tentativas = ~3 minutos) para nao ficar consultando infinitamente
- Exibir um indicador visual de que o sistema esta verificando o pagamento

### Logica do polling:

```text
Se (paymentSuccess == true E sale.status != 'pago'):
  A cada 3 segundos:
    Consultar sale.status no banco
    Se status == 'pago':
      Atualizar estado local -> exibir "Pagamento Confirmado!"
      Parar polling
    Se tentativas > 60:
      Parar polling
      Exibir mensagem: "Pagamento sendo processado, atualize a pagina em alguns minutos"
```

## Resumo dos Arquivos


| Arquivo                             | Acao      | Descricao                                            |
| ----------------------------------- | --------- | ---------------------------------------------------- |
| `src/pages/public/Confirmation.tsx` | Editar    | Adicionar polling automatico do status da venda      |
| Secret `STRIPE_WEBHOOK_SECRET`      | Adicionar | Sera solicitado ao usuario apos configurar o webhook |


## Ordem de Execucao

1. Implementar o polling na tela de Confirmacao (assim ja melhora a UX imediatamente)
2. Solicitar ao usuario que configure o webhook no Stripe e forneça o signing secret
3. Adicionar o secret `STRIPE_WEBHOOK_SECRET` no projeto  
  
  
Ja tenho o `STRIPE_WEBHOOK_SECRET (whsec_23G0scYBDRiN8UsaQUwZKykHpq9S4Xsn)`  
