# Refund, cancelamento e chargeback

Use esta referência somente quando a tarefa tratar reversões. Não implemente política automaticamente.

## Separação de conceitos

- Cancelamento comercial SmartBus: decisão entre empresa e passageiro.
- Refund/estorno PagBank: movimentação financeira devolvida ao comprador.
- Chargeback: contestação compulsória iniciada pelo titular/emissor.
- Cancelar uma venda localmente não autoriza chamar automaticamente a API.

## Regra SmartBus vigente

Após pagamento confirmado, a taxa SmartBus é considerada ganha. Cancelamento, desistência ou negociação comercial não devolve automaticamente essa taxa. Chargeback continua com política pendente.

## Cancelamento/refund com split

A documentação oficial descreve:

- somente o primário solicita cancelamento;
- cancelamento pode ser total ou parcial;
- modo proporcional debita todos os recebedores proporcionalmente;
- modo customizado permite `FIXED` ou `PERCENTAGE` por recebedor;
- é possível escolher responsável por taxas reembolsáveis e arredondamento;
- todos os recebedores debitados precisam ter saldo suficiente;
- após um refund parcial customizado, refunds parciais futuros da mesma transação também devem ser customizados;
- o split pode ser consultado após o cancelamento.

Consequência: preservar a taxa SmartBus pode ser tecnicamente possível com cancelamento customizado, mas só pode ser classificado como `PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO`. Exige payload explícito, saldo, conciliação e política aprovada. Nunca use refund proporcional por padrão se ele devolver taxa SmartBus contra a regra vigente.

## Chargeback

A documentação atual afirma:

- chargeback é inicialmente debitado integralmente do primário;
- opcionalmente um único secundário pode assumir 100% via `splits.receivers.configurations.chargeback.charge_transfer.percentage`;
- os demais recebedores devem receber valor 0 nessa configuração;
- mesmo com secundário indicado, o débito ocorre primeiro no primário e depois há repasse de recuperação;
- a funcionalidade pode depender de autorização comercial do PagBank.

Isso não representa automaticamente a política SmartBus. Antes de implementar, decidir:

- quem é o primário real;
- se a empresa vendedora ou outro participante absorve fraude;
- se haverá `charge_transfer` e para qual secundário;
- impacto quando o secundário não tem saldo;
- como reverter ledger, comissão, ticket e status local;
- como tratar valor já liquidado e saldo negativo;
- eventos e evidências de abertura, decisão e encerramento da contestação.

## Liable

`liable` define qual recebedor fornece identidade/MCC às bandeiras em cartão. Ele não troca o primário PagBank nem remove sua responsabilidade por cancelamento/chargeback. A documentação atual também declara incompatibilidade com 3DS.

Não use `liable` como sinônimo de responsável financeiro sem validar contrato e comportamento real.

## Controles operacionais

- Refund exige autorização forte e trilha de auditoria.
- Exiba simulação de quem será debitado antes da confirmação administrativa.
- Use idempotência própria da operação de refund.
- Concilie resposta, Charge, Split e ledger.
- Falha parcial não deve ser escondida por atualização otimista da venda.
- Rollback de código não desfaz refund ou chargeback externo.

