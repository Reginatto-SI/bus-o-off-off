# Auditoria de paridade e evolução dos gateways de pagamento

**Data do corte:** 2026-09-22
**Escopo:** checkout público, cobrança, taxa, split, confirmação, tickets, comissões,
ambientes, credenciais, webhook, reconciliação e reversões de Asaas e PagBank.
**Natureza:** diagnóstico estático e plano; nenhuma correção funcional, migration,
secret, Edge Function, frontend ou regra foi alterada.

## 1. Resumo executivo

O SmartBus já tem uma base multi-gateway real, incremental e aproveitável. A venda
é criada antes da cobrança, o banco congela `company_id`, gateway, ambiente,
conexão e conta externa, ambos os caminhos usam o mesmo motor progressivo, a mesma
verificação de integridade e a mesma finalização idempotente que muda a venda para
`pago`, cria passagens e registra a comissão do representante. Isso representa
paridade funcional relevante no núcleo.

PagBank, porém, **não está pronto para Produção**. Ele está deliberadamente limitado
ao Sandbox, oferece apenas PIX, ainda depende de homologação real de Connect, split,
webhook, timeout e reconciliação, e não possui fluxo operacional de cancelamento,
estorno, estorno parcial, disputa ou chargeback. O Asaas possui tratamento bem mais
maduro desses eventos, embora também não automatize a reversão financeira do split.

O maior risco encontrado no Asaas não deve ser copiado: falhas internas de resolução
do split, ausência da wallet da plataforma ou rejeição explícita do split pelo gateway
podem produzir uma cobrança **sem split**, mantendo apenas uma pendência de
conciliação. O PagBank é mais conservador: ambiguidade/erro de consulta bloqueia,
recebedor devido sem conta bloqueia, a soma deve fechar em centavos e o split ecoado
pelo provedor precisa coincidir.

Há também uma divergência compartilhada entre nomenclatura e comportamento do campo
`pass_platform_fee_to_customer`. O default de banco é `false`. Quando `true`, a taxa
SmartBus é adicionada ao que o passageiro paga; quando `false`, ela não desaparece:
é retirada do bruto já cobrado, portanto é absorvida pela empresa. O comportamento
está alinhado ao PRD financeiro vigente, mas o comentário histórico da migration
ainda fala em “6%”, embora o motor vigente seja progressivo (6/5/4/3%, teto unitário
de R$ 25 e piso total de R$ 5).

### Parecer

- **Núcleo compartilhado:** suficiente para evoluir incrementalmente; não justifica
  uma nova arquitetura genérica.
- **Asaas:** referência operacional, mas não referência automática de segurança do
  split nem de reversão contábil.
- **PagBank Sandbox PIX:** implementação coerente e defensiva, ainda não homologada
  ponta a ponta.
- **PagBank Produção/cartão/reversões:** bloqueados ou ausentes.
- **Mercado Pago/Stripe:** devem entrar pelo mesmo snapshot/finalização/observabilidade;
  hoje ainda exigiriam duplicar criação, consulta, webhook, status e credenciais.

## 2. Fontes de verdade e hierarquia usada

1. Regras do repositório e checkpoint: `AGENTS.md`,
   `docs/pagbank/BRANCH_CONTEXT.md` e `docs/pagbank/PAGBANK_IMPLEMENTATION.md`.
2. Regra financeira normativa mais recente:
   `docs/PRD/PRD 01 — Regra Oficial de Divisão da Taxa entre Marketplace, Sócio e Representante.txt`.
3. PRDs financeiros 01–05 e PRD de termos em `docs/PRD/`.
4. PRDs Asaas 00–07, tratados como descrição consolidada/histórica quando eles
   próprios não são a norma financeira mais nova.
5. Código e migrations atuais, que demonstram o comportamento efetivo.
6. Skills internas: `smartbus-payment-gateway` como autoridade de produto e
   `pagbank-official-api` como autoridade da integração oficial direta.

`pagbank-connect` foi lida somente para evitar confusão de arquiteturas. O código
auditado usa as APIs oficiais PagBank (`api.pagseguro.com`), OAuth/Connect
Authorization e Order; não usa Connect Key, `ws.pbintegracoes.com`, Payment Link ou
checkout hospedado da PB Integrações.

### Divergências documentais explícitas

| Tema | Documento determina | Asaas atual | PagBank atual | Decisão necessária |
|---|---|---|---|---|
| Percentual da taxa | PRD 01 vigente: faixa individual 6/5/4/3%, teto R$ 25 por item e piso R$ 5 no total | Usa o motor vigente | Usa o mesmo motor | Corrigir futuramente somente o comentário histórico “+ 6%” da migration; não mudar a regra |
| Ausência de recebedor | Ausência comprovada seleciona um dos quatro cenários; erro/ambiguidade não equivale a ausência | Ausência aplica cenário, mas erro pode degradar e cobrar sem split | Ausência aplica cenário; erro/ambiguidade bloqueia | Confirmar se o fail-open legado Asaas será proibido em tarefa própria |
| Reversões | PRDs reconhecem necessidade de trilha/ledger, sem definir estorno automatizado completo | Invalida operação em casos terminais, mas split/reembolso é manual | Apenas normaliza status; não invalida venda nem ticket | Definir política única de estorno parcial, chargeback, ticket usado e comissão |
| Gateway/ambiente da venda | Devem ser congelados | As vendas novas passam pelo trigger multi-gateway; campos `asaas_*` permanecem específicos | Congelamento explícito inclui conexão e conta | Nenhuma para novas vendas; confirmar saneamento de legado sem snapshot |
| Produção PagBank | Só após homologação e autorização | Produção operacional | Bloqueada no código e constraints | Autorização futura só após cumprir todos os gates |

## 3. Fluxo ponta a ponta reconstruído

### 3.1 Checkout e nascimento da venda

1. `Checkout.tsx` carrega evento, empresa, ambiente, gateway, prontidão, taxas,
   termos, viagens, assentos e benefícios.
2. O frontend calcula cada preço final individual, taxas adicionais por passageiro e,
   se o repasse estiver ligado, a taxa progressiva SmartBus.
3. A venda é inserida como `pendente_pagamento` (o backend aceita também o legado
   `reservado`), com `company_id`, método, bruto, ambiente e aceite de intermediação.
4. O trigger `freeze_sale_payment_context` ignora gateway enviado pelo cliente, copia
   o gateway corrente da empresa e congela ambiente, empresa, conexão PagBank e conta
   externa. Updates posteriores que tentem trocar esse contexto falham.
5. Locks e `sale_passengers` são gravados antes da chamada externa. Os passageiros
   guardam preço original/final, desconto, tipo de passagem e trecho; essa é a base
   financeira autoritativa do backend.
6. Termos obrigatórios são aceitos no frontend e revalidados/persistidos no backend
   antes da cobrança, pela mesma rotina nos dois gateways.

**Nota sobre `reservado`:** o checkout público atual cria `pendente_pagamento`, não
`reservado`. Ambos os adapters aceitam os dois estados. `reservado` continua sendo
um estado compatível/legado e de outros fluxos de reserva, não o único status inicial
do checkout público.

### 3.2 Seleção e congelamento de gateway/ambiente

- Novas vendas usam `companies.payment_gateway` e `companies.payment_environment`.
- O trigger, e não o cliente, escolhe o gateway efetivo.
- Operações PagBank usam exclusivamente o contexto congelado na venda.
- O Asaas já lê o ambiente persistido com precedência sobre empresa/request depois
  de vinculada a cobrança, mas seu handler ainda contém compatibilidade de primeira
  criação e colunas específicas `asaas_*`.
- Não existe fallback automático PagBank → Asaas nem Sandbox → Produção.
- Trocar o gateway da empresa afeta apenas novas vendas.

### 3.3 Cálculo financeiro compartilhado

`platform-fee-engine.ts` recebe os preços individuais efetivos. Para cada item:

| Preço individual | Percentual |
|---:|---:|
| até R$ 100,00 | 6% |
| acima de R$ 100 até R$ 300 | 5% |
| acima de R$ 300 até R$ 600 | 4% |
| acima de R$ 600 | 3% |

O cálculo arredonda primeiro para centavos, limita cada taxa a R$ 25, soma os itens
e aplica o piso total de R$ 5 quando a soma positiva for menor. Taxas adicionais do
evento entram no bruto, mas não na base/faixa da taxa SmartBus. Empresa com
`platform_fee_percent <= 0` é tratada pelos dois adapters como isenta: a taxa do
motor é zerada.

`checkout-financial-integrity.ts` recompõe o bruto como:

```text
soma dos preços finais dos passageiros
+ taxas adicionais ativas do evento
+ taxa SmartBus, somente quando repassada ao passageiro
= gross_amount esperado
```

Asaas falha se não conseguir carregar taxas do evento. PagBank não verifica o erro
da query de `event_fees`; uma falha pode virar lista vazia e resultar em erro genérico
de integridade. É um gap de diagnóstico/garantia, não uma regra financeira diferente.

### 3.4 Cobrança Asaas

- Suporta PIX e cartão no checkout atual (e preserva compatibilidades históricas do
  adapter).
- Resolve credencial, conta/wallet e base URL por empresa e ambiente.
- Se já existe `asaas_payment_id`, consulta e reutiliza; não recria.
- Em resultado de criação incerto, procura por `externalReference = sale.id` antes
  de permitir nova criação.
- Traduz os valores do motor para `fixedValue` ou `totalFixedValue`.
- A empresa emissora fica com o valor não incluído no array de split.
- Persiste ID, status, URL e snapshot financeiro na venda.

**Dívida crítica:** o Asaas pode seguir sem split quando a wallet da plataforma está
ausente, a resolução interna falha, ou o gateway rejeita explicitamente o split. A
segunda chamada sem split só ocorre após 4xx explícito que prova que a primeira não
criou cobrança, o que protege idempotência, mas financeiramente deixa a cobrança na
empresa e apenas registra valor pendente para conciliação.

### 3.5 Cobrança PagBank

- Nesta fase aceita exclusivamente PIX e exclusivamente Sandbox.
- Exige venda PagBank, conexão congelada da mesma empresa/ambiente e, para criar,
  conexão corrente/conectada.
- Cria uma tentativa local com chave estável por empresa, venda, ambiente e operação;
  envia a mesma chave em `x-idempotency-key`.
- Tentativa em andamento, indeterminada ou com Order existente não autoriza criação
  cega. O adapter consulta por ID/referência e preserva a venda quando um Order pode
  existir.
- Traduz o plano financeiro para split `FIXED` em centavos incluindo empresa,
  Marketplace, sócio e representante; valida conta faltante, IDs duplicados e soma
  exata igual ao total.
- Depois do HTTP de sucesso, exige que o split ecoado seja idêntico e que exista
  artefato PIX. Caso contrário, bloqueia o uso da cobrança e exige reconciliação.
- Persiste tentativa, IDs, status bruto/normalizado, QR, expiração e snapshot.

### 3.6 Confirmação, tickets e comissão

- A tela de confirmação faz polling local e chama `verify-payment-status` como
  fallback. PagBank mostra QR dentro do SmartBus; Asaas reabre a fatura externa.
- Asaas: webhook autenticado é a fonte prioritária; verify consulta o pagamento.
- PagBank: o webhook assinado **não** é usado como prova do pagamento. Ele dispara
  consulta autoritativa do Order; verify usa a mesma rotina.
- Somente estados Asaas confirmados ou PagBank `PAID` chegam à
  `finalizeConfirmedPayment`.
- A finalização faz update condicional de `reservado|pendente_pagamento` para `pago`,
  cria tickets por rotina/RPC idempotente, tenta uma segunda criação imediata se o
  pagamento ficou sem ticket, registra incidente se continuar inconsistente, cria a
  comissão por RPC idempotente e remove locks.
- `reconcile-sale-payment` reutiliza a mesma finalização para “pago sem ticket”.

### 3.7 Cancelamento, estorno e disputa

- **Asaas antes do pagamento:** eventos terminais cancelam a venda e limpam tickets,
  locks e staging, com guards de estado.
- **Asaas após pagamento, antes do embarque:** estorno/reversão terminal cancela a
  venda e remove tickets/staging; não estorna split ou dinheiro automaticamente.
- **Asaas após embarque:** preserva histórico/ticket e abre incidente financeiro.
- **Asaas disputa em andamento:** apenas registra risco; não cancela automaticamente.
- **PagBank:** status `canceled/failed` é persistido na tentativa, mas `status-sync`
  retorna `pending` para qualquer estado diferente de `paid`. Não existe transição de
  cancelamento, invalidação de ticket, refund, estorno parcial ou chargeback.
- **Ambos:** não existe rollback financeiro automático do split, nem ledger completo
  de reversões. A comissão criada após pagamento também não tem estorno automático
  demonstrado neste fluxo.

## 4. Auditoria financeira obrigatória

### 4.1 `pass_platform_fee_to_customer`

| Configuração | Passageiro | Empresa vendedora | Taxa SmartBus | Asaas | PagBank |
|---|---|---|---|---|---|
| `true` | Paga preço + taxas do evento + taxa SmartBus | Conserva preço + taxas próprias | Sai do adicional cobrado | Mesmo cálculo | Mesmo cálculo |
| `false` (default) | Paga preço + taxas do evento | Recebe o bruto menos a taxa SmartBus | É absorvida pela empresa | Mesmo cálculo | Mesmo cálculo |
| Empresa isenta (`platform_fee_percent <= 0`) | Não paga taxa SmartBus | Não sofre split SmartBus | R$ 0 | Mesmo gate | Mesmo gate |

O default `false` está na migration
`20260615093000_add_event_platform_fee_controls.sql` e no formulário de eventos.
O nome significa “repassar ao cliente”, não “habilitar a taxa”. Isso é consistente
com o PRD vigente: desligado = empresa absorve. A divergência é documental: o
comentário SQL fala em 6% fixos, enquanto a regra atual é progressiva.

### 4.2 Exemplo: uma passagem de R$ 100 e taxa de R$ 6

Sem taxa adicional do evento:

| Cenário de destinatários | Marketplace | Sócio | Representante | Empresa se repasse **desligado** (cliente paga R$ 100) | Empresa se repasse **ligado** (cliente paga R$ 106) |
|---|---:|---:|---:|---:|---:|
| Sócio + representante | R$ 2,00 | R$ 2,00 | R$ 2,00 | R$ 94,00 | R$ 100,00 |
| Apenas sócio | R$ 3,00 | R$ 3,00 | R$ 0,00 | R$ 94,00 | R$ 100,00 |
| Apenas representante | R$ 4,00 | R$ 0,00 | R$ 2,00 | R$ 94,00 | R$ 100,00 |
| Nenhum | R$ 6,00 | R$ 0,00 | R$ 0,00 | R$ 94,00 | R$ 100,00 |

Asaas envia somente Marketplace/sócio/representante; o restante fica na conta
emissora da empresa. PagBank envia todos os recebedores, inclusive a empresa. O
resultado comercial esperado é igual.

### 4.3 Arredondamento e conservação

Para R$ 5,00 com todos presentes, o motor usa centavos inteiros:

- representante: `floor(500/3)` = 166 centavos;
- sócio: 166 centavos;
- Marketplace recebe o resíduo: 168 centavos;
- soma: 500 centavos, sem sobra ou perda.

Com apenas sócio, ele recebe `floor(total/2)` e Marketplace recebe o resíduo. Com
apenas representante, ele recebe `floor(total/3)` e Marketplace recebe todo o resto.
PagBank ainda verifica `empresa + Marketplace + sócio + representante = total` antes
do envio e compara o eco do gateway. Asaas impede apenas que o split fixo exceda o
bruto; como a empresa é residual e o adapter pode degradar sem split, ele não oferece
a mesma garantia operacional de distribuição efetiva.

### 4.4 Taxas adicionais

Se a passagem custa R$ 100, há R$ 10 de taxa própria do evento e a taxa SmartBus é
R$ 6:

- repasse ligado: passageiro paga R$ 116; empresa conserva R$ 110; R$ 6 são divididos;
- repasse desligado: passageiro paga R$ 110; empresa conserva R$ 104; R$ 6 são divididos.

A taxa do evento não aumenta a base SmartBus. Benefício/desconto, por outro lado,
altera o `final_price` individual usado pelo motor.

## 5. Matriz Asaas × PagBank

Classificação: **A** paridade; **B** diferença legítima; **C** gap PagBank; **D**
divergência de regra; **E** regra compartilhada a revisar.

| Área | Regra SmartBus | Asaas | PagBank | Classificação | Risco | Ação futura |
|---|---|---|---|---|---|---|
| Criação da venda | Venda e snapshot antes do gateway | Sim | Mesmo checkout | A | Baixo | Manter |
| Status inicial | Aguardar pagamento sem liberar ticket | `pendente_pagamento`; aceita `reservado` | Igual | A | Baixo | Documentar terminologia |
| Gateway | Empresa escolhe; venda congela | Trigger já congela Asaas | Trigger congela PagBank | A | Baixo | Manter |
| Ambiente | Empresa escolhe; venda governa histórico | Persistido, com compatibilidade no primeiro create | Venda é única fonte | A | Médio no legado | Testar concorrência da primeira cobrança Asaas |
| Conta vendedora | Mesma empresa/ambiente da venda | API key/wallet por ambiente | conexão/account ID por `company_id` | B | Médio | Homologar ownership real |
| Métodos | Somente método aprovado | PIX/cartão | PIX apenas | C | Alto comercial | Implementar cartão somente após PIX homologado |
| Aceite de termos | Antes da cobrança | Rotina comum | Rotina comum | A | Baixo | Manter |
| Motor de taxa | Faixa individual, teto e piso | Motor comum | Motor comum | A | Baixo | Manter testes contratuais |
| Taxas do evento | Fora da base SmartBus | Query falha fechado | Erro da query não é distinguido | C | Médio | Falhar explicitamente e logar em tarefa futura |
| Repasse/absorção | Campo só muda o bruto cobrado | Correto | Correto | A | Médio documental | Corrigir comentário histórico, sem mudar regra |
| Quatro cenários | Ausência comprovada redistribui | Sim | Sim | A | Baixo | Manter |
| Ambiguidade/erro de recebedor | Não tratar como ausência | Pode cobrar sem split e abrir pendência | Bloqueia | D | **Crítico Asaas** | Decisão para eliminar fail-open |
| Formato split | Valores absolutos | `fixedValue/totalFixedValue`, empresa residual | `FIXED` centavos, empresa explícita | B | Baixo | Manter adapters |
| Integridade do split | Conservar total e comprovar resultado | Só limita soma; permite fallback sem split | Fecha soma e concilia eco | D | **Crítico Asaas** | Criar gate comum mínimo, sem copiar fallback |
| Idempotência de criação | Uma operação lógica, sem duplicar | ID persistido + busca por referência; sem chave local genérica | tentativa + chave local/remota + recovery | B/C | Médio Asaas | Consolidar contrato mínimo incremental |
| Timeout pós-create | Consultar antes de recriar | Busca por `externalReference` | estado indeterminado + busca por referência | A | Médio | Homologar cenários reais |
| Webhook autenticado | Validar antes de confiar | Token por ambiente | assinatura do corpo bruto | B | Alto se token mal configurado | Homologar Connect multiempresa |
| Deduplicação | Evento repetido não duplica efeito | Tabela Asaas + finalização idempotente | chave composta + reprocessa incompleto | A | Baixo/Médio | Testes concorrentes E2E |
| Consulta autoritativa | Fallback sem criar cobrança | Verify consulta payment | Webhook/verify consultam Order | A/B | Médio | Homologar credencial rotacionada |
| Confirmação | Só externo confirmado muda para pago | CONFIRMED/RECEIVED | Apenas PAID | B | Baixo | Manter mapping explícito |
| Tickets | Exatamente uma vez | Finalização comum | Finalização comum | A | Médio operacional | Testar concorrência real |
| Comissão | Só após pago; idempotente | RPC comum | RPC comum | A | Médio | Adicionar reversão após decisão de produto |
| Pago sem ticket | Retry e reparo controlado | Sim | Sim | A | Médio | Expandir diagnóstico para gateway genérico |
| Cancelamento pré-pago | Invalidar e liberar recursos | Implementado por webhook | Estado externo não transiciona venda | C | Alto | Definir mapa PagBank e testes |
| Estorno total | Invalidar uso conforme embarque | Parcial operacional; dinheiro manual | Ausente | C/E | **Crítico** | Política central + adapter PagBank |
| Estorno parcial | Política explícita | Evento tratado como reversão total operacional | Ausente | E/C | **Crítico** | Decisão de produto/financeiro |
| Disputa/chargeback | Preservar trilha e controlar uso | Risco/terminal parcialmente tratados | Ausente | C/E | **Crítico** | Política e homologação |
| Reversão de split/ledger | Reconciliar efeitos financeiros | Manual; sem rollback automático | Ausente | E | **Crítico** | Definir ledger/reversão comum |
| Renovação | Rotacionar sem trocar identidade | Chaves por configuração; sem OAuth comum | refresh OAuth com CAS; manual token possível | B | Médio | Homologar expiração/rotação |
| Troca/desconexão | Novas vendas apenas; antigas consultáveis | Configuração específica | conexão congelada; superseded permite query | A/B | Médio | Testar desconexão com vendas pendentes |
| Isolamento tenant | Validar `company_id` no backend | Predicados e contexto por venda | conexão/attempt por empresa | A | Médio | Testes negativos E2E |
| Sandbox × Produção | Nunca misturar ou fazer fallback | Ambos habilitados por configuração | Produção bloqueada em três camadas | B | Baixo hoje | Remover travas só após autorização |
| Observabilidade | Gateway/ambiente/empresa/venda/ID sem secret | Mais madura, telas e logs | Logs compartilhados + attempts/eventos | A/C | Médio | Generalizar diagnóstico visual |
| Conciliação | Consultar e reparar sem recriar | Verify + reconcile | Verify usa status-sync; reconcile comum só repara ticket | C | Alto | Runbook e reconciliação financeira PagBank |

## 6. O que já é compartilhado

### Reutilizável sem alteração conceitual

- criação da venda, locks e `sale_passengers` no checkout;
- snapshot individual de preço/benefício/tipo de passagem;
- motor progressivo e distribuição dos quatro cenários;
- integridade do bruto e taxas adicionais;
- persistência/validação do aceite de termos;
- contexto congelado no banco;
- `finalizeConfirmedPayment`, tickets, retry imediato e comissão;
- `sale_logs`, `sale_integration_logs` e helpers de observabilidade;
- tela de confirmação/polling e `verify-payment-status` como dispatcher mínimo;
- reparo controlado de pagamento confirmado sem ticket;
- regra de ambiente da empresa/venda.

### Duplicação/vazamento ainda existente

- cada create repete carregamento de venda, empresa, passageiros, taxas, cálculo,
  integridade, resolução de destinatários, snapshot e logs;
- há dois resolvedores de destinatários quase equivalentes, um para wallet Asaas e
  outro para account ID PagBank;
- snapshot financeiro é escrito separadamente nos adapters;
- Asaas mistura regra central, cliente/consumidor, split, retry, observabilidade e
  status em um handler monolítico;
- PagBank tem núcleo mais separado, mas `status-sync` trata todos os estados não pagos
  como pendentes, vazando uma lacuna de regra para o adapter;
- nomes `asaas_payment_id`, `asaas_payment_status` e parâmetro `asaasStatus` ainda
  atravessam componentes comuns/legados;
- diagnóstico visual e reconciliação foram construídos primeiro para Asaas e ainda
  não apresentam a mesma profundidade para PagBank.

## 7. Responsabilidades

### Regra central SmartBus

- criar e vincular venda, empresa, evento, passageiros e representante;
- congelar gateway, ambiente, identidade financeira e snapshot;
- calcular preço efetivo, taxas do evento e taxa SmartBus;
- decidir repasse ou absorção;
- decidir elegibilidade e valores de Marketplace/sócio/representante;
- garantir conservação em centavos e registrar ledger/snapshot;
- governar estados internos e transições permitidas;
- exigir confirmação externa válida;
- finalizar uma única vez, gerar tickets e comissão;
- decidir efeitos de cancelamento, estorno, estorno parcial e disputa;
- isolar tenant/ambiente e definir idempotência de negócio;
- reconciliar e observar incidentes.

### Adapter do gateway

- autenticação, endpoint e credencial no ambiente já decidido;
- criação/consulta/cancelamento/refund quando aprovados;
- formato técnico do split e interpretação da resposta;
- chave/header de idempotência oferecida pelo provedor;
- tradução de status/eventos externos para estados conceituais;
- validação específica de assinatura/token do webhook;
- refresh/rotação de token sem trocar a identidade lógica;
- obtenção de QR/link/artefatos e sanitização de erros.

### Avaliação da separação

A separação existe nos pontos decisivos (motor, integridade, finalização e contexto),
mas ainda é incompleta na preparação de cobrança, destinatários, snapshot, estados
negativos e reconciliação. A evolução mínima não é criar plugin framework: é extrair,
quando um terceiro gateway efetivamente exigir, um pequeno contrato dos seams já
repetidos.

## 8. Ambientes, credenciais e segurança

### Asaas

- Sandbox e Produção têm API keys, wallet/account, readiness e webhook token
  independentes.
- A venda persiste o ambiente e operações posteriores o respeitam.
- Existe heurística residual por hostname em código auxiliar; ela omite os domínios
  principais atuais, mas não governa o checkout principal. Não deve ser reutilizada.
- As credenciais ficam no backend/banco; frontend recebe flags e metadados, não chave.

### PagBank

- `PAGBANK_ALLOWED_ENVIRONMENTS = ["sandbox"]` bloqueia o adapter em Produção.
- Constraints impedem empresa ou venda PagBank em Produção.
- Conexões são privadas, RLS habilitada, service role para secrets; tokens e client
  secret persistidos são cifrados com AES-GCM e chave exclusiva do backend.
- Access/refresh token, token de webhook e identidade externa pertencem a conexão,
  empresa e ambiente. A venda congela conexão/conta.
- Connect OAuth usa `state` persistido, expiração/uso único e callback backend;
  refresh usa controle otimista por geração.
- Desconexão/troca não autoriza reatribuir vendas antigas; consulta aceita conexão
  substituída da mesma identidade enquanto a credencial ainda existir.

### Riscos de segurança/isolamento

1. O webhook PagBank depende de saber qual token assina eventos Connect por conta;
   isso está codificado, mas não homologado no contrato real.
2. `payment_gateway_connections` concede SELECT de colunas públicas específicas e a
   policy de readiness a `anon/authenticated` não filtra `company_id`. Ela não expõe
   token, mas permite enumerar IDs/status de conexões correntes PagBank. Revisar em
   tarefa de segurança, sem confundir com vazamento de segredo.
3. Service role ignora RLS; os handlers auditados aplicam filtros explícitos por
   venda/empresa/conexão, mas precisam de testes negativos ponta a ponta.
4. Logs estruturados são sanitizados por allowlist nos pontos comuns; ainda há logs
   de payloads de cobrança Asaas em integrações. Não foi observado log deliberado de
   token, mas a política deve ser testada com erros reais do provedor.
5. Uma conexão antiga sem token disponível torna venda histórica PagBank não
   consultável; não existe fallback para outra conta, corretamente.

## 9. Webhook, retries, confirmação e reversões

### Proteções equivalentes

- correlação pela venda/referência;
- autenticação antes da transição;
- deduplicação persistida;
- finalização idempotente;
- polling/consulta de contingência;
- retry imediato de ticket e reconciliação manual;
- logs por empresa/venda/ambiente/ID externo.

### Proteções Asaas ainda ausentes no PagBank

- matriz ampla de eventos oficiais;
- cancelamento de venda pendente por falha terminal;
- tratamento diferenciado de reversão pré/pós-embarque;
- risco de disputa sem transição destrutiva;
- `force_revalidate` para reversão em venda já paga;
- limpeza condicionada de tickets, staging e locks.

### Proteções PagBank superiores ao legado Asaas

- chave idempotente local/remota explícita por operação;
- estado `indeterminate` e política formal de retry;
- impedimento de segundo Order após qualquer ID externo;
- soma integral do split incluindo empresa;
- conciliação obrigatória do split ecoado;
- falha fechada em ambiguidade/consulta financeira.

### Falhas de convergência relevantes

- O webhook PagBank sempre responde 200 após falha de consulta/finalização para evitar
  retry infinito do provedor. O evento incompleto pode ser reprocessado se o mesmo
  evento chegar outra vez, mas não há scheduler demonstrado que reexecute sozinho;
  a recuperação depende de duplicata, polling/verify ou operação manual.
- `normalizePagbankStatus` reconhece `failed/canceled`, mas `status-sync` devolve
  `pending` para todo não pago; venda e tickets não refletem reversão.
- A finalização marca `pago` antes de assegurar ticket. Há retry e incidente, porém o
  estado intermediário “pago sem ticket” é intencionalmente possível e requer reparo.
- Falha da RPC de comissão não desfaz pagamento/ticket; gera log, mas não há fila de
  retry específica demonstrada.

## 10. Já pareado

- venda e passageiros persistidos antes da cobrança;
- gateway e ambiente efetivos persistidos e imutáveis para novas vendas;
- vínculo da venda à empresa e à identidade financeira de origem;
- termos antes da cobrança;
- cálculo progressivo, teto, piso, descontos e taxas adicionais;
- significado de `pass_platform_fee_to_customer`;
- quatro cenários de distribuição e arredondamento central;
- consulta de contingência sem usar retorno do frontend como confirmação;
- somente confirmação externa muda para `pago`;
- finalização/tickets/comissão compartilhados e idempotentes;
- observabilidade comum básica;
- isolamento de credencial por tenant/ambiente;
- troca de configuração sem migração de venda histórica.

## 11. Gaps reais do PagBank

1. Produção intencionalmente bloqueada e não homologada.
2. Cartão/parcelamento/3DS não implementados; somente PIX.
3. Connect, split, webhook, rotação e timeout ainda sem prova E2E Sandbox registrada
   para a conta/contrato finais.
4. Falha de `event_fees` não é diferenciada e observada como no Asaas.
5. Estados failed/canceled/expired não convergem a venda.
6. Cancelamento, refund, estorno parcial, disputa e chargeback ausentes.
7. Sem política de ticket/comissão/ledger para reversões.
8. Reconciliação financeira/split operacional ainda não tem painel/runbook equivalente.
9. Diagnóstico administrativo tem menos profundidade que Asaas.
10. PIX criado sem QR ou split não confirmado fica bloqueado para nova cobrança, mas
    exige procedimento de reconciliação ainda incompleto.

## 12. Divergências compartilhadas

- política completa de estorno parcial e chargeback não está decidida;
- split/repasse externo não tem reversão automática nem ledger de compensação completo;
- comissão pode falhar após ticket e não há mecanismo comum de retry demonstrado;
- “pago sem ticket” ainda é um estado possível, embora detectado e reparável;
- nomenclatura/colunas Asaas ainda aparecem no modelo comum;
- diagnóstico/reconciliação não têm contrato plenamente agnóstico;
- PRD de ledger é mais amplo que `representative_commissions` e snapshots atuais;
- comentário histórico de 6% conflita com a regra progressiva vigente.

## 13. Dívida técnica do Asaas que não deve ser propagada

1. **Fail-open financeiro:** cobrança sem split diante de erro/ambiguidade interna.
2. **Fallback após rejeição de split:** seguro contra duplicidade por depender de 4xx
   explícito, mas inseguro para liquidação da taxa.
3. **Ausência da wallet da plataforma:** permite cobrar e deixar toda a taxa na empresa.
4. **Garantia incompleta da soma:** não concilia eco do split como PagBank.
5. **Handler monolítico:** duplica preparação financeira e mistura responsabilidades.
6. **Campos específicos no núcleo:** `asaas_payment_*` e parâmetro `asaasStatus`.
7. **Heurística residual por host:** fonte possível de mistura se um novo consumidor
   a adotar.
8. **Reversão financeira manual:** invalida uso, mas não compensa split/ledger.

Esses itens são legado/risco, não requisitos de paridade do PagBank.

## 14. Preparação para Mercado Pago, Stripe e outros

### Reuso imediato

Checkout, venda, passageiros, locks, termos, ambiente, trigger de congelamento,
motor, integridade, distribuição, snapshot conceitual, finalização, tickets, comissão,
logs e confirmação visual podem ser reutilizados.

### Acoplamentos que hoje gerariam duplicação

- enum/check constraints aceitam apenas Asaas/PagBank;
- criação e consulta têm branches explícitos;
- IDs/status/links históricos são nomeados Asaas;
- tentativa genérica só modela `create_pix` PagBank;
- destinatários resolvem campos específicos por provedor;
- webhook e reversões não compartilham um mapa de transições conceitual;
- configuração/onboarding e diagnóstico são cards/handlers específicos;
- `finalizeConfirmedPayment` tipa apenas duas origens/gateways.

### Contratos conceituais já existentes

1. `sale_id + company_id + gateway + environment + external identity` imutáveis.
2. Um create recebe venda e método, devolve artefato público/ID/status sem secret.
3. Consulta converte estado externo e só finaliza em confirmação válida.
4. Webhook autentica, correlaciona, deduplica e converge pela mesma finalização.
5. Plano financeiro fornece bruto e valores absolutos por participante.
6. Finalização é idempotente e comum.

### Contratos mínimos a consolidar somente quando necessário

- tipo pequeno para `create/query` e artefato de pagamento;
- conjunto conceitual de status (`pending`, `paid`, `failed`, `canceled`,
  `refunded`, `partially_refunded`, `disputed`);
- operação/tentativa genérica com chave idempotente e estado indeterminado;
- plano de recebedores independente de `walletId/accountId`;
- persistência genérica de IDs/status externos sem remover colunas legadas;
- política central de reversão e efeito em ticket/comissão/ledger;
- consulta de diagnóstico por gateway.

Não se recomenda framework de plugins, registry dinâmico ou reescrita. Ao iniciar um
terceiro gateway, extrair apenas preparação financeira/snapshot que já está duplicada,
adicionar um branch explícito e preservar Asaas/PagBank.

## 15. Bloqueantes antes de Produção PagBank

1. Manter e validar as travas atuais até autorização expressa.
2. Homologar Connect Authorization/scopes e ownership por empresa.
3. Homologar PIX e split FIXED nos quatro cenários com conta/contrato finais.
4. Confirmar tarifas, recebedor primário e líquido real da empresa.
5. Homologar assinatura do webhook em Connect multiempresa e rotação de token.
6. Provar idempotência/timeout antes e depois do Order e recuperação por referência.
7. Provar consulta com conexão rotacionada/revogada sem cruzar tenant/ambiente.
8. Implementar e testar estados negativos, cancelamento e reversões aprovadas.
9. Definir refund total/parcial, chargeback, split e comissão/ledger.
10. Criar reconciliação/runbook/alerta operacional para Order sem QR, split divergente,
    webhook sem conclusão, pago sem ticket e comissão falha.
11. Executar suíte E2E Sandbox: duplicata, fora de ordem, assinatura inválida,
    credencial errada, tenant/ambiente cruzado e concorrência.
12. Cartão, se entrar no escopo, exige chave pública por conta, tokenização/PCI, 3DS,
    parcelamento e homologação de split próprios; não é extensão automática do PIX.

## 16. Decisões manuais necessárias

1. O Asaas deve passar a falhar fechado quando o split obrigatório não puder ser
   comprovado, ou existe política formal de crédito/conciliação posterior?
2. Qual é a política única para estorno parcial: cancelar toda a venda, invalidar
   passageiros/tickets selecionados, ou manter venda paga com ledger compensatório?
3. Como chargeback afeta ticket já embarcado, comissão do representante, sócio e
   Marketplace?
4. Quem executa e aprova refund e como insuficiência de saldo é tratada?
5. Qual SLA e responsável por “pago sem ticket”, comissão falha e split divergente?
6. O ledger financeiro completo dos PRDs será requisito anterior ao PagBank Produção
   ou poderá entrar em fase controlada posterior?
7. Quando e para quais empresas/métodos PagBank poderá ser selecionado em Produção?
8. Cartão PagBank pertence à próxima fase, e qual política de 3DS/parcelamento será
   aprovada?
9. A exposição pública de metadados de readiness de conexões PagBank é intencional ou
   deve ser limitada ao evento/empresa consultado?

## 17. Ordem recomendada das próximas etapas

### Fase 0 — decisões financeiras (sem código)

Fechar fail-open Asaas, reversões, estorno parcial, ticket usado, comissão e ledger.

### Fase 1 — homologação PIX Sandbox existente

Testar quatro splits, ausência/ambiguidade, assinatura, duplicata, timeout, rotação,
consulta e pago sem ticket; registrar evidências sem liberar Produção.

### Fase 2 — fechar gaps operacionais PagBank

Implementar, em tarefa própria e após decisões, estados negativos, cancelamento,
reversões suportadas, reconciliação e diagnóstico. Reutilizar a finalização e nunca
criar fluxo paralelo.

### Fase 3 — endurecer garantias compartilhadas

Eliminar fail-open financeiro aprovado, consolidar plano/snapshot comum e contrato
mínimo de tentativas/status. Mudanças aditivas e testes de não regressão Asaas.

### Fase 4 — piloto controlado PagBank

Revisão de segurança, runbook, alertas, feature gate por empresa, valores baixos e
liberação explícita. Só então alterar travas de Produção.

### Fase 5 — cartão PagBank ou terceiro gateway

Escolher um escopo de cada vez. Reusar os seams comprovados e extrair apenas a
duplicação encontrada durante a implementação real.

## 18. Inventário de evidências principais

| Evidência | Arquivo/símbolo |
|---|---|
| Venda, locks, passageiros e roteamento | `src/pages/public/Checkout.tsx` (`handleSubmit`) |
| Confirmação/polling | `src/pages/public/Confirmation.tsx` |
| Congelamento multi-gateway | migration `20260905150400_...sql`, `freeze_sale_payment_context` e correção `20260905152125_...sql` |
| Default do repasse | migration `20260615093000_add_event_platform_fee_controls.sql` |
| Motor central | `supabase/functions/_shared/platform-fee-engine.ts` |
| Integridade | `supabase/functions/_shared/checkout-financial-integrity.ts` |
| Destinatários Asaas | `_shared/split-recipients-resolver.ts` |
| Adapter split Asaas | `_shared/asaas-split-continuity.ts` |
| Cobrança Asaas | `create-asaas-payment/index.ts` |
| Webhook/reversão Asaas | `asaas-webhook/index.ts` |
| Tentativa e cobrança PagBank | `create-pagbank-payment/index.ts` |
| Split PagBank | `_shared/pagbank/split-plan.ts` e `core.ts` |
| Credenciais/refresh | `_shared/pagbank/credentials.ts` e `crypto.ts` |
| Webhook PagBank | `pagbank-webhook/index.ts` |
| Consulta PagBank | `_shared/pagbank/status-sync.ts` |
| Finalização comum | `_shared/payment-finalization.ts` |
| Reconciliação | `reconcile-sale-payment/index.ts` |
| Observabilidade | `_shared/payment-observability.ts` |
| Termos | `_shared/sale-terms-acceptance.ts` |

## 19. Limites desta auditoria

Esta auditoria demonstra o comportamento do código versionado; não afirma que o
schema remoto contém todas as migrations, que Edge Functions estão publicadas, que
secrets estão presentes, nem que o contrato PagBank habilitou split/webhook. Não
foram feitas cobranças, chamadas com credenciais, alterações remotas ou inspeção de
logs de Produção/Sandbox. Tais provas pertencem à homologação controlada.
