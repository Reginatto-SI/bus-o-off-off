# Fontes oficiais PagBank

Verificação inicial: 2026-09-02.

Use somente documentação oficial atual do PagBank para decisões técnicas. Páginas de comunidade podem revelar divergências, mas não comprovam contrato de API.

## Entrada e requisitos

- [Introdução às APIs PagBank](https://developer.pagbank.com.br/docs/apis-pagbank)
- [Primeiros passos](https://developer.pagbank.com.br/docs/primeiros-passos)
- [Chaves públicas e de idempotência](https://developer.pagbank.com.br/docs/chaves-publicas-e-de-idempotencia)
- [Criar conta, Sandbox e Produção](https://developer.pagbank.com.br/docs/crie-sua-conta-pagbank)
- [Solicitar homologação](https://developer.pagbank.com.br/docs/solicitar-homologacao)

## Connect

- [Connect](https://developer.pagbank.com.br/docs/connect)
- [Connect Authorization](https://developer.pagbank.com.br/docs/connect-authorization)
- [Solicitar autorização via Connect Authorization](https://developer.pagbank.com.br/reference/solicitar-autorizacao-via-connect-authorization)
- [Obter access token](https://developer.pagbank.com.br/reference/obter-access-token)
- [Renovar access token](https://developer.pagbank.com.br/reference/renovar-access-token)
- [Revogar access token](https://developer.pagbank.com.br/reference/revogar-access-token)
- [Códigos de erro do Connect](https://developer.pagbank.com.br/reference/codigos-de-erro-connect)

## Order, PIX e cartão

- [Pedidos e pagamentos](https://developer.pagbank.com.br/docs/pedidos-e-pagamentos-order)
- [Serviços de pedidos e pagamentos](https://developer.pagbank.com.br/docs/servicos-de-pedidos-e-pagamentos)
- [Casos de uso](https://developer.pagbank.com.br/reference/casos-de-uso)
- [Criar pedido](https://developer.pagbank.com.br/reference/criar-pedido)
- [Objeto Order](https://developer.pagbank.com.br/reference/objeto-order)
- [Objeto Charge](https://developer.pagbank.com.br/reference/objeto-charge)
- [Criar pedido com QR Code PIX](https://developer.pagbank.com.br/reference/criar-pedido-com-qr-code-pix-v2)
- [Criar e pagar pedido com cartão](https://developer.pagbank.com.br/reference/criar-pagar-pedido-com-cartao)
- [Chaves públicas](https://developer.pagbank.com.br/docs/chaves-publicas)
- [Autenticação 3DS](https://developer.pagbank.com.br/docs/configurando-autenticacao-3ds-com-pagbank)
- [Consultar pedido](https://developer.pagbank.com.br/reference/consultar-pedido)
- [Consultar pagamento](https://developer.pagbank.com.br/reference/consultar-pagamento)
- [Códigos de erro Order](https://developer.pagbank.com.br/reference/codigos-de-erro-order)

## Split

- [Divisão do pagamento](https://developer.pagbank.com.br/reference/divisao-de-pagamento)
- [Como utilizar divisão](https://developer.pagbank.com.br/reference/como-utilizar-a-divisao-de-pagamento)
- [Criar e pagar pedido com divisão](https://developer.pagbank.com.br/reference/crie-e-pague-pedido-com-divisao-do-pagamento)
- [Pedido com divisão e PIX](https://developer.pagbank.com.br/reference/pedido-com-divisao-de-pagamento-com-pix)
- [Consultar divisão](https://developer.pagbank.com.br/reference/consultar-divisao-do-pagamento)
- [Liable](https://developer.pagbank.com.br/reference/utilizar-o-mcc-vendedor-principal-liable)

## Webhooks, cancelamento e chargeback

- [Webhooks Order](https://developer.pagbank.com.br/reference/webhooks)
- [Confirmar autenticidade da notificação](https://developer.pagbank.com.br/reference/confirmar-autenticidade-da-notificacao)
- [Cancelar pagamento](https://developer.pagbank.com.br/reference/cancelar-pagamento)
- [Cancelamento com divisão](https://developer.pagbank.com.br/reference/cancelamento-de-pedido-com-divisao-de-pagamento)
- [Recuperação de chargeback de secundário](https://developer.pagbank.com.br/reference/recuperacao-chargeback-de-secundario)

## Como lidar com lacunas

- Página oficial clara + endpoint aplicável: `COMPROVADO` documentalmente.
- Capacidade geral sem prova no produto/conta do SmartBus: `PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO`.
- Ausência de fonte oficial ou contradição não resolvida: `NÃO COMPROVADO`.
- Proibição/limitação explícita aplicável: `NÃO SUPORTADO`.

Não transforme exemplo de payload em garantia comercial. Limite, habilitação, tarifa, SLA, suporte, responsabilidade e disponibilidade podem depender de contrato e homologação.
