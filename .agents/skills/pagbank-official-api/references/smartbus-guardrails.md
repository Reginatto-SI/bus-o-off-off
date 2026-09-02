# Regras normativas do SmartBus

Leia esta referência antes de qualquer decisão funcional, financeira ou de modelo de dados.

## Autoridade e precedência

1. A Skill `smartbus-payment-gateway`, quando disponível, é a autoridade sobre pagamentos no SmartBus.
2. O PRD oficial de divisão da taxa prevalece sobre documentos históricos do Asaas.
3. Esta Skill descreve capacidades do PagBank; não altera regra de produto.
4. Em conflito ou dúvida, não assuma. Consulte a documentação vigente do projeto e registre o bloqueio.

## Multi-gateway

- Gateways iniciais: Asaas e PagBank.
- Cada empresa tem um único gateway ativo para novas vendas.
- Empresas atuais continuam no Asaas até troca explícita.
- PagBank pode ser recomendado para novas empresas, mas não há migração automática.
- O gateway de origem de uma venda é permanente.
- Trocar o gateway da empresa afeta apenas novas vendas.
- Nunca recriar automaticamente uma cobrança em outro gateway.
- Nunca implementar fallback automático de gateway.

## Venda e confirmação

- Venda nasce reservada/aguardando pagamento.
- Somente confirmação válida do gateway permite estado `pago`.
- `webhook prioritário → consulta como fallback → finalização comum`.
- Finalização, emissão de tickets, ledger e comissões são idempotentes.
- PagBank não deve criar um segundo fluxo de finalização independente.

## Empresa e ambiente

- Toda operação é isolada por `company_id`.
- Sandbox e Produção usam a mesma lógica, mas credenciais e dados externos separados.
- Ambiente é configuração explícita, não inferência por host, URL ou chave.
- A venda persiste o ambiente de origem.
- Frontend nunca recebe secrets.

## Regra financeira

A regra financeira pertence ao SmartBus. O gateway somente executa o pagamento.

Ordem normativa resumida:

1. calcular valor financeiro de cada passagem/item;
2. aplicar sua faixa comercial;
3. aplicar teto de R$ 25,00 por item;
4. somar as taxas dos itens;
5. aplicar mínimo operacional de R$ 5,00 sobre a taxa total;
6. dividir a taxa já calculada entre os recebedores elegíveis;
7. salvar snapshot e ledger coerentes com o payload efetivo.

Taxa adicional criada pela empresa não altera automaticamente a base da taxa SmartBus. A divisão interna é confidencial e não deve aparecer ao comprador.

## Cenários oficiais de divisão

O restante do valor total pertence à empresa vendedora, antes de considerar tarifas próprias do provedor.

| Cenário | Marketplace | Sócio global | Representante |
|---|---:|---:|---:|
| Sócio e representante elegíveis | 1/3 da taxa | 1/3 | 1/3 |
| Sócio elegível; representante ausente | 1/2 da taxa | 1/2 | 0 |
| Sócio ausente; representante elegível | 2/3 da taxa | 0 | 1/3 |
| Nenhum elegível | 100% da taxa | 0 | 0 |

Regras adicionais:

- Sócio é global da plataforma, não pertence à empresa e não deve ser filtrado por `company_id`.
- Representante pertence à empresa vendedora e exige vínculo e conta PagBank válidos no ambiente.
- Sandbox e Produção não completam credenciais/contas uma da outra.
- Ausência real de recebedor aplica o cenário oficial sem criar dívida oculta.
- Falha de consulta ou cadastro ambíguo não equivale a ausência: bloqueie ou registre pendência conforme regra oficial, sem redistribuição silenciosa.
- Resposta aceita não comprova liquidação; concilie payload, retorno, consulta do split e ledger.

## Arredondamento

Calcule em centavos. A soma final deve ser igual ao total cobrado.

Quando 1/3 não for exato, a regra de distribuição do centavo residual deve ser única, determinística, documentada e coberta por teste. Não delegue o arredondamento comercial ao gateway.

## Cancelamento comercial

- Depois de paga, a taxa SmartBus é considerada ganha.
- Cancelamento, desistência ou negociação entre passageiro e empresa não devolve automaticamente a taxa SmartBus.
- Chargeback compulsório é diferente e continua sujeito a política específica.
- Nenhum endpoint de estorno deve ser chamado automaticamente apenas porque a venda foi cancelada internamente.

## Proteção do Asaas

- Mudanças devem ser aditivas e compatíveis sempre que possível.
- Não renomear ou reaproveitar campos Asaas para semântica genérica sem migração segura.
- Não remover funções, webhooks, configuração, logs ou reconciliação Asaas nesta fase.
- Código PagBank pode ser desabilitado para novas vendas sem afetar vendas antigas.
- Rollback de código não desfaz autorização, captura, split, liquidação, refund ou chargeback já executados externamente.

## Fontes internas usadas na criação

- `Diretrizes Oficiais do Projeto.txt`
- `PRD 01 — Regra Oficial de Divisão da Taxa entre Marketplace, Sócio e Representante.txt`
- documentação Asaas `00` a `06`, usada apenas para entender o fluxo atual e os invariantes que devem ser preservados
- `04-asaas-split-comissoes-e-representantes.md`, tratado como histórico onde o próprio documento assim declara

