# PagBank no SmartBus — checkpoint e auditoria técnica final

> Auditoria documental concluída em 2026-09-01, na branch local
> `feature/pagbank-integration`. Nenhum código funcional, banco, migration, RLS,
> Edge Function, credencial ou comportamento do Asaas foi alterado.

## 1. Resumo executivo e gate

**Resultado:** a criação de Checkout/Payment Link com PIX e cartão é tecnicamente
plausível, mas a integração **não está liberada para implementação**. A evidência
disponível não fecha os gates de split, idempotência de criação, autenticação e
replay de webhook, onboarding de todos os recebedores, estorno e chargeback.

## PODE INICIAR IMPLEMENTAÇÃO?

**NÃO**

Bloqueios exatos:

1. homologar, com contas reais elegíveis, os quatro cenários financeiros
   SmartBus em PIX e cartão/parcelamento, incluindo arredondamento, rejeição de
   recebedor, liquidação e consulta do split;
2. obter contrato/documentação vinculante da PB Integrações sobre idempotência
   de `POST /orders` e `POST /checkouts`, ou aprovar posteriormente uma estratégia
   que elimine a janela de timeout pós-criação sem cobrança duplicada;
3. aprovar autenticação, anti-replay, retries e deduplicação do webhook: o material
   disponível recomenda apenas segredo curto na URL e consulta posterior;
4. comprovar onboarding, elegibilidade, rotação/revogação e obtenção de `account.id`
   para empresa, Marketplace, sócio e representante, por tenant e ambiente;
5. obter contrato operacional da PB Integrações (papel jurídico/técnico, SLA,
   suporte, custos, suboperadores, retenção/trânsito de dados e saída/portabilidade);
6. decidir política SmartBus para chargeback e aprovar o efeito de
   `charge_transfer.percentage`, estornos total/parcial e valores já liquidados;
7. validar em sandbox e em piloto de produção que Checkout hospedado aceita split
   obrigatório; o corpus demonstra split em **Orders**, não no Checkout hospedado;
8. aprovar, em tarefa de dados/segurança separada, a persistência mínima de gateway,
   ambiente, credencial usada e IDs externos por venda, sem executar migration aqui.

Contagem da matriz final: **5 `COMPATÍVEL`**, **16 `ADAPTAÇÃO NECESSÁRIA`**,
**3 `CAPABILITY GAP`**, **4 `DECISÃO AINDA NECESSÁRIA`** e **1 `NÃO APLICÁVEL À
PRIMEIRA FASE`** (29 responsabilidades).

## 2. Método, escopo e qualidade da evidência

Foram cruzados o código e migrations atuais, as referências obrigatórias das duas
Skills, exemplos instalados e URLs oficiais nelas indicadas. Em 2026-09-01, o
ambiente recebeu HTTP 403 ao tentar acessar diretamente páginas do PagBank e da
PB Integrações; portanto, conteúdo não presente no repositório não foi tratado
como confirmado. A Skill é material técnico útil, mas não é contrato nem fotografia
infalível do provedor.

Hierarquia usada:

1. regra aprovada/normativa SmartBus;
2. código real para descrever o Asaas atual;
3. documentação oficial PagBank referenciada pela Skill;
4. documentação/Skill da PB Integrações para comportamento específico da camada;
5. hipótese, sempre marcada como pendente.

Fontes externas registradas para revalidação humana:

- PagBank: [Checkout](https://developer.pagbank.com.br/docs/checkout),
  [Orders](https://developer.pagbank.com.br/reference/criar-pedido),
  [split](https://developer.pagbank.com.br/reference/divisao-de-pagamento) e
  [taxas/parcelas](https://developer.pagbank.com.br/reference/calcular-taxas);
- PB Integrações: [site](https://pbintegracoes.com/),
  [termos](https://pbintegracoes.com/terms/),
  [autorização](https://pbintegracoes.com/connect/autorizar/) e
  [suporte](https://ajuda.pbintegracoes.com/hc/pt-br/requests/new).

## 3. Natureza da PagBank Connect / PB Integrações

**Classificação: `DECISÃO AINDA NECESSÁRIA`.**

- Não é integração direta: o SmartBus enviaria Bearer Connect Key, dados do
  comprador, itens, valores, recebedores, cartão criptografado/3DS e URLs de
  notificação a `https://ws.pbintegracoes.com/pspro/v7/`; a camada então acessa
  recursos PagBank. Endpoints `connectInfo`, `accountId` e a própria Connect Key
  são específicos da intermediária.
- A afirmação “parceiro oficial desde 2014” e “gratuita” consta da Skill fornecida,
  mas não pôde ser validada contra contrato/termos nesta sessão. “Gratuita” não
  prova ausência de tarifas PagBank, mudança futura de preço ou custo de suporte.
- Dependências adicionais: disponibilidade, segurança, política de dados,
  compatibilidade de payload, renovação da autorização, suporte e continuidade
  da PB Integrações. A mesma key que cria deve consultar, elevando lock-in
  operacional e exigindo guardar a versão efetiva da credencial.
- O tráfego inclui dados pessoais e financeiros. PAN não deve trafegar em claro;
  cartão é criptografado com public key e 3DS ocorre no browser, mas metadados da
  compra e identificadores passam pela intermediária.
- Sandbox e produção usam Connect Keys distintas no mesmo host intermediário.
  Pedidos sandbox não aparecem no painel PagBank e a consulta de split sandbox
  documentada troca para host interno PagBank sem Bearer — diferença relevante
  para diagnóstico e evidência de paridade.
- É possível modelar várias keys por empresa/ambiente, mas a recomendação simples
  de uma única variável `PAGBANK_CONNECT_KEY` **não serve** ao SmartBus multiempresa.
- Alternativa a comparar: API oficial PagBank direta, com credenciais/autorização
  e contrato marketplace oficiais. Não escolher uma das abordagens antes de obter
  respostas contratuais, SLA e homologação financeira equivalentes.

Conclusão: **adequação ainda não comprovada**. A camada reduz trabalho de conexão,
mas acrescenta terceiro crítico, lock-in da key e pontos cegos incompatíveis com
liberação financeira imediata.

## 4. Produtos: Payment Link, Checkout e Orders

**Classificação geral: `ADAPTAÇÃO NECESSÁRIA`.**

- **Checkout** é o recurso hospedado criado por `POST connect/ws/checkouts`; sua
  resposta tem `CHEC_...` e link `rel=PAY`. Aceita `CREDIT_CARD` e `PIX`, URL de
  retorno, uma notification URL de até 100 caracteres, expiração opcional,
  ativação/inativação, consulta e configuração de parcelas.
- **Payment Link** é a experiência/URL `PAY` produzida pelo Checkout, não um quarto
  contrato independente no material analisado.
- **Orders** (`ORDE_...`) é a API de pedido/cobrança usada para PIX direto, cartão
  criptografado e split em `charges[].splits` ou `qr_codes[].splits`. Checkout pode
  listar `orders[]` posteriormente, mas isso não torna os payloads equivalentes.
- A primeira fase aprovada pede checkout hospedado. A evidência de split instalada
  demonstra Orders, não split dentro de `POST /checkouts`. Trocar silenciosamente
  para cartão/PIX direto violaria a decisão de escopo. Esse conflito é bloqueante.
- Correlação por `reference_id`, consulta por ID e recuperação pelo ID persistido
  são possíveis. Não há prova de busca/listagem por `reference_id` nem de sua
  unicidade; ele não resolve sozinho timeout pós-criação.

## 5. Split financeiro — gate crítico

**Classificação: `CAPABILITY GAP` até homologação.**

O SmartBus calcula valores fixos em centavos para preservar taxa, mínimo, teto,
Marketplace, sócio global, representante, snapshot e ledger. Orders documenta
split `FIXED`, múltiplos `receivers`, `account.id`, valor por recebedor e consulta
posterior por `SPLI_...`. Conceitualmente isso pode representar empresa + até três
destinos. Contudo, não há prova de produção de que:

- quatro recebedores são aceitos para a mesma cobrança e todos são elegíveis;
- o Checkout hospedado da primeira fase carrega o split;
- PIX e cartão parcelado preservam exatamente os valores, arredondamento e taxa;
- limites/mínimos, prazo de liquidação e reação a recebedor inexistente/inválido
  atendem aos quatro cenários oficiais;
- todos os destinatários conseguem `ACCO_...` nos dois ambientes;
- consulta sandbox pelo host `internal.sandbox.api.pagseguro.com`, sem Bearer, é
  aceitável para segurança, rastreabilidade e paridade operacional.

O payload exige que a soma dos recebedores seja igual ao cobrado. Isso sugere que
a empresa vendedora também deve aparecer como recebedora, diferentemente do Asaas,
onde o não dividido permanece na conta emissora. `PRIMARY`, `SECONDARY`, `liable`,
custódia e `charge_transfer.percentage` não são equivalentes automáticos a wallet
ou às regras SmartBus.

### Casos obrigatórios a homologar sem alterar a regra

| Sócio elegível | Representante elegível | Destino da taxa SmartBus | Resultado PagBank |
|---|---|---|---|
| sim | sim | Marketplace 1/3; sócio 1/3; representante 1/3 | Não comprovado |
| sim | não | Marketplace 1/2; sócio 1/2 | Não comprovado |
| não | sim | Marketplace 2/3; representante 1/3 | Não comprovado |
| não | não | Marketplace 100% | Não comprovado |

Em todos, o saldo comercial da passagem pertence à empresa. Ausência comprovada
de sócio/representante aplica a regra SmartBus; erro/ambiguidade do provedor não
pode ser tratado como ausência. Nenhuma liberação para produção antes dos testes.

## 6. Onboarding, recebedores e credenciais

**Onboarding: `CAPABILITY GAP`. Credenciais: `ADAPTAÇÃO NECESSÁRIA`.**

- Produção oferece uma URL PB Integrações de “autorizar”; sandbox oferece outra.
  O corpus não documenta callback seguro, `state`, vínculo do tenant, criação de
  conta, escopos, consentimento, revogação programática ou retorno automático ao
  SmartBus. Portanto, onboarding guiado end-to-end não está comprovado.
- Alternativa comprovada apenas em nível básico: obter Connect Key fora do sistema,
  inseri-la manualmente no backend e validar com `GET connect/connectInfo`.
  `VALID`, `INVALID`, `UNKNOWN`, `UNAUTHORIZED`, `isSandbox`, `accountId` e e-mail
  mascarado ajudam validação. `expiresAt` e renovação automática são descritos,
  mas rotação/revogação e histórico precisam de contrato.
- `GET connect/accountId?email=...` ou `connectInfo.accountId` obtêm identificador,
  mas não provam elegibilidade para receber split. E-mail não deve ser usado como
  prova de ownership.
- Empresa, Marketplace, sócio e representante precisam de autorização e
  `account.id` próprios por ambiente. Nenhum deles pode completar dados do ambiente
  oposto.
- Desenho seguro posterior: cofre backend por `company_id + gateway + environment
  + credential_version`; envelope encryption/KMS; acesso service-role mínimo;
  nunca frontend/log; auditoria de autor, validação, rotação e revogação. A venda
  deve guardar referência não secreta da versão usada, pois a mesma key cria e
  consulta o recurso.
- `isSandbox` valida coerência, mas `sales.payment_environment` continua sendo a
  fonte SmartBus. Divergência deve falhar fechada, nunca trocar ambiente.

## 7. Webhook e fallback

**Classificação: `CAPABILITY GAP` para segurança; consulta fallback é compatível.**

O material informa POST do pedido atualizado na única `notification_urls`,
correlação por `reference_id`/`ORDE_...`, resposta rápida 200 e consulta ativa com
a mesma key. Não documenta assinatura criptográfica do corpo, header autenticado,
timestamp/nonce, política de retries, backoff, timeout, ordenação ou garantia de
event ID. Recomenda hash/token na própria URL, limitada a 100 caracteres.

Logo, é possível preservar **“webhook prioritário + consulta como fallback”**, mas
somente após desenho aprovado:

1. rota curta e segredo por tenant/ambiente, armazenado apenas no backend;
2. correlação do ID externo com venda, gateway, tenant e ambiente persistidos;
3. consulta autenticada do recurso antes de qualquer transição financeira;
4. validação de valor/moeda/reference/status e transição monotônica;
5. dedup por hash canônico/ID externo+status+timestamp local enquanto não houver ID
   de evento confiável, com tolerância a duplicados, atraso e fora de ordem;
6. convergência em `finalizeConfirmedPayment`, sem segundo emissor de tickets.

Esse desenho reduz spoof/replay, mas não substitui autenticação nativa comprovada;
por isso continua bloqueado para implementação.

## 8. Idempotência de criação

**Classificação: `CAPABILITY GAP`.**

No corpus não há header/chave nativa de idempotência, garantia de unicidade de
`reference_id`, busca por referência nem semântica de retry. Consulta exige ID,
que pode não chegar após timeout. Trava local evita cliques concorrentes antes da
requisição, mas não prova se o primeiro POST criou a cobrança. Retentar o POST pode
duplicar; não retentar pode abandonar uma cobrança real.

Antes do código, o provedor deve confirmar por escrito chave idempotente, janela,
replay da mesma resposta, escopo e consulta por referência, ou Produto/Financeiro/
Segurança devem aprovar outra estratégia comprovadamente segura. `reference_id =
sale.id` é correlação, não idempotência sem garantia contratual.

## 9. Gateway de origem e evolução mínima de dados (sem migration)

Hoje `sales` congela `payment_environment`, mas usa `asaas_payment_id`,
`asaas_payment_status` e URLs/diagnóstico específicos. Vendas manuais possuem fluxo
separado de taxa; permanecem fora da primeira fase.

Alternativas avaliadas:

1. **Adicionar colunas PagBank paralelas:** menor alteração imediata, mas duplica
   lógica e não fixa a ausência de gateway de origem. Não recomendada.
2. **Colunas mínimas na venda:** `payment_gateway`, `payment_external_id`,
   `payment_external_status`, `payment_external_url` e referência da credencial,
   mantendo `asaas_*` legados. É a menor evolução segura para novas vendas; vendas
   existentes com `asaas_payment_id` teriam origem Asaas em backfill explícito e
   revisado, nunca inferência runtime silenciosa.
3. **Tabela de cobranças:** melhor histórico de tentativas e múltiplos IDs, porém
   maior escopo. Só se a modelagem de retry/reconciliação exigir múltiplos recursos.

**Recomendação para decisão futura:** opção 2, com constraint de gateway/ambiente e
imutabilidade após criação externa; considerar tabela somente se o contrato de
idempotência exigir. Logs/dedup recebem dimensão `provider`, mas estruturas Asaas
permanecem até migração controlada. Nenhuma alteração de schema foi feita.

## 10. Matriz de status PagBank → SmartBus

Mapeamento conservador; preservar status externo bruto. Os exemplos instalados
comprovam principalmente `PAID`, `WAITING` e recusas em charges/QR codes. Estados
sem contrato completo ficam sem transição automática.

| Evento/status PagBank | Significado | Estado SmartBus | Ação SmartBus |
|---|---|---|---|
| Checkout `ACTIVE` / Order criado | recurso criado, não pago | `reservado`/pendente atual | guardar ID/link; não emitir ticket |
| Charge/QR `WAITING` ou pendente/new | aguardando comprador/compensação | `reservado`/pendente | manter locks dentro da política; consultar |
| Charge `PAID` | pagamento confirmado | `pago` | validar consulta, valor, tenant e ambiente; finalização comum |
| `DECLINED` (bank/PagBank) | cartão recusado | não pago | guardar motivo sanitizado; permitir ação segura sem recriar às cegas |
| expiração do Checkout/QR | prazo encerrado | `cancelado` somente se regra atual autorizar | liberar locks de forma idempotente; não emitir ticket |
| Checkout `INACTIVE` | link inativado | sem transição automática | registrar; distinguir de pagamento cancelado |
| `CANCELED`/cancelamento pré-pago | cobrança cancelada | `cancelado` se confirmado | validar estado externo e liberar locks |
| refund total | valor devolvido após pago | fluxo de reversão atual | invalidar operacionalmente conforme regra existente; não prometer split |
| refund parcial | devolução parcial | sem novo estado automático | incidente/revisão manual; política pendente |
| chargeback/dispute | contestação compulsória | sem novo estado final automático | marcar risco/incidente; bloquear decisão até política |
| status desconhecido/futuro | sem semântica aprovada | manter estado | log bruto, consulta e alerta; nunca marcar pago |

## 11. Chargeback, cancelamento e estorno

### Chargeback — `DECISÃO AINDA NECESSÁRIA`

Split aceita configuração `charge_transfer.percentage` por recebedor e `liable`,
o que prova configurabilidade, não o efeito operacional completo. Não foi
confirmado como a disputa nasce, eventos/status, reserva, contestação, débito após
liquidação, saldo negativo, efeito sobre Marketplace ou diferenças PIX/cartão.
PIX normalmente não deve ser presumido como chargeback de cartão, mas fraude ou
devolução não autorizam concluir “risco zero”.

Alternativas a decidir após resposta formal: Marketplace absorver, secundário
absorver, rateio proporcional, custódia/reserva, ou bloqueio do meio/cenário. Cada
uma muda risco financeiro e não será escolhida nesta auditoria.

### Cancelamento/estorno — `DECISÃO AINDA NECESSÁRIA`

A consulta de split expõe `amount.refunded`, inclusive por recebedor, evidenciando
que refund pode alcançar parcelas distribuídas. Não há prova suficiente de como
refund parcial/total é rateado nem se é possível preservar automaticamente a taxa
SmartBus. Assim, nenhuma operação automática deve ser liberada. A regra aprovada
permanece: desistência voluntária não devolve automaticamente a taxa; chargeback
compulsório é análise separada.

## 12. Sandbox versus produção

**Classificação: `ADAPTAÇÃO NECESSÁRIA`.**

| Tema | Sandbox | Produção | Consequência |
|---|---|---|---|
| Base Connect | mesmo `ws.pbintegracoes.com/pspro/v7/` | mesma | key decide na camada; SmartBus continua decidindo antes |
| Credencial | prefixo `CONSANDBOX`, `isSandbox=true` | Connect Key produção | guardar por tenant/ambiente e validar divergência |
| Painel | pedidos/checkouts não aparecem | podem aparecer | sandbox exige diagnóstico API próprio |
| Orders/Checkout | endpoints equivalentes no corpus | equivalentes | paridade funcional ainda requer teste |
| Split GET | host interno PagBank, sem Bearer | proxy Connect, com Bearer | assimetria operacional e de segurança |
| Webhook | notificações a testar | notificações a homologar | retries/assinatura não comprovados em nenhum |

Não existe fallback cruzado. Venda histórica usa seu ambiente e sua versão de
credencial. O sandbox não é prova suficiente de painel, liquidação, chargeback,
SLA ou comportamento de split em produção.

## 13. Auditoria do Asaas atual

| Componente atual | Responsabilidade | Específico Asaas? | Pode ser reutilizado? | Risco de alterar |
|---|---|---:|---:|---|
| `Checkout.tsx` | venda, passageiros, locks, ambiente e invocação | Parcial | sim, até o seam de criação | alto |
| `create-asaas-payment` | relê contexto, taxa, split, cria e persiste | sim no adapter; regras centrais não | engines/resolvers sim | crítico |
| `payment-context-resolver.ts` | tenant, ambiente, credenciais Asaas | parcial | conceito sim, implementação por provider | alto |
| `platform-fee-engine.ts` | taxa/mínimo/teto/distribuição | não | integralmente | crítico; não mudar fórmula |
| `split-recipients-resolver.ts` | sócio/representante e wallets | parcial | elegibilidade sim; IDs não | crítico |
| `asaas-split-continuity.ts` | payload/fallback específico | sim | não para PagBank | crítico |
| `asaas-webhook` | autenticação, dedup, estados, reversão | sim na entrada | somente seam para finalização/log | crítico |
| `verify-payment-status` | consulta fallback | sim | padrão, com adapter | alto |
| `payment-finalization.ts` | convergência, locks e tickets | pouco; ainda lê campos Asaas | sim após mudança mínima | crítico |
| `get-asaas-payment-link` | recuperar cobrança/link | sim | padrão por provider | médio/alto |
| `reconcile-sale-payment` | pago sem ticket | parcial | sim, preservando guards | crítico |
| `Company.tsx`/wizard | configuração/onboarding | sim | layout/área sim | alto |
| `SalesDiagnostic.tsx`/observabilidade | suporte, logs, divergências | fortemente | estrutura com `provider` sim | alto |
| `sales` e dedup/logs | âncora, ambiente, IDs e eventos | parcial/forte | venda/log genérico parcialmente | crítico |

Não tocar inicialmente na engine financeira, resolução normativa, finalização de
tickets, fluxo de venda manual ou tratamento Asaas. Seams incrementais: escolha do
provider na empresa; gateway congelado na venda; factory de criação/consulta/link;
entrada de webhook por provider convergindo na finalização; dimensões provider em
logs e diagnóstico. Isso permite futuro Mercado Pago/PayPal sem plugin framework.

## 14. Matriz final de capacidades

| Responsabilidade SmartBus | Asaas atual | PagBank comprovado | Classificação | Adaptação necessária | Evidência | Bloqueio |
|---|---|---|---|---|---|---|
| Configuração | `/admin/empresa`, por ambiente | valida Connect Key | ADAPTAÇÃO NECESSÁRIA | seletor e configuração por provider | `connectInfo`; código Company | não |
| Ambiente | congelado na venda | `isSandbox`, keys separadas | ADAPTAÇÃO NECESSÁRIA | SmartBus governa; validar key | refs 01/02; resolver atual | não |
| Onboarding | cria/vincula subconta | URL de autorização, fluxo incompleto | CAPABILITY GAP | callback/state/revogação/contas | refs 01/official-links | **sim** |
| Credenciais | tenant+ambiente no backend | Bearer Connect Key | ADAPTAÇÃO NECESSÁRIA | cofre/versionamento 4 dimensões | refs 01/09 | não isoladamente |
| Payment Link | invoice hospedada | Checkout `rel=PAY` | COMPATÍVEL | adapter e persistência | ref 10 | não isoladamente |
| PIX | invoice Asaas | Checkout/Orders | COMPATÍVEL | homologar produto com split | refs 04/10 | split |
| Cartão | invoice Asaas | Checkout/Orders e parcelas | COMPATÍVEL | manter hospedado na fase 1 | refs 05/10/12 | split |
| Split | wallets/valores fixos | Orders `FIXED`/`account.id` | CAPABILITY GAP | homologar 4 cenários/meios | ref 15 | **sim** |
| Marketplace | wallet plataforma | receiver PRIMARY possível | ADAPTAÇÃO NECESSÁRIA | validar conta/liability | ref 15 | split |
| Sócio | global, wallet por ambiente | receiver adicional possível | ADAPTAÇÃO NECESSÁRIA | onboarding/elegibilidade | ref 15; regra financeira | split |
| Representante | vínculo empresa + wallet | receiver adicional possível | ADAPTAÇÃO NECESSÁRIA | onboarding/elegibilidade | ref 15; resolver atual | split |
| Criação | POST Asaas após venda | POST Order/Checkout 201 | COMPATÍVEL | adapter; não trocar produto | refs 04/10 | idempotência |
| Correlação | `externalReference=sale.id` | `reference_id` | ADAPTAÇÃO NECESSÁRIA | persistir IDs e validar retorno | exemplos | não isoladamente |
| Consulta | por ID/ref Asaas | por ID com mesma key | COMPATÍVEL | resolver credencial original | refs 01/10 | não |
| Idempotência | guard local + busca por referência | garantia ausente | CAPABILITY GAP | contrato/estratégia aprovada | ausência no corpus | **sim** |
| Webhook | token por ambiente | POST sem assinatura comprovada | ADAPTAÇÃO NECESSÁRIA | segredo+consulta+anti-replay | ref 07 | **sim** |
| Deduplicação | event ID/tabela própria | event ID não comprovado | ADAPTAÇÃO NECESSÁRIA | chave canônica/provider | ref 07; webhook atual | não isoladamente |
| Confirmação | finalização comum | status pago + consulta | ADAPTAÇÃO NECESSÁRIA | validar e convergir no helper | notificações; finalizer | não |
| Fallback | verify consulta Asaas | GET Order/Checkout | ADAPTAÇÃO NECESSÁRIA | adapter e mesma key | refs 01/07/10 | não |
| Tickets | finalizer idempotente | gateway não emite ticket | ADAPTAÇÃO NECESSÁRIA | remover dependência Asaas mínima | finalizer atual | regressão |
| Status | mapa Asaas conservador | alguns estados/exemplos | ADAPTAÇÃO NECESSÁRIA | mapa explícito/bruto | exemplos notifications | não |
| Cancelamento | fluxo conservador | inativar checkout/cancelar a confirmar | DECISÃO AINDA NECESSÁRIA | contrato e política | ref 10 | **sim** pós-pago |
| Estorno | reversão sem refund automático | split expõe `refunded` | DECISÃO AINDA NECESSÁRIA | validar rateio/preservação taxa | ref 15 | **sim** |
| Chargeback | eventos de risco | configuração no split, efeitos incertos | DECISÃO AINDA NECESSÁRIA | política/liability/custódia | ref 15 | **sim** |
| Diagnóstico | UI/logs fortemente Asaas | consulta por IDs | ADAPTAÇÃO NECESSÁRIA | provider, key version, status bruto | diagnóstico atual | não |
| Reconciliação | repair controlado | consulta disponível | ADAPTAÇÃO NECESSÁRIA | adapter e guards comuns | GET order/checkout | não |
| Multiempresa | contexto por sale/company | várias keys tecnicamente possíveis | ADAPTAÇÃO NECESSÁRIA | cofre, ownership, rate limit/SLA | Connect Key | segurança |
| Venda manual | taxa em checkout separado | não auditada | NÃO APLICÁVEL À PRIMEIRA FASE | nenhuma agora | decisão aprovada | não |
| Natureza/SLA Connect | Asaas direto | intermediária sem contrato auditado | DECISÃO AINDA NECESSÁRIA | due diligence/alternativa direta | host/termos indisponíveis | **sim** |

## 15. Riscos de regressão Asaas e arquitetura futura

Principais riscos: trocar defaults de ambiente/gateway; backfill incorreto de vendas
legadas; generalizar `asaas_*` de uma vez; mudar fórmula/split; duplicar emissão de
tickets; compartilhar secrets entre tenants; fazer webhook PagBank contornar os
guards Asaas; quebrar venda manual; e filtrar sócio global por empresa.

Mitigação futura: testes de caracterização antes de mudança, feature flag/piloto,
rotas Asaas intactas, adapters finos apenas nos seams listados, gateway imutável na
venda e finalização/regras SmartBus compartilhadas. Não criar arquitetura genérica
de plugins agora.

## 16. Próximo passo recomendado

Não escrever código. Enviar ao PagBank e à PB Integrações um questionário formal
com os oito bloqueios do gate, executar uma homologação assistida dos quatro
cenários de split em Checkout hospedado/PIX/cartão parcelado nos dois ambientes e
obter evidências de idempotência, webhook, onboarding, refund e chargeback. Depois,
submeter uma decisão técnica/financeira/segurança sobre Connect versus API direta.
Somente com respostas aceitas deve-se especificar schema e testes de caracterização
do Asaas em tarefa própria.

## 17. Histórico resumido

- **2026-09-01 — análise inicial:** arquitetura, acoplamentos e gaps preliminares
  registrados; nenhuma mudança funcional.
- **2026-09-01 — auditoria final:** decisões de produto incorporadas; produtos,
  intermediária, split, onboarding, credenciais, webhook, idempotência, origem da
  venda, status, reversões, ambientes, Asaas e matriz de 29 itens auditados. Gate
  mantido em **NÃO** por lacunas comprovadas de evidência, sem inventar solução.

## 18. Validações desta sessão

- leitura integral do checkpoint, Skills e referências aplicáveis;
- inspeção estática dos fluxos Checkout → criação Asaas → webhook/verify →
  `finalizeConfirmedPayment` → tickets, configuração, diagnóstico e migrations;
- validação de links externos tentada, com HTTP 403 do ambiente registrada como
  limitação; nenhuma chamada com credencial foi feita;
- Markdown e diff verificados; testes funcionais não são aplicáveis porque somente
  documentação foi alterada.
