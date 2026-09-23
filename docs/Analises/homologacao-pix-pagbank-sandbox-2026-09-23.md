# Fase 1 — Homologação técnica e financeira do PIX PagBank Sandbox

**Data do corte:** 2026-09-23
**Commit-base inspecionado:** `59dcb79`
**Escopo:** PagBank oficial direto, PIX e Sandbox.
**Natureza:** diagnóstico, testes locais e inventário de evidências. Nenhuma regra,
Edge Function, migration, RLS, tela, secret ou comportamento de produção foi alterado.

> **Follow-up Fase 1.1 — 2026-09-23:** os dois bloqueantes críticos descritos nas
> seções 9 e 10 foram corrigidos posteriormente. O split agora exige equivalência
> integral e o Order recuperado passa pelo mesmo gate da criação normal. Este
> relatório preserva os achados do corte original; a ausência de prova E2E Sandbox
> e os demais riscos continuam válidos.

## 1. Resumo executivo

### Parecer: **NÃO HOMOLOGADO**

O núcleo financeiro foi **comprovado localmente**: a taxa é calculada por passagem,
`6 × R$ 100,00` produz `R$ 36,00`, repasse e absorção preservam a taxa, a taxa
adicional da empresa não muda sua faixa, os quatro cenários distribuem `R$ 6,00`
como `2/2/2`, `3/3/0`, `4/0/2` e `6/0/0`, e o resíduo fica deterministicamente
com a SmartBus. O plano PagBank fecha empresa e participantes em centavos.

Isso **não equivale a uma homologação Sandbox ponta a ponta**. O ambiente recebido
contém apenas configuração pública do Supabase; não contém sessão administrativa,
service role, credenciais PagBank nem `SUPABASE_ACCESS_TOKEN`. Portanto não foi
possível comprovar a empresa de teste, conexão ativa, identidades financeiras,
criar/pagar um PIX, receber webhook real, consultar Order/Split, observar liquidação
ou exercitar rotação/revogação. Nenhuma chamada à API PagBank foi realizada.

Além da ausência de prova externa, a inspeção encontrou dois bloqueantes financeiros:

1. a conciliação aceita uma resposta com todos os recebedores esperados **e um
   recebedor extra**, pois não compara cardinalidade nem soma total ecoada;
2. a recuperação de timeout por `reference_id` promove a tentativa a `succeeded`
   sem repetir a conciliação do split e sem exigir o artefato PIX.

Também há risco concorrente alto na finalização: a rotina testa se já há tickets e
depois faz `insert` sem unicidade de negócio por venda/passageiro. Duas confirmações
simultâneas podem atravessar a verificação antes de qualquer inserção. Essa condição
não foi reproduzida contra banco real e, portanto, é classificada como risco provável,
não como duplicidade observada.

PagBank em Produção continua bloqueado em código e constraints. Asaas não foi alterado.

## 2. Método e limites da prova

### 2.1 Comprovado pelo código e por teste local

- motor progressivo, piso, teto, base individual e resíduo;
- repasse/absorção e taxas adicionais no snapshot de integridade;
- quatro cenários econômicos e tradução para split `FIXED` em centavos;
- chave idempotente estável e decisões puras de retry;
- bloqueio local de Produção;
- assinatura sobre corpo bruto, normalização de status e divergências básicas do split;
- filtros por `company_id`, ambiente, gateway e conexão congelada;
- convergência estática de webhook/polling para a finalização comum.

### 2.2 Comprovado em Sandbox

**Nada nesta sessão.** Não houve chamada à API PagBank, criação de Order, pagamento,
webhook externo ou consulta posterior. Resultados históricos do checkpoint não foram
reclassificados como evidência desta homologação.

### 2.3 Ainda não comprovado

Tudo que depende de conta, credencial, dado remoto ou efeito financeiro externo:
empresa ativa, conexão OAuth/manual conectada, titularidade das contas, capabilities,
Order/Charge/QR reais, split aceito e liquidado, webhook assinado real, timeout real,
pagamento, ticket, comissão, refresh/revogação e isolamento com duas empresas.

O comando `bunx supabase projects list` confirmou a limitação objetiva: não há token
de acesso da plataforma Supabase neste ambiente. Os nomes encontrados no `.env`
foram somente variáveis públicas; nenhum valor foi registrado neste documento.

## 3. Pré-condições

| Pré-condição | Evidência local | Resultado |
|---|---|---|
| Empresa de teste configurada para PagBank Sandbox | Exige leitura remota autenticada; indisponível | **NÃO COMPROVADO — exige validação no ambiente Sandbox** |
| Conexão registrada como `connected` | Tabela e gate existem; estado remoto inacessível | **NÃO COMPROVADO — exige validação no ambiente Sandbox** |
| `company_id` válido | Filtros existem; registro remoto inacessível | **NÃO COMPROVADO — exige validação no ambiente Sandbox** |
| Venda congela empresa/gateway/ambiente/conexão/conta | Trigger copia no `INSERT` e impede alteração posterior | **PASS (código)** |
| Identidade financeira da vendedora | `external_account_id` é exigido no plano; valor remoto inacessível | **NÃO COMPROVADO — exige validação no ambiente Sandbox** |
| Caminho da parcela SmartBus | Secret do account id é exigido quando taxa > 0; configuração remota inacessível | **NÃO COMPROVADO — exige validação no ambiente Sandbox** |
| Credenciais somente no backend | Tokens cifrados ficam na conexão privada e são resolvidos nas Edge Functions | **PASS (código)** |
| Nenhum secret/token exposto | Testes e relatório usam apenas nomes/identificadores fictícios | **PASS** |

## 4. Matriz financeira local

### 4.1 Taxa, repasse e adicional

| Teste | Esperado | Encontrado | Evidência | Resultado |
|---|---|---|---|---|
| `6 × R$ 100` | `6 × R$ 6 = R$ 36` | Seis itens a 6%; total R$ 36 | Teste de homologação + motor | **PASS (local)** |
| Não usar total R$ 600 | Não produzir R$ 24 | R$ 36 difere do item único de R$ 600/R$ 24 | Testes contratuais | **PASS (local)** |
| Repasse ligado, sem adicional | Cliente 106; empresa 100; taxa 6 | 106/100/6 | Teste de homologação | **PASS (local)** |
| Repasse desligado, sem adicional | Cliente 100; empresa 94; taxa 6 | 100/94/6 | Teste de homologação | **PASS (local)** |
| Repasse ligado, adicional R$ 10 | Cliente 116; empresa 110; taxa 6 | 116/110/6 | Teste de homologação | **PASS (local)** |
| Repasse desligado, adicional R$ 10 | Cliente 110; empresa 104; taxa 6 | 110/104/6 | Teste de homologação | **PASS (local)** |
| Adicional não muda faixa | SmartBus continua R$ 6 | Motor recebe somente preço individual R$ 100 | Teste + montagem do handler | **PASS (local)** |
| Piso operacional | Piso total R$ 5 após soma | R$ 4,80 vira R$ 5 | Teste contratual | **PASS (local)** |
| Teto | R$ 25 por item | Um item R$ 1.000 gera R$ 25; dois geram R$ 50 | Teste contratual | **PASS (local)** |
| Resíduo | Sem perda; resíduo SmartBus | Em R$ 5: 1,68/1,66/1,66 | Teste de homologação | **PASS (local)** |

### 4.2 Quatro cenários oficiais

Os valores “enviados” abaixo são os produzidos localmente pelo builder do payload,
com contas fictícias. “Retornado” não foi observado no Sandbox.

| Cenário | Beneficiário econômico esperado | Recebedor técnico local | Empresa (repasse ligado) | Retornado PagBank | Resultado |
|---|---|---|---:|---|---|
| A — SmartBus + sócio + representante | 2/2/2 | Marketplace 200¢; sócio 200¢; representante 200¢ | 10.000¢ | Não observado | **PASS (local) / NÃO COMPROVADO (Sandbox)** |
| B — SmartBus + sócio | 3/3/0 | Marketplace 300¢; sócio 300¢ | 10.000¢ | Não observado | **PASS (local) / NÃO COMPROVADO (Sandbox)** |
| C — SmartBus + representante | 4/0/2 | Marketplace 400¢; representante 200¢ | 10.000¢ | Não observado | **PASS (local) / NÃO COMPROVADO (Sandbox)** |
| D — somente SmartBus | 6/0/0 | Marketplace 600¢ | 10.000¢ | Não observado | **PASS (local) / NÃO COMPROVADO (Sandbox)** |

Para os quatro cenários, a conservação local foi exatamente `10.600¢`. Com repasse
desligado, a mesma taxa de `600¢` resulta em `9.400¢` para a empresa sobre `10.000¢`.
A conta técnica da plataforma representa o beneficiário SmartBus; a conta da empresa
recebe seu líquido; sócio e representante só aparecem quando elegíveis. Liquidação,
tarifas do provedor e obrigação de repasse fora do split não foram observadas.

## 5. Matriz funcional completa

| Área/teste | Esperado | Encontrado | Resultado |
|---|---|---|---|
| Venda/empresa corretas | Venda e empresa correlacionadas | Queries e updates usam `sale.id` + `company_id`; sem dado remoto | **PASS (código)** |
| Ambiente congelado | Somente ambiente da venda | Credential resolver parte de `sale.payment_environment` | **PASS (código)** |
| Produção bloqueada | Nenhuma criação PagBank Produção | Allowlist contém só Sandbox + constraints de empresa/venda | **PASS (código)** |
| Sem fallback Sandbox→Produção | Falhar fechado | Base URL vem do ambiente já validado | **PASS (código)** |
| Método | Somente PIX | Handler recusa método diferente de `pix` | **PASS (código)** |
| Reference | ID da venda | `reference_id = sale.id` no Order/Charge | **PASS (código)** |
| Idempotency key | Estável por operação lógica | empresa+venda+gateway+ambiente+operação | **PASS (local)** |
| Persistência antes do POST | Barreira local | `payment_attempts` é inserida antes da chamada e chave é `UNIQUE` | **PASS (código)** |
| Duplo clique | Não criar duas cobranças | Corrida no insert termina em conflito; pendente recente aguarda | **PASS (código), NÃO COMPROVADO E2E** |
| Timeout após envio | Consultar antes de recriar | Marca `indeterminate` e consulta por `reference_id` | **PASS (código), NÃO COMPROVADO E2E** |
| Order conhecido | Reutilizar/consultar | `succeeded` consulta; falha com Order exige reconciliação | **PASS (código)** |
| Recuperação após timeout | Revalidar cobrança inteira | Recupera Order, mas não reconcilia split nem exige QR | **FAIL** |
| Retentativa concorrente | Uma cobrança | UNIQUE local + chave remota estável; provedor não exercitado | **PASS (código), NÃO COMPROVADO E2E** |
| Payload e criação Order/Charge | Valor, expiração, split e QR corretos | Montagem estática coerente; resposta real não observada | **NÃO COMPROVADO** |
| QR/copia-e-cola/expiração | Artefato real persistido | Extração/persistência existem; Sandbox não observado | **NÃO COMPROVADO** |
| IDs externos | Order/Charge persistidos | Campos e updates existem; Sandbox não observado | **NÃO COMPROVADO** |
| Split ausente | Bloquear quando esperado | Criação normal bloqueia | **PASS (local)** |
| Recebedor diferente | Bloquear | Bloqueia | **PASS (local)** |
| Valor diferente | Bloquear | Bloqueia | **PASS (local)** |
| Soma/recebedor extra | Bloquear | Recebedor extra de 1¢ é aceito como `confirmed` | **FAIL** |
| Resposta incompleta | Não disponibilizar cobrança | Sem split/QR bloqueia na criação normal; recovery é lacunoso | **FAIL** |
| Webhook endpoint | Endpoint PagBank próprio | `/functions/v1/pagbank-webhook` | **PASS (código)** |
| Assinatura | Corpo bruto + token correto | SHA-256 `{token}-{rawBody}`; alterações/missing rejeitados localmente | **PASS (local), NÃO COMPROVADO E2E** |
| Corpo como prova | Não finalizar só pelo evento | Webhook sempre chama consulta de Order | **PASS (código)** |
| Correlação webhook | Venda PagBank correta | `reference_id` UUID + gateway; conexão filtrada por venda/empresa | **PASS (código)** |
| Evento inválido/venda inexistente/gateway diferente | Não finalizar | JSON inválido=400; não casado=202 sem efeito | **PASS (código)** |
| Deduplicação | Evento repetido sem efeito duplicado | Chave conta+ambiente+charge/status; concluído é ignorado | **PASS (código), NÃO COMPROVADO concorrente** |
| Evento incompleto repetido | Reprocessar | `completed_at` ausente incrementa tentativa e reprocessa | **PASS (código)** |
| Evento fora de ordem | Não rebaixar pago | Só `PAID` finaliza; estados não pagos não alteram venda | **PASS (código), NÃO COMPROVADO E2E** |
| Polling | Mesmo Order/conexão/finalização | `verify-payment-status` chama `syncPagbankSaleStatus`; não cria | **PASS (código)** |
| `PAID` | Finalização central | Somente `paid` chama `finalizeConfirmedPayment` | **PASS (código), NÃO COMPROVADO E2E** |
| `payment_confirmed_at` | Persistir uma vez | Update condicional usa timestamp confirmado; corrida não observada | **PASS (código), NÃO COMPROVADO E2E** |
| Ticket único sequencial | Não duplicar | Reprocessamento após ticket existente é ignorado | **PASS (código)** |
| Ticket único concorrente | Não duplicar | Check-then-insert sem constraint de negócio identificada | **NÃO COMPROVADO / risco alto** |
| Comissão | Uma por venda aplicável | RPC após ticket; constraint única por `sale_id` | **PASS (código), NÃO COMPROVADO E2E** |
| Locks | Limpar após ticket | Delete por `sale_id`; falha vira warning auditável | **PASS (código), NÃO COMPROVADO E2E** |
| Pago sem ticket | Detectar, retry e reconciliar | Retry imediato, incidente e `reconcile-sale-payment` documentado | **PASS (código), NÃO COMPROVADO E2E** |
| Snapshot financeiro | Preservar decisão | Gravado após criação; erro de persistência só gera incidente | **PARCIAL** |
| Falha ao consultar taxa adicional | Falhar de modo explícito | Erro de `event_fees` é descartado e pode virar erro genérico | **FAIL (diagnóstico)** |

## 6. Estados negativos

| Estado | Classificação atual | Evidência |
|---|---|---|
| `failed`/`DECLINED` | **Parcialmente implementado** | Normaliza/persiste na tentativa, mas sync devolve `pending` e não transiciona a venda |
| `canceled` | **Parcialmente implementado** | Normaliza/persiste, sem cancelamento/cleanup local |
| `expired` | **Ausente** | Sem mapeamento/transição específicos |
| refund total | **Ausente** | Sem operação ou convergência PagBank |
| partial refund | **Ausente** | Sem operação, split reverso ou ledger |
| dispute | **Ausente** | Sem estado/tratamento |
| chargeback | **Ausente** | Sem estado/tratamento |

Nenhum desses estados foi provocado no Sandbox nesta sessão. Sua implementação
pertence à fase posterior e não foi criada aqui.

## 7. Segurança, credenciais e multiempresa

### Evidência positiva estática

- conexão é carregada por `id + company_id + gateway`;
- criação exige conexão corrente e `connected`; consulta pode usar conexão antiga
  da mesma identidade após rotação;
- ambiente da conexão precisa coincidir com o ambiente congelado da venda;
- token é decifrado somente no backend e não aparece na resposta pública;
- refresh usa controle otimista por `credential_generation`;
- falha de refresh marca conexão em erro e exige reconexão;
- trigger congela `company_id`, gateway, ambiente, conexão e conta;
- nenhuma rotina PagBank faz fallback para Asaas ou Produção.

### Testes negativos ainda necessários

Não foi possível provar com empresas A/B reais: conexão cruzada, Order de outro
tenant, token de conta diferente, webhook de outra conta, rotação durante venda,
conexão substituída, credencial revogada ou refresh concorrente. Todos ficam como
**NÃO COMPROVADO — exige validação no ambiente Sandbox**.

### Participantes

- ausência legítima de sócio/representante seleciona outro cenário e segue;
- ambiguidade do sócio e erro de consulta bloqueiam a criação;
- erro de consulta do representante bloqueia;
- conta Marketplace/SmartBus devida e ausente bloqueia no builder;
- conta PagBank ausente em sócio/representante cadastrado é tratada como ausência,
  com warning. A adequação dessa distinção à obrigação econômica precisa ser
  conferida com dados reais dos participantes da homologação; não há prova de
  conciliação/obrigação externa nesta sessão.

## 8. Beneficiário econômico × recebedor técnico

| Beneficiário | Direito no cenário A | Recebedor técnico montado | Enviado | Retornado | Obrigação posterior |
|---|---:|---|---|---|---|
| Empresa vendedora | R$ 100,00 | conta congelada da empresa | 10.000¢ local | Não observado | Nenhuma demonstrada |
| SmartBus | R$ 2,00 | conta Marketplace do backend | 200¢ local | Não observado | Não avaliada |
| Sócio | R$ 2,00 | conta Sandbox resolvida do sócio | 200¢ local | Não observado | Não avaliada |
| Representante | R$ 2,00 | conta Sandbox do representante vinculado | 200¢ local | Não observado | comissão interna após pagamento; liquidação externa não observada |

Esta tabela não afirma que o PagBank aceitou, liquidou ou tarifou esses valores.

## 9. Gaps encontrados

### Crítico — conciliação aceita recebedor extra/soma ecoada diferente

- **Esperado:** conjunto, cardinalidade, valores e soma retornados devem coincidir
  exatamente com o plano enviado.
- **Encontrado:** `reconcilePagbankSplit` procura cada esperado no eco, mas não exige
  `echoed.length === expected.length` nem soma ecoada igual ao total. Um terceiro
  recebedor inesperado de 1¢ passa como `confirmed`.
- **Causa comprovada:** validação unilateral do subconjunto esperado.
- **Arquivos:** `_shared/pagbank/core.ts`, `create-pagbank-payment/index.ts`.
- **Correção recomendada:** comparar multiconjunto completo, rejeitar duplicados/
  extras/nulos e validar soma ecoada contra `splitPlan.totalCents`, com testes.

### Crítico — recuperação por referência não repete gates financeiros

- **Esperado:** Order recuperado após timeout só pode ser reutilizado depois de
  provar split e artefato PIX.
- **Encontrado:** o ramo `indeterminate` usa o primeiro resultado, grava `succeeded`
  e retorna sem `reconcilePagbankSplit` e sem exigir `qrText`.
- **Causa comprovada:** gates existem apenas no caminho imediatamente posterior ao POST.
- **Arquivos:** `create-pagbank-payment/index.ts`.
- **Correção recomendada:** reutilizar uma única rotina de validação/persistência do
  Order tanto no POST quanto na recuperação/consulta, sem criar novo Order.

### Alto — geração concorrente de tickets não está comprovadamente serializada

- **Esperado:** webhook e polling simultâneos produzem exatamente um conjunto de tickets.
- **Encontrado:** update da venda é condicional, mas ambas as execuções seguem para
  `count tickets → select staging → insert`; não foi localizada unicidade por
  venda/passageiro que feche a corrida.
- **Causa provável:** idempotência por leitura prévia (TOCTOU), sem RPC transacional
  ou chave única de negócio demonstrada.
- **Arquivos:** `_shared/payment-finalization.ts`, migrations da tabela `tickets`.
- **Correção recomendada:** em tarefa própria, caracterizar a corrida em banco e,
  se confirmada, serializar/upsert por identidade imutável do passageiro da venda.

### Alto — status negativos não convergem a estado operacional

- **Esperado:** estados externos negativos têm tratamento explícito.
- **Encontrado:** `failed/canceled` são normalizados, porém todos os não pagos voltam
  como `pending`; demais reversões estão ausentes.
- **Correção recomendada:** próxima fase específica, após decisão de produto para
  expiração/reversões/chargeback. Não corrigir junto da homologação PIX positiva.

### Médio — erro ao consultar taxas adicionais é mascarado

- **Esperado:** falha de consulta impede decisão financeira com diagnóstico próprio.
- **Encontrado:** o handler ignora o objeto `error` de `event_fees` e usa lista vazia,
  podendo terminar em inconsistência genérica.
- **Correção recomendada:** falhar fechado com código/log específico, preservando a venda.

### Médio — snapshot local pode falhar depois da criação externa

- **Esperado:** cobrança utilizável possui snapshot persistido e reconciliável.
- **Encontrado:** falha no update do snapshot gera incidente, mas a resposta de PIX
  ainda é devolvida como sucesso.
- **Correção recomendada:** decidir política de reconciliação/bloqueio em tarefa
  financeira própria; não apagar a cobrança externa.

## 10. Bloqueantes da próxima fase

Antes de declarar esta fase homologada ou iniciar cartão, são necessários:

1. corrigir a comparação integral e soma do split ecoado;
2. aplicar os mesmos gates ao Order recuperado após timeout;
3. comprovar/corrigir a atomicidade da geração de tickets sob webhook + polling;
4. executar o roteiro Sandbox real abaixo com credenciais e duas empresas isoladas.

Estados negativos continuam importantes, mas pertencem à fase seguinte já prevista;
não são justificativa para mascarar a falta de prova do fluxo PIX positivo.

## 11. Evidências E2E ainda necessárias

Em ambiente Sandbox autorizado, preservar evidência sanitizada de:

1. empresa PagBank Sandbox, conexão `connected`, contas distintas da empresa e SmartBus;
2. quatro Orders PIX (cenários A–D), com request sanitizado e IDs Order/Charge/Split;
3. consulta posterior demonstrando os mesmos recebedores, valores e soma;
4. repasse ligado/desligado e adicional de R$ 10, com conferência de liquidação;
5. pagamento de teste, webhook real válido, consulta autoritativa, venda paga,
   timestamp, tickets, comissão, locks e logs;
6. assinatura inválida, token errado, duplicata e evento fora de ordem;
7. polling sem webhook e polling simultâneo ao webhook;
8. timeout antes/depois do aceite e busca por `reference_id` sem segundo Order;
9. duas empresas A/B, tentativa de conexão/Order/webhook cruzados;
10. access token expirado, refresh concorrente, rotação da mesma conta, substituição
    por outra conta e revogação;
11. falha induzida de ticket e execução de `reconcile-sale-payment` sem duplicação;
12. expiração/recusa/cancelamento apenas para caracterizar a fase seguinte.

Nenhum payload bruto sensível, QR completo, token, secret ou chave deve entrar na evidência.

## 12. Testes e checks executados

| Comando | Resultado | Leitura correta |
|---|---|---|
| `bun install --frozen-lockfile` | 605 pacotes instalados | Dependências locais disponíveis; nenhum lockfile versionado mudou |
| testes focados existentes (10 arquivos) | 136/136 passaram | Prova local de taxa, integridade, distribuição, PagBank, ambiente e contratos Asaas relacionados |
| `npm test -- --run src/lib/pagbankSandboxHomologation.test.ts` | 16/16 passaram | Prova local dos exemplos obrigatórios e caracterização explícita da lacuna do recebedor extra |
| `bunx supabase projects list` | Sem token de acesso | Limitação de ambiente; não prova nem reprova o Sandbox remoto |

Na execução original, o teste com recebedor extra congelava o retorno incorreto
`confirmed`. Na Fase 1.1 ele passou a exigir a rejeição e a conferir conjuntamente
cardinalidade, recebedor inesperado e soma divergente. A matriz acima permanece como
registro histórico do **FAIL** que motivou a correção.

## 13. Próxima tarefa recomendada

**Menor tarefa possível:** corrigir exclusivamente a validação de Order PagBank para
que uma função comum imponha igualdade exata de recebedores, valores, cardinalidade,
soma e artefato PIX tanto após o POST quanto na recuperação por `reference_id`.

Essa tarefa deve adicionar testes negativos para recebedor extra/duplicado, soma
extra/insuficiente, campos nulos e Order recuperado incompleto. Não deve tocar Asaas,
frontend, banco, Produção, cartão ou reversões. Depois dela, executar a homologação
manual Sandbox positiva antes de avançar de fase.
