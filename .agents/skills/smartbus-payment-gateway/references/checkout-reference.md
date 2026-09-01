# Checkout, cobrança, confirmação e ticket

## Fluxo atual observado

1. `Checkout.tsx` carrega evento/empresa/viagens/assentos e lê `companies.payment_environment` da empresa do evento; o hook não consulta hostname.
2. Valida comprador, passageiros, CPF/benefício, termos, estoque e locks.
3. Persiste `sales` e `sale_passengers`; venda nasce reservada/pendente com `company_id`, método e ambiente.
4. Invoca `create-asaas-payment` com `sale_id` e método.
5. Backend relê venda e empresa, aplica a precedência venda→empresa→request, valida status/ambiente, evita cobrança existente, calcula taxa, resolve split e chama Asaas com `externalReference = sale.id`.
6. Persiste ID/status/link externo; o frontend segue para `/confirmacao/:id`.
7. Webhook é confirmação prioritária. `Confirmation.tsx` usa `verify-payment-status` em polling/fallback e pode reabrir link com `get-asaas-payment-link`.
8. `finalizeConfirmedPayment` converge venda, locks e tickets; TicketCard/lookup exibem o resultado.

Venda manual em `NewSaleModal` tem regras próprias de taxa da plataforma via `create-platform-fee-checkout`; não confundir com pagamento integral online.

## Invariantes para qualquer gateway

- Criar venda antes da chamada externa para obter correlação estável.
- Congelar gateway, ambiente, método, valor e snapshot financeiro na venda.
- Para venda existente, resolver ambiente pela venda mesmo quando a navegação ou configuração atual da empresa estiver no ambiente oposto; não inferir por host ou credencial.
- Usar chave idempotente do provedor quando disponível e trava local sempre.
- Se houver ID externo existente, consultar/reutilizar; nunca recriar silenciosamente.
- Confirmar valor/moeda/referência/tenant antes de marcar pago.
- Estados externos são preservados brutos; uma tabela/mapeamento explícito governa transições internas.
- Apenas finalização central gera tickets. Reexecução retorna sucesso sem duplicar.
- Falha entre banco e gateway deve deixar trilha reconciliável; rollback local não pode apagar evidência de cobrança possivelmente criada.
- Mensagem pública não expõe segredo, payload interno ou topologia; fornece ação segura (aguardar, tentar verificar, suporte).

## Testes mínimos

- Pix/cartão/boleto realmente suportados no escopo, sucesso/recusa/expiração.
- timeout antes e depois da criação externa; retry não duplica.
- dois cliques/abas concorrentes; apenas uma cobrança e um conjunto de tickets.
- webhook antes/depois do redirect, duplicado e fora de ordem.
- verify confirma sem webhook e registra a anomalia.
- venda/credencial/ID de outro tenant ou ambiente é rejeitado.
- pago sem ticket é reconciliável; pendente nunca gera ticket.
