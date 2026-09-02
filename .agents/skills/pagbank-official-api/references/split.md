# Split PagBank aplicado ao SmartBus

Use esta referência para payload, validação, conciliação e diagnóstico de divisão de pagamento.

## Capacidades comprovadas na documentação oficial

- Order suporta split em PIX e cartão de crédito.
- Uma transação pode ser dividida entre até 15 recebedores.
- Existem um recebedor primário e um ou mais secundários.
- `FIXED` usa valores inteiros em centavos e exige que a soma seja igual ao total da operação.
- `PERCENTAGE` exige soma igual a 100 e aceita casas decimais.
- A consulta do split usa `split_id` e token do primário.
- O primário paga integralmente tarifas e taxas da transação sobre o total.
- A liquidação dos recebedores segue o prazo do primário.

## Escolha normativa

Use `FIXED` para a regra SmartBus. O SmartBus calcula a taxa absoluta antes da integração; converter parcelas exatas em percentual pode alterar centavos e base efetiva.

O payload completo deve representar:

- empresa vendedora: total menos taxa SmartBus;
- Marketplace;
- sócio global elegível;
- representante elegível.

Não assuma a forma exata do array nem omita o primário sem conferir o schema oficial atual do endpoint. A soma de todos os recebedores declarados deve ser exatamente o total cobrado.

## Primário: decisão financeira crítica

O primário é a conta que realiza a requisição e, segundo a documentação atual:

- paga tarifas sobre o valor total;
- é o único que solicita cancelamento;
- é debitado integralmente primeiro em chargeback;
- consulta o split com seu token.

A arquitetura desejada tende a usar a empresa vendedora como primário por meio de seu access token Connect, mas isso só pode ser confirmado após homologar:

- quem aparece como primário no Order/Split;
- efeito das tarifas no líquido da empresa;
- MCC, condições comerciais e prazo de recebimento;
- permissões para SmartBus operar em nome da empresa;
- responsabilidade contratual por cancelamento e chargeback.

Não escolha o primário apenas por facilidade técnica.

## Montagem segura

1. Carregue o snapshot financeiro oficial da venda.
2. Resolva elegibilidade e account IDs no ambiente da venda.
3. Falha de consulta não equivale a recebedor ausente.
4. Calcule todas as parcelas em centavos.
5. Aplique regra determinística ao resíduo de divisão.
6. Valide contas distintas e ambiente correto.
7. Valide `empresa + Marketplace + sócio + representante = total`.
8. Salve snapshot imutável do plano de split antes do envio.
9. Envie com idempotência.
10. Salve IDs retornados e consulte o split.
11. Compare planejado, enviado, aceito e consultado.

## Quatro cenários de homologação

| Cenário | Recebedores esperados | Classificação documental |
|---|---|---|
| Marketplace + sócio + representante | empresa + 3 destinos | `PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO` |
| Marketplace + sócio | empresa + 2 destinos | `PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO` |
| Marketplace + representante | empresa + 2 destinos | `PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO` |
| Somente Marketplace | empresa + Marketplace | `PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO` |

O limite de 15 torna quatro recebedores documentalmente possíveis. A classificação continua conservadora porque conta, contrato, habilitação de marketplace, formato do endpoint e liquidação real precisam ser homologados.

## Casos de teste financeiros

- taxa divisível e não divisível por 2 e 3;
- taxa mínima R$ 5,00;
- teto R$ 25,00 por item;
- múltiplas passagens;
- taxa adicional da empresa;
- recebedor sem conta no ambiente;
- account ID inválido ou de outro tenant;
- soma menor/maior que o total;
- PIX pago após expiração aparente;
- cartão à vista e parcelado;
- timeout após criação;
- consulta do split divergente;
- tarifa do primário reduzindo o líquido esperado;
- saldo e liquidação dos secundários.

## Proibições

- Não usar percentual para aproximar valor fixo.
- Não redistribuir por falha técnica silenciosamente.
- Não enviar account ID de Sandbox em Produção ou vice-versa.
- Não afirmar que alguém recebeu apenas porque estava no payload.
- Não registrar split efetivo sem conciliar a resposta e a consulta.
- Não alterar o valor total da taxa SmartBus por limitação do PagBank.

