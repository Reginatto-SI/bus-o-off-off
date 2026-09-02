# Auditoria definitiva — PagBank direto × PB Integrações

> **Data da pesquisa:** 2 de setembro de 2026.
> **Escopo:** API para PIX e cartão de crédito, sem Payment Link, boleto ou venda manual.
> **Resultado:** **RECOMENDAR PAGBANK DIRETO**.
> **Gate:** **SIM, COM RESTRIÇÕES** para preparar a implementação; produção continua bloqueada até habilitação comercial e homologação dos gates financeiros e de segurança.

## 1. Resumo executivo

O produto técnico indicado é **Pedidos e Pagamentos (Order)** da API oficial PagBank. A documentação oficial comprova que `Order` cria PIX com QR Code e copia e cola, cobra cartão sem redirecionamento, recebe cartão criptografado por chave pública, aceita parcelamento, 3DS, consulta de pedido, webhook, idempotência e divisão de pagamento. Portanto, ele atende ao escopo de checkout transparente; o nome do produto não foi usado como presunção.

A arquitetura direta é recomendada porque elimina um operador e um hop de dados, conserva os mecanismos oficiais de OAuth/Connect Authorization, idempotência e verificação criptográfica do webhook, reduz lock-in e dá ao SmartBus uma trilha de diagnóstico contra a fonte financeira. A PB Integrações oferece um proxy funcional e conveniente, inclusive Connect Key e endpoints de Orders, mas não publicou evidência suficiente de idempotência fim a fim, autenticação de webhook, SLA, retenção/tratamento de dados, continuidade, portabilidade ou contrato financeiro. Facilidade de integração não compensa esses gaps.

Isto **não autoriza produção**. O PagBank exige habilitação de split/marketplace e contas recebedoras elegíveis. A quantidade máxima de recebedores e uma operação real com quatro recebedores (empresa, Marketplace, sócio e representante) não ficaram comprovadas publicamente. Os quatro cenários são, assim, **PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO**, nunca `COMPROVADO`.

### Decisões fechadas

- **Payment Link, link de pagamento e checkout hospedado não fazem parte do escopo.**
- Primeira fase: PIX e cartão por API; parcelamento quando aplicável.
- Boleto e venda manual administrativa ficam fora.
- Uma empresa tem um gateway ativo para novas vendas; troca somente explícita.
- Gateway e ambiente são imutáveis por venda; não existe fallback automático.
- Regras financeiras, snapshot e ledger pertencem ao SmartBus.
- Asaas permanece íntegro e empresas existentes não são migradas.

## 2. Método, níveis de evidência e fontes

Foram confrontados: código e migrations atuais; Skills internas; documentação oficial PagBank; site, termos e central de ajuda da PB Integrações. Informação sem fonte pública suficiente foi marcada **NÃO COMPROVADO**. Exemplos da Skill PB são evidência da interface declarada pelo fornecedor intermediário, não garantia oficial do PagBank nem garantia contratual.

### 2.1 Fontes internas

- [`smartbus-payment-gateway`](../../.agents/skills/smartbus-payment-gateway/SKILL.md) e suas referências de arquitetura, configuração, checkout, webhook, financeiro, diagnóstico e checklist.
- [`pagbank-connect`](../../.agents/skills/pagbank-connect/SKILL.md), especialmente segurança, Connect Key, sandbox, Orders PIX/cartão, 3DS, parcelas, webhook e split.
- Código auditado: `Checkout.tsx`, `Confirmation.tsx`, configuração/diagnóstico; Edge Functions de criação, webhook, consulta e reconciliação; helpers compartilhados de contexto, split, taxa, finalização e observabilidade; migrations de snapshot, ambiente, logs e deduplicação.

### 2.2 Fontes externas oficiais consultadas

- PagBank: [chaves públicas e idempotência](https://developer.pagbank.com.br/docs/chaves-publicas-e-de-idempotencia), [Connect Authorization](https://developer.pagbank.com.br/reference/solicitar-autorizacao-via-connect-authorization), [obter](https://developer.pagbank.com.br/reference/obter-access-token), [renovar](https://developer.pagbank.com.br/reference/renovar-access-token) e [revogar token](https://developer.pagbank.com.br/reference/revogar-access-token).
- PagBank Order: [criar pedido](https://developer.pagbank.com.br/reference/criar-pedido), [PIX](https://developer.pagbank.com.br/reference/criar-pedido-com-qr-code-pix-v2), [cartão](https://developer.pagbank.com.br/reference/criar-pagar-pedido-com-cartao), [3DS](https://developer.pagbank.com.br/reference/criar-pagar-pedido-com-3ds-validacao-pagbank), [consultar pedido](https://developer.pagbank.com.br/reference/consultar-pedido) e [webhooks](https://developer.pagbank.com.br/reference/webhooks).
- PagBank split: [visão geral](https://developer.pagbank.com.br/reference/divisao-de-pagamento), [criar com divisão](https://developer.pagbank.com.br/reference/crie-e-pague-pedido-com-divisao-do-pagamento), [PIX com divisão](https://developer.pagbank.com.br/reference/pedido-com-divisao-de-pagamento-com-pix), [consultar](https://developer.pagbank.com.br/reference/consulte-a-divisao-do-pagamento), [cancelamento](https://developer.pagbank.com.br/reference/cancelamento-de-pedido-com-divisao-de-pagamento) e [chargeback de secundário](https://developer.pagbank.com.br/reference/recuperacao-chargeback-de-secundario).
- PagBank: [autenticidade de notificação](https://developer.pagbank.com.br/reference/confirmar-autenticidade-da-notificacao), [ambientes](https://developer.pagbank.com.br/docs/ambientes-disponiveis) e [chave pública](https://developer.pagbank.com.br/reference/criar-chave-publica).
- PB Integrações: [site](https://pbintegracoes.com/), [autorização](https://pbintegracoes.com/connect/autorizar/), [sandbox](https://pbintegracoes.com/connect/sandbox/), [termos](https://pbintegracoes.com/terms/) e [suporte](https://ajuda.pbintegracoes.com/hc/pt-br/requests/new).

## 3. Fotografia do SmartBus e contrato que não pode mudar

O fluxo atual é: checkout cria venda reservada e passageiros/locks; `create-asaas-payment` revalida tenant e ambiente, calcula e congela a regra financeira, resolve split, cria cobrança correlacionada e persiste ID/status; webhook prioritário e `verify-payment-status` por polling/fallback convergem em `finalizeConfirmedPayment`; a finalização marca pago, libera locks e emite tickets uma única vez. Logs, dedup, diagnóstico e reconciliação dão rastreabilidade.

Pontos comprovadamente reutilizáveis: engine da taxa, resolvedores de elegibilidade, snapshot, finalização, tickets e conceito de observabilidade. Pontos acoplados: chamada direta `create-asaas-payment`, campos `asaas_*`, configuração/wizard, verify/link, webhook/dedup e diagnóstico. A menor evolução futura é criar seams somente nesses limites, sem reescrever o fluxo.

O contrato multigateway mínimo deverá persistir por venda: `gateway`, `payment_environment`, ID de order/charge/QR/split, referência SmartBus, status externo normalizado, identificação **não secreta** da credencial/conta, idempotency key, correlação e origem de confirmação. Segredos pertencem a uma configuração por `company_id + gateway + environment`, nunca à venda nem ao frontend.

## 4. Natureza das arquiteturas

| Aspecto | PagBank oficial direto | PB Integrações |
|---|---|---|
| Cadeia | SmartBus → PagBank | SmartBus → PB → PagBank |
| Fornecedores críticos | PagBank e infraestrutura SmartBus | PagBank, PB e infraestrutura SmartBus |
| Pontos de falha | Um hop financeiro externo | Dois hops; falha/latência/mapeamento adicional |
| Fonte de verdade | API e IDs oficiais | Resposta reencaminhada; consulta depende da mesma Connect Key |
| Dados expostos | SmartBus e PagBank | Também transitam pela PB |
| Observabilidade | Request oficial, `Order`, `Charge`, `Split` | IDs preservados, mas há caixa-preta no proxy |
| Mudanças de contrato | API oficial | API oficial + adaptação/versionamento PB (`pspro/v7`) |
| Lock-in | Tipos PagBank isoláveis no adapter | PagBank + Connect Key + endpoints PB |
| Continuidade/SLA | SLA público específico das APIs: **NÃO COMPROVADO** | SLA, redundância e continuidade: **NÃO COMPROVADO** |
| Suporte | Canais PagBank/contrato marketplace | Canal PB mais eventual escalonamento PagBank; responsabilidades contratuais **NÃO COMPROVADO** |

## 5. Onboarding e credenciais multiempresa

### 5.1 Direto

O Connect Authorization oficial segue authorization code: aplicação com `client_id`; redirecionamento ao PagBank com `response_type=code`, `redirect_uri`, `scope` e `state`; retorno com code; troca backend por `access_token` e `refresh_token`; endpoints de renovação e revogação. Os scopes publicados incluem `payments.read`, `payments.create`, `payments.refund`, `accounts.read` e `payments.split.read`. Sandbox e produção possuem hosts/credenciais separados.

Desenho seguro para escala: gerar `state` aleatório, single-use, com expiração e vínculo a usuário, `company_id` e ambiente; callback exclusivamente backend; validar redirect exato e tenant; criptografar tokens em repouso; registrar fingerprint/conta, scopes, datas e auditoria; renovar sob lock; revogar na desconexão. O frontend recebe somente estado sanitizado. O prazo exato de access/refresh token e política de rotação devem ser confirmados no contrato/homologação.

### 5.2 PB Integrações

A autorização gera uma Connect Key e `connectInfo` informa `accountId`/`isSandbox`. A key autentica o proxy e o prefixo distingue ambiente. Isso simplifica a configuração manual, mas a Skill modela uma única variável de ambiente; para o SmartBus ela teria de virar cofre por tenant/ambiente. Expiração, refresh, scopes finos, revogação automatizada, callback com `state`, delegação para milhares de tenants e trilha de consentimento são **NÃO COMPROVADO**.

### Conclusão de onboarding

**PagBank direto** é mais seguro e adequado para centenas/milhares de empresas: consentimento oficial, scopes, renovação/revogação e vínculo direto da conta. Configuração manual pode existir como contingência somente se o produto/contrato oficial a exigir, com validação backend e sem secret no cliente.

## 6. PIX

| Capacidade | Direto | PB Integrações |
|---|---|---|
| Criar | `POST /orders` com QR Code | `POST connect/ws/orders` |
| QR/copia e cola | Links PNG/base64 e texto EMV | Payload/links do Order reencaminhados |
| Expiração | `expiration_date` | Campo equivalente declarado |
| Split | `qr_codes[].splits` documentado | Mesmo formato declarado |
| Status/consulta | Order/QR consultável | `GET connect/ws/orders/{id}` |
| Confirmação | webhook + consulta oficial | webhook encaminhado + consulta PB |
| Idempotência | header oficial | **NÃO COMPROVADO** fim a fim |
| Sandbox | endpoint oficial separado | prefixo da Connect Key; pedidos não aparecem no painel |

**Resultado:** funcionalmente `Order` oficial atende PIX; **PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO** quando combinado ao split SmartBus. PB atende a criação básica, porém perde no gate de retry seguro e autenticidade do evento.

## 7. Cartão, parcelamento, PCI e 3DS

O fluxo direto usa SDK/chave pública no browser para transformar PAN em cartão criptografado e envia somente o criptograma ao backend/Order. O backend nunca deve aceitar/logar PAN/CVV. O Order aceita `installments`; a API consulta taxas/parcelas; 3DS usa sessão e SDK. A autenticação reduz fraude, mas o emissor pode não autenticar; sem autenticação, a transferência de liability por fraude não é garantida.

A PB declara public key, cartão criptografado, parcelas, cálculo de taxas e sessão 3DS por seus endpoints proxy. Ela não remove responsabilidades do SmartBus: CSP/SDK confiável, não persistir PAN/CVV, backend seguro, minimização de logs, antifraude, vínculo tenant/ambiente e observância PCI aplicável. A PB adicionalmente processa payload transacional e criptograma; seu escopo PCI, suboperadores e retenção são **NÃO COMPROVADO**.

| Responsável | Direto | Intermediado |
|---|---|---|
| SmartBus | UI segura, SDK, criptograma, backend, idempotência, tenant, logs, regra financeira | As mesmas responsabilidades mais confiança/gestão da PB |
| PagBank | chave privada, descriptografia/processamento, autorização, 3DS e liquidação | continua sendo processador final |
| PB | não participa | proxy, custódia/uso da Connect Key, tráfego, mapeamento e disponibilidade; garantias detalhadas **NÃO COMPROVADO** |

**Resultado:** cartão e parcelamento são suportados nas duas interfaces, mas produção requer homologar cartão + split + parcelas + 3DS e avaliação PCI. Direto tem menor superfície e melhor cadeia de evidência.

## 8. Split — gate crítico

O PagBank documenta divisão em subtransações por recebedor, método `FIXED`, valores em centavos, contas `ACCO_*`, `PRIMARY`/`SECONDARY`, split em cartão e PIX, consulta posterior e cancelamento customizado. O modelo de carrinho único é compatível: cada venda SmartBus tem uma única empresa vendedora e divide a taxa entre participantes.

### 8.1 Mapeamento proposto, não implementação

- Recebedores: empresa, Marketplace, sócio e representante.
- O SmartBus calcula inteiros em centavos e atribui o resíduo determinístico conforme sua regra existente; envia `FIXED`, nunca recalcula percentuais no gateway.
- A soma dos recebedores deve ser exatamente o total cobrado.
- A escolha de `PRIMARY`, `liable`, custódia, chargeback e taxas **não é derivada** do exemplo PB; depende de contrato e decisão financeira.
- Falhar fechado antes da cobrança se qualquer conta for ausente, ambiente divergente, inelegível ou soma inválida.

### 8.2 Resultado dos quatro cenários

| Cenário | Recebedores totais | Direto | PB Integrações | Motivo |
|---|---:|---|---|---|
| 1 — empresa + Marketplace + sócio + representante | 4 | **PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO** | **PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO** | `FIXED`/array existem; máximo público e teste real com quatro não comprovados |
| 2 — empresa + Marketplace + sócio | 3 | **PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO** | **PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO** | formato suporta múltiplos; elegibilidade/liquidação precisam teste |
| 3 — empresa + Marketplace + representante | 3 | **PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO** | **PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO** | idem |
| 4 — empresa + Marketplace | 2 | **PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO** | **PROVÁVEL, MAS PRECISA HOMOLOGAÇÃO** | exemplo/documentação cobrem dois, mas conta e contrato SmartBus ainda não |

### 8.3 Gaps de split

- máximo de recebedores, regras de um único PRIMARY e possibilidade de três SECONDARY: **NÃO COMPROVADO** publicamente;
- habilitação comercial de marketplace/split, MCC, tipo e elegibilidade de cada conta: **NÃO COMPROVADO** para as contas SmartBus;
- comportamento de PIX/cartão parcelado, rejeição atômica, liquidação, taxas e arredondamento em produção: precisa homologação;
- PB: garantia de preservar integralmente receivers/configurações e consultar tudo pela Connect Key: precisa homologação/contrato.

Não há evidência de `NÃO SUPORTADO`, mas o cenário 1 bloqueia produção até prova positiva.

## 9. Idempotência — gate crítico

O PagBank documenta chave em header e afirma que solicitações repetidas com a mesma chave retornam a mesma resposta. Isso resolve o timeout se o SmartBus persistir a chave **antes** do primeiro POST e reutilizá-la para aquela operação, independentemente de sessão/novo clique. O ID/reference da venda permite consulta posterior; lock/unique local impede duas operações concorrentes. Duração, limite, conflito com payload diferente e escopo exato da chave não ficaram expostos na página geral e precisam teste contratual, mas o mecanismo de criação é comprovado.

Na PB, `reference_id` não equivale a idempotência. A documentação fornecida não comprova header próprio, repasse do header oficial, replay da resposta, janela nem garantia contratual. Classificação: **NÃO COMPROVADO**. Uma deduplicação somente no SmartBus não elimina o intervalo “PagBank criou, resposta se perdeu”.

## 10. Webhook, consulta e estados

O Order envia ao `notification_urls` payload equivalente à resposta síncrona. A documentação oficial define `x-authenticity-token = SHA-256("{token}-{raw_payload}")`; qualquer reformatação do JSON invalida o hash e divergência exige descartar o evento. O SmartBus deve usar o token da conta/ambiente correto, o **raw body**, comparação constant-time, tamanho máximo, parse posterior, allowlist de transições e consulta autenticada antes de qualquer efeito financeiro quando houver dúvida. Timestamp/nonce e uma identidade única universal do evento: **NÃO COMPROVADO**; portanto anti-replay depende de hash/payload + gateway + ambiente + conta + order/charge/status, estado monotônico e finalização idempotente. Política pública de retries, atraso e ordenação: **NÃO COMPROVADO**.

A PB mostra exemplos de POST com Order atualizado, mas assinatura/header, preservação do hash original, raw body, autenticação própria, retry, atraso e anti-replay são **NÃO COMPROVADO**. Consulta posterior reduz falsificação, mas não elimina indisponibilidade/latência da intermediária.

O padrão recomendado preserva exatamente: **webhook prioritário → consulta oficial como fallback → finalização comum**. Nunca confiar em status recebido isoladamente; correlacionar empresa, ambiente, conta, referência, valor, método e transição. Mapear estados externos em tabela explícita durante o desenho (`PAID` como candidato confirmatório; `WAITING`, `DECLINED`, `CANCELED` etc. não por semelhança textual).

## 11. Confirmação, tickets, logs e reconciliação

Ambas permitem venda reservada, confirmação externa e consulta. A alternativa direta adapta-se melhor por consultar a fonte financeira sem proxy. A futura implementação deve generalizar os chamadores e manter uma única finalização compartilhada; gateway-specific fica em criar/consultar/verificar webhook.

Requisitos invariáveis: finalização sob lock/condição idempotente; ticket único; snapshot financeiro imutável; logs sanitizados com gateway/ambiente/tenant/venda/IDs/status/latência/idempotency fingerprint; dedup com chave composta; reconciliação consulta o gateway congelado da venda. Não armazenar token, Connect Key, PAN, CVV ou raw body sensível.

## 12. Chargeback

A documentação oficial de split estabelece:

- chargeback é inicialmente debitado integralmente do PRIMARY;
- opcionalmente, um único SECONDARY pode receber `charge_transfer.percentage = 100`; os demais devem ser `0`;
- depois do débito no PRIMARY, ocorre repasse que debita o secundário e restitui o PRIMARY;
- `liable`/3DS afetam responsabilidade em casos aplicáveis, mas não autorizam presumir transferência universal;
- saldo negativo, eventos/webhook específicos, disputa documental, instante de liquidação e efeito quando o secundário não tem saldo: **NÃO COMPROVADO** para o contrato SmartBus.

Isso não reproduz uma divisão arbitrária do chargeback entre empresa, Marketplace, sócio e representante. **Não decidir política agora.** O cadastro de `charge_transfer` e `liable` é decisão posterior financeira/jurídica/comercial. PB declara passar esses campos, mas execução e suporte contratual são **NÃO COMPROVADO**.

## 13. Cancelamento, refund e preservação da taxa

Para Order com split, o PagBank documenta cancelamento proporcional ou customizado, integral/parcial. Somente PRIMARY solicita; todos os debitados precisam saldo. O customizado aceita `FIXED` ou `PERCENTAGE`, indica valores por recebedor, responsável por arredondamento e taxas. Logo, **é tecnicamente provável preservar a taxa SmartBus num cancelamento comercial customizado**, debitando a devolução dos recebedores definidos, mas isso depende de saldo, taxas reembolsáveis, contrato e homologação. Não automatizar.

A documentação de “refund” de Pagamentos Recorrentes é produto diferente e não prova comportamento de Order; não foi usada como evidência do escopo. Na PB, endpoint/semântica de cancelamento de Order com split e garantia de preservação customizada: **NÃO COMPROVADO** na Skill. Chargeback compulsório permanece separado e pode sobrepor a política comercial.

## 14. Sandbox e produção

| Tema | Direto | PB Integrações |
|---|---|---|
| Endpoint | `sandbox.api.pagseguro.com` versus produção oficial | mesma base PB; ambiente pelo prefixo da key |
| Credencial | aplicação/tokens/contas separados | Connect Keys separadas |
| PIX/cartão | simuladores e dados de teste | pedidos sandbox não aparecem no painel PagBank |
| Split | requer contas/habilitação/testes próprios | consulta sandbox usa host interno sem Bearer, divergente de produção |
| Webhook | URL por order; autenticidade a validar em ambos | equivalência de segurança não comprovada |
| Onboarding | fluxo Connect sandbox/produção | páginas próprias para gerar key |

Sandbox não prova liquidação, elegibilidade, chargeback, saldo insuficiente, taxas nem operação comercial. O desvio PB de consulta de split (`internal.sandbox...` sem Bearer versus proxy autenticado em produção) enfraquece a paridade e exige teste específico. Toda venda deve congelar ambiente; nunca inferi-lo por hostname/prefixo em operações históricas.

## 15. Segurança, dados e LGPD operacional

Nos dois modelos transitam identificação/contato do comprador, dados da transação, valores, recebedores/contas e criptograma do cartão. No direto, vão SmartBus→PagBank. No intermediado, também passam pelos sistemas/logs/suboperadores PB; isto aumenta superfície, controlador/operador a gerir, incident response e dependência de exclusão/portabilidade.

Medidas SmartBus: minimização; cofre/criptografia; separação por tenant e ambiente; RBAC e RLS; tokens somente backend; rotação/revogação; logs redigidos; retenção definida; auditoria de leitura/alteração; state OAuth forte; raw webhook protegido; consulta confirmatória. Políticas públicas específicas de retenção, suboperadores, DPA, residência, notificação de incidente e exclusão PB: **NÃO COMPROVADO**. Isto é análise técnica, não parecer jurídico.

## 16. SLA, suporte, continuidade e custos

| Item | Direto | PB Integrações |
|---|---|---|
| SLA público específico | **NÃO COMPROVADO** | **NÃO COMPROVADO** |
| Suporte | canais PagBank; nível marketplace depende de contratação | central de ajuda/formulário; escalonamento e horário **NÃO COMPROVADO** |
| Responsável por incidente | cadeia mais curta | delimitação PB×PagBank **NÃO COMPROVADO** |
| DR/continuidade | **NÃO COMPROVADO** publicamente | **NÃO COMPROVADO** |
| Portabilidade | tokens/API oficiais; adapter removível | migrar Connect Keys/endpoints e revalidar consentimentos |
| Tarifa PagBank/split | depende da oferta/contrato marketplace; valor aplicável **NÃO COMPROVADO** | site/Skill dizem integração “gratuita”; condições, mensalidade, extras e repasse futuro **NÃO COMPROVADO** contratualmente |

Nenhum valor foi estimado. Tarifas transacionais, custo de split, prazo de recebimento, reserva, antecipação e requisitos comerciais devem vir de proposta formal PagBank. A alegação pública “gratuita” da PB não comprova custo total, SLA ou estabilidade futura.

## 17. Lock-in e evolução futura

O direto acopla apenas o adapter PagBank a Order/Charge/Split/Connect; o domínio conserva `gateway`, `environment`, referência, status e recebedores próprios. Mercado Pago/PayPal poderão ganhar adapters somente nos seams reais. A PB adiciona um segundo vocabulário (`Connect Key`, `connect/ws`, `pspro/v7`) e risco de desvio da API fonte, sem beneficiar outros gateways. Portanto, direto reduz lock-in e manutenção, sem justificar um framework genérico agora.

## 18. Impacto no código atual

| Área atual | Específica Asaas? | Pode permanecer intacta? | Precisa seam futuro? | Risco |
|---|---|---|---|---|
| Checkout | chamada/mensagens sim | UI e reserva majoritariamente | criador por gateway | médio |
| Engine financeira | não, regra SmartBus | **sim** | somente contrato de saída | baixo |
| Split resolver | objetivo genérico; wallets Asaas | regra/elegibilidade sim | receiver IDs/config por provider | alto |
| Criação | sim | função Asaas sim | função PagBank + dispatcher mínimo | alto |
| Configuração | campos/wizard sim | painel Asaas sim | config PagBank lado a lado | médio |
| Credenciais | sim | segredos Asaas sim | cofre por gateway/tenant/ambiente | alto |
| Webhook | sim | endpoint Asaas sim | endpoint PagBank e dedup dimensionado | alto |
| Consulta | implementação Asaas | comportamento | adapter pelo gateway da venda | alto |
| Finalização | compartilhável | **sim** | entrada normalizada | baixo |
| Tickets | não | **sim** | nenhum além da finalização | baixo |
| Logs | parcialmente | histórico sim | dimensões gateway/IDs | médio |
| Diagnóstico | fortemente | tela/Asaas sim | filtros e seção PagBank | médio |
| Reconciliação | consulta Asaas | regras de reparo sim | consulta por gateway | alto |
| Banco | campos `asaas_*`; ambiente genérico | histórico inteiro | adições gateway/config/IDs/idempotência | alto |

## 19. Matriz comparativa final

| Critério | PagBank Oficial Direto | PB Integrações | Melhor opção | Evidência | Risco |
|---|---|---|---|---|---|
| Segurança | canal direto, OAuth, hash oficial | secret proxy e hop adicional | Direto | oficial vs gaps PB | médio/alto |
| Arquitetura | 1 provedor externo | 2 provedores | Direto | topologia | médio |
| Multiempresa | tokens/scopes oficiais | keys por tenant sem ciclo comprovado | Direto | Connect vs Skill | médio |
| Onboarding | authorization code/state/refresh/revoke | emissão manual de key | Direto | oficial; PB parcial | médio |
| Credenciais | scopes e revogação | Connect Key ampla | Direto | documentação | alto |
| PIX | Order completo | proxy funcional | Direto | ambas documentam | médio |
| Cartão | criptografia/3DS nativos | proxy declarado | Direto | ambas documentam | alto/PCI |
| Parcelamento | Order/fees | endpoint proxy | Empate funcional | documentação | médio |
| Split | FIXED, PIX/cartão/consulta | payload proxy | Direto | capacidade provável | **alto/gate** |
| Idempotência | chave oficial/replay | **NÃO COMPROVADO** | Direto | documentação oficial | **alto/gate** |
| Webhook | hash oficial + consulta fonte | assinatura/replay não comprovados | Direto | documentação | **alto/gate** |
| Consulta | fonte financeira | via intermediária | Direto | endpoints | médio |
| Status | Order/Charge fonte | payload reencaminhado | Direto | endpoints | médio |
| Chargeback | regra de PRIMARY/1 SECONDARY | campos declarados, garantia ausente | Direto | oficial | alto |
| Estorno | cancelamento split customizado | não comprovado na Skill | Direto | oficial | alto |
| Sandbox | oficial; gaps econômicos | desvios host/painel | Direto | docs/Skill | médio |
| Produção | contrato direto | dupla dependência | Direto | topologia | alto |
| Observabilidade | IDs/consulta oficiais | hop opaco | Direto | arquitetura | médio |
| SLA | não comprovado | não comprovado | Nenhuma | ausência pública | alto |
| Suporte | relação direta | suporte PB + escalonamento | Direto | canais; SLA ausente | médio |
| Custos | proposta pendente | “gratuita”, condições pendentes | Nenhuma | insuficiente | alto comercial |
| LGPD/dados | menos trânsito | exposição adicional | Direto | fluxo de dados | alto |
| Pontos de falha | menos | mais | Direto | topologia | alto |
| Lock-in | PagBank isolável | PagBank + PB | Direto | contratos técnicos | médio |
| Manutenção | um contrato de API | dois contratos | Direto | arquitetura | médio |
| Escalabilidade | OAuth multi-tenant | ciclo de keys não comprovado | Direto | capacidades | médio |
| Evolução futura | adapter do provedor | adapter do proxy específico | Direto | arquitetura | baixo/médio |
| Aderência SmartBus | forte, condicionado ao split | parcial por gaps críticos | Direto | matriz | alto até homologar |
| Regressão Asaas | baixa com seam aditivo | baixa no código, maior operação | Direto | plano aditivo | baixo se disciplinado |

## 20. Pontuação qualitativa

| Categoria | PagBank direto | PB Integrações |
|---|---|---|
| Segurança | Boa | Parcial |
| Multiempresa | Boa | Parcial |
| Split | Parcial | Parcial |
| PIX | Boa | Boa |
| Cartão | Boa | Boa |
| Idempotência | Excelente | Não comprovada |
| Webhook | Boa | Não comprovada |
| Onboarding | Boa | Parcial |
| Sandbox | Boa | Parcial |
| Diagnóstico | Boa | Parcial |
| Dependências externas | Boa | Fraca |
| Lock-in | Boa | Fraca |
| Manutenção | Boa | Parcial |
| Evolução futura | Boa | Fraca |
| Aderência ao SmartBus | Boa | Parcial |

## 21. Recomendação e gates

### **RECOMENDAR PAGBANK DIRETO**

Principal motivo: é a única alternativa com mecanismos críticos oficiais comprovados para idempotência, consentimento multiempresa, consulta à fonte e autenticidade do webhook, além de menos exposição de dados e um ponto de falha a menos. PB Integrações ficou em segundo lugar porque, embora exponha PIX/cartão/split de forma conveniente, não comprova garantias fim a fim justamente nos gates que evitam duplicidade e confirmação fraudulenta, e adiciona dependência/lock-in.

### A arquitetura está definida o suficiente para preparar implementação?

**SIM, COM RESTRIÇÕES.** Pode começar desenho técnico, testes de caracterização do Asaas, modelo aditivo e spike sandbox do adapter oficial. Não pode declarar split/produção aprovados.

#### Bloqueios para começar desenvolvimento funcional

- Obter confirmação do PagBank de que a aplicação/conta marketplace terá acesso a Order + Connect Authorization + split em sandbox. Sem credenciais/habilitação de teste, somente scaffolding e testes por contrato são possíveis.
- Confirmar em canal oficial o máximo de receivers e que 1 PRIMARY + até 3 SECONDARY é aceito no mesmo Order. Esse fato define se o contrato obrigatório é implementável; não adaptar a regra SmartBus.

#### Bloqueios apenas para homologação

- executar matriz dos quatro splits, PIX e cartão parcelado, inclusive centavos/resíduo, conta inválida, saldo e consulta;
- validar idempotência após timeout, replay, payload divergente e janela;
- validar algoritmo de autenticidade sobre raw body, duplicidade, atraso, reorder e fallback;
- validar OAuth/state/refresh/revoke, escopos, isolamento empresa/ambiente, 3DS e responsabilidades PCI;
- fechar mapa de status e comportamento de cancelamento/chargeback em sandbox.

#### Bloqueios apenas para produção

- contrato/habilitação marketplace e elegibilidade real de empresa, Marketplace, sócio e representante;
- prova de split real nos quatro cenários e liquidação/reconciliação;
- proposta de tarifas, split, recebimento/reserva, suporte, SLA e incident response;
- DPA/LGPD, retenção, suboperadores e segurança aprovados;
- política humana de chargeback/refund e configuração de PRIMARY/`liable`/`charge_transfer`;
- piloto, runbook, alertas, reconciliação e regressão completa do Asaas.

## 22. Próximo passo recomendado

Abrir uma etapa de **confirmação comercial/técnica oficial PagBank** com a lista fechada de gaps de split, OAuth, webhook e idempotência; em paralelo, preparar um desenho de implementação aditivo (sem migration nesta auditoria), caracterizar o Asaas atual e definir contratos do adapter direto. Só depois das duas confirmações bloqueantes iniciar código funcional de criação.

## 23. Proteção do Asaas e rollback

O risco de regressão é **baixo se** a implementação futura for aditiva: default das empresas atuais permanece Asaas; vendas antigas continuam por `gateway` congelado; funções/campos Asaas não são removidos; PagBank tem feature flag/piloto; desligá-lo impede apenas novas vendas; criação, webhook e consulta são provider-specific, enquanto finalização/tickets continuam comuns. Reverter código não reverte efeitos financeiros externos, logo reconciliação e IDs históricos permanecem obrigatórios.

Nesta auditoria nenhum código funcional, banco, migration, RLS, Edge Function, configuração ou comportamento Asaas foi alterado.
