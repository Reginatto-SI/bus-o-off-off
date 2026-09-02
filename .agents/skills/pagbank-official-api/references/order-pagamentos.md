# API Order: PIX, cartão, parcelamento e status

Use esta referência ao criar, consultar ou diagnosticar pedidos e cobranças.

## Produto adotado

A API de Pedidos e Pagamentos (`Order`) é o produto candidato para a integração direta. Ela documenta PIX, cartão, parcelamento, split, consulta e cancelamento. Não confunda:

- QR Code PIX da API Order;
- Pagar com PagBank/carteira;
- Checkout PagBank hospedado.

O SmartBus usa o primeiro. Os dois últimos estão fora do escopo aprovado.

## Identificação e correlação

- Use referências próprias estáveis e únicas para pedido e cobrança, respeitando os limites publicados.
- Correlacione venda, tentativa de pagamento e operação lógica localmente.
- Persista `order.id`, `charge.id`, `split_id` quando aplicável e status externo.
- Nunca use descrição, e-mail, valor ou horário como chave de correlação.
- Não conclua que uma criação falhou apenas porque houve timeout; consulte/recupere antes de nova operação.

## PIX

Capacidades documentadas:

- criação de QR Code PIX pela API Order;
- QR Code de uso único;
- uma chave PIX ativa é pré-requisito da conta;
- expiração definida em `charges.payment_method.pix.expiration_date` no fluxo documentado;
- retorno de texto copia e cola e links de imagem/base64;
- status inicial típico `WAITING`; confirmação `PAID` por webhook/consulta;
- split disponível para PIX.

Regras SmartBus:

- QR Code expirado não equivale a venda paga nem autoriza emissão.
- Recriação exige nova operação lógica, nova correlação e análise do estado anterior.
- Sempre consultar a cobrança anterior antes de oferecer novo PIX após falha ambígua.
- Homologar expiração, pagamento no limite, evento atrasado, pagamento duplicado e split real.

## Cartão

Capacidades documentadas:

- pagamento transparente pela API Order, sem redirecionamento hospedado;
- criptografia no navegador com SDK PagBank e chave pública;
- cartão criptografado é de uso único e tem janela documentada de até 48 horas;
- somente a conta associada à chave pública pode processar o cartão criptografado;
- parcelamento por `installments` e captura por `capture`;
- 3DS disponível em fluxos documentados;
- split disponível para cartão de crédito.

Regras de segurança:

- PAN, validade e CVV não devem passar pelo backend SmartBus em texto claro.
- Não persistir dados brutos do cartão, resultado completo do SDK ou payload sensível.
- A chave pública usada deve corresponder à conta PagBank e ambiente que processarão a cobrança.
- `encryptedCard` é dado sensível de uso transitório: não registrar em log.
- Não habilitar tokenização de cartão na primeira fase sem requisito explícito, consentimento, modelo de dados e análise próprios.
- Não assumir que usar o SDK elimina todas as responsabilidades PCI; validar escopo com PagBank e segurança.

## 3DS e Liable

A documentação atual informa que `liable` não está disponível para transações que usam 3DS. Portanto:

- não combine ambos por suposição;
- se a empresa vendedora for o primário, investigue se `liable` é desnecessário;
- priorize segurança de cartão, conformidade e definição correta do primário;
- trate a escolha como gate comercial/técnico de homologação.

## Status

Mapeamento conservador:

| Status PagBank | Interpretação | Ação SmartBus |
|---|---|---|
| `WAITING` | aguardando pagamento | manter reservado/pendente |
| `AUTHORIZED` | pré-autorizado, ainda não capturado | não marcar pago |
| `IN_ANALYSIS` | análise de risco | não marcar pago |
| `PAID` | pago/capturado | pode convergir para finalização idempotente |
| `DECLINED` | negado | não finalizar; permitir UX controlada |
| `CANCELED` | cancelado | não finalizar; tratar conforme estado local |

Confirme o status por consulta quando o evento estiver atrasado, ambíguo ou fora de ordem. Nunca rebaixe automaticamente uma venda já finalizada sem política de reversão aprovada.

## Parcelamento

- O número de parcelas e eventual repasse de juros são conceitos distintos da taxa SmartBus.
- Não acrescente custo de parcelamento à base comercial da taxa SmartBus sem regra explícita.
- A documentação publica valor mínimo de R$ 5,00 por parcela no fluxo de consulta/repasse de taxa; valide no produto contratado.
- Homologue split e liquidação em todas as quantidades de parcelas oferecidas.

