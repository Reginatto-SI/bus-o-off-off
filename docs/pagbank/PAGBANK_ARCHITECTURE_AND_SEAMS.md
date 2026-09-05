# SmartBus — mapeamento arquitetural e seams para PagBank direto

> Auditoria documental concluída em 2026-09-05 sobre a branch de iniciativa
> `feature/pagbank-integration` (materializada no Codex Cloud e trabalhada em
> `codex/pagbank-architecture-seams`). Nenhum código, migration, RLS, teste,
> configuração ou integração foi alterado.

## 1. Resumo executivo

O Asaas não está encapsulado em um único módulo: nomes de Edge Functions, campos
`asaas_*`, onboarding, credenciais, invoice URL, status, webhook e diagnóstico
atravessam frontend, backend e banco. Porém, a parte que deve continuar sendo do
SmartBus já possui núcleos reutilizáveis: reserva e passageiros, motor da taxa,
elegibilidade financeira, snapshot, finalização, tickets, ledger e logs.

O menor seam seguro não é um framework de plugins. É (1) selecionar e congelar
`company_id`, `gateway`, `payment_environment`, a identidade lógica não secreta da
integração e a identidade da conta/recebedor externo ao criar a própria
venda/reserva, antes de qualquer chamada externa;
(2) despachar seis operações
de provedor no backend — criar PIX, criar cartão, consultar, interpretar evento,
cancelar e estornar — e (3) fazer webhook e consulta entregarem uma confirmação
normalizada à rotina comum `finalizeConfirmedPayment`. As funções Asaas atuais
podem permanecer enquanto um dispatcher fino é introduzido de forma aditiva.

O caminho financeiro principal já resolve ambiente por venda, empresa e request,
nesta ordem, e não por domínio. Resta uma heurística legada real em
`supabase/functions/_shared/runtime-env.ts`, consumida pelo endpoint aparentemente
não usado `get-runtime-payment-environment` e como fallback de onboarding em
`create-asaas-account`. Ela reconhece apenas `smartbusbr.com.br` e
`www.smartbusbr.com.br`; os atuais `smartbus.com.br` e `www.smartbus.com.br`
cairiam em Sandbox. Isso é risco residual, não contrato a copiar para PagBank.

**Escopo preservado:** integração direta `SmartBus → PagBank`, API oficial Order,
PIX e cartão no checkout atual. **Payment Link e checkout hospedado não fazem
parte do escopo.** Asaas permanece operacional, sem migração automática nem
fallback entre gateways.

## 2. Estado atual confirmado no código

- `src/pages/public/Checkout.tsx` obtém a empresa do evento, persiste primeiro
  `sales`, `seat_locks` e `sale_passengers`, e então invoca diretamente
  `create-asaas-payment` com `sale_id`, método, ambiente e aceite.
- `supabase/functions/create-asaas-payment/index.ts` relê venda/empresa, valida
  contexto, impede recriação quando há `asaas_payment_id`, executa motor/split,
  envia `externalReference = sale.id` e persiste cobrança/status/URL/snapshot.
- `src/pages/public/Confirmation.tsx` faz polling em `verify-payment-status` e
  reabre a cobrança por `get-asaas-payment-link`.
- `supabase/functions/asaas-webhook/index.ts` autentica token pelo ambiente da
  venda, correlaciona, deduplica, trata matriz de eventos e finaliza pagamentos.
- `supabase/functions/verify-payment-status/index.ts` consulta o Asaas com a
  credencial da empresa no ambiente congelado e converge pela mesma finalização.
- `supabase/functions/_shared/payment-finalization.ts` contém
  `inspectSaleConsistency`, `createTicketsFromPassengersShared` e
  `finalizeConfirmedPayment`; `reconcile-sale-payment` reaproveita esse núcleo.
- `companies.payment_environment` é a configuração para vendas futuras;
  `sales.payment_environment` existe, é obrigatório e teve seu default removido
  por `20261024110000_final_asaas_alignment.sql`.
- Não existe `payment_gateway` genérico em `companies` ou `sales`; o provedor
  operacional é implícito pelo conjunto de campos e funções Asaas.
- Não há fluxo financeiro end-to-end comprovado para refund ou chargeback. Há
  reconhecimento de eventos de reversão no webhook e bloqueios/estados de
  comissão, mas não uma política automatizada de devolução/contestação.

## 3. Confirmação e divergências das Skills

Foram usadas integralmente, nesta ordem, as Skills
`.agents/skills/smartbus-payment-gateway/SKILL.md` e
`.agents/skills/pagbank-official-api/SKILL.md`, além das referências aplicáveis.
`pagbank-connect` não foi consultada porque não há comparação com PB Integrações
nesta tarefa.

### Confirmado

O mapa da Skill continua válido: jornada, pontos visuais, Edge Functions, tabelas,
precedência do ambiente, finalização comum, split, observabilidade e ausência de
reversões completas conferem com o código atual. Também se confirma que Order é
o produto PagBank candidato; wallet/token/evento Asaas são mecanismo específico,
não regra SmartBus.

### Divergências e atualizações relevantes

1. O checkpoint anterior ainda lista o máximo de quatro recebedores como dúvida.
   A referência oficial interna atualizada registra capacidade documental de até
   15 recebedores. Isso remove a dúvida puramente numérica, mas **não** o gate de
   homologar conta, contrato, primário, tarifas e os quatro cenários reais.
2. A constraint final de `sale_integration_logs.environment_decision_source`
   aceita `sale`, `request` e `host`, enquanto `resolvePaymentContext` também pode
   reportar `company`. O caminho de criação aparenta registrar normalmente sale
   ou request, mas há divergência de vocabulário que precisa de teste/migration
   aditiva antes de generalizar observabilidade.
3. O comentário de `get-runtime-payment-environment/index.ts` chama a heurística
   de host de “decisão oficial”, mas `runtime-env.ts` a classifica como legada e o
   hook/frontend atual não chama o endpoint. O comportamento efetivo principal é
   empresa/venda; o comentário do endpoint está obsoleto.

## 4. Inventário de acoplamentos ao Asaas

| Área | Arquivo/componente | Responsabilidade | Acoplamento ao Asaas | Pode permanecer? | Seam necessário? | Risco |
|---|---|---|---|---|---|---|
| Checkout | `src/pages/public/Checkout.tsx` | valida compra, cria venda/reserva/passageiros e abre cobrança | chamada literal `create-asaas-payment`, URL/fallback e textos Asaas | reserva e persistência sim; chamada não | dispatcher por gateway da venda | Alto: escolher função errada cria cobrança no provedor errado |
| Meio de pagamento | `Checkout.tsx` | seleciona `payment_method` e prepara aba externa | UX presume invoice URL hospedada Asaas, inclusive cartão | validações e escolha sim | resultado por capacidade (`pix`, cartão transparente) | Alto: PagBank cartão não usa a mesma experiência de fatura |
| Ambiente frontend | `src/hooks/use-runtime-payment-environment.ts` | normaliza empresa do evento/ativa | nome genérico e sem host; não depende do Asaas | Sim | só tipar/preservar snapshot futuro | Baixo |
| Configuração da empresa | `src/pages/admin/Company.tsx` | status, verificar, desconectar e ambiente atual | campos, status e funções Asaas diretos | ambiente e layout sim | seleção de gateway + configuração específica | Alto: troca não pode afetar vendas antigas |
| Onboarding | `src/components/admin/AsaasOnboardingWizard.tsx`, `supabase/functions/create-asaas-account/index.ts` | cria/vincula conta por ambiente | payload, API key, account/wallet, endpoints e fallback por host Asaas | Asaas integralmente | onboarding PagBank separado dentro da mesma área; não generalizar payload | Alto: secrets/OAuth multiempresa |
| Diagnóstico de conta | `AsaasDiagnosticPanel.tsx`, `check-asaas-integration` | readiness de conta, Pix, wallet e webhook | semântica integral Asaas | Sim para Asaas | painel/resultado discriminado por gateway | Médio |
| Contexto/credencial | `_shared/payment-context-resolver.ts` | ambiente, credencial, base URL, wallet e webhook token | tipos, secrets, colunas e URL Asaas no mesmo retorno | precedência do ambiente sim | separar decisão SmartBus de resolução do adapter | Alto |
| Criação PIX/cartão | `create-asaas-payment/index.ts` | valida venda, taxa/split, customer, cobrança e persistência | payload/status/link/idempotência local e API Asaas | manter caminho Asaas | operação `createPayment` com variantes PIX/cartão | Crítico |
| Recuperação de link | `get-asaas-payment-link/index.ts` | consulta invoice URL | específico a invoice Asaas | Sim para vendas Asaas | despacho por venda; PagBank PIX retorna QR, cartão não exige link | Médio |
| Split | `_shared/split-recipients-resolver.ts`, `create-asaas-payment` | elegibilidade e montagem de wallets/fixed values | resolver se chama `resolveAsaasSplitRecipients`; destinos são wallets | regra/elegibilidade sim; tradução não | plano financeiro genérico → tradutor Asaas/PagBank FIXED | Crítico |
| Motor e snapshot | `_shared/platform-fee-engine.ts`, `_shared/checkout-financial-integrity.ts`, campos `sales.split_snapshot_*` | taxa por item, teto, mínimo, divisão e evidência | engine é agnóstica; alguns nomes/fontes do snapshot citam Asaas | Sim | apenas DTO monetário em centavos no limite do adapter | Alto financeiro |
| Persistência externa | `sales.asaas_payment_id`, `asaas_payment_status`, invoice e transfer IDs | ancora cobrança e estado externo | colunas exclusivas | Sim para legado | campos/tabela aditivos por gateway | Crítico |
| Webhook | `asaas-webhook/index.ts` | token, evento, dedup, status, snapshot, comissão e finalização | headers, token, payload, eventos e tabela Asaas | manter inteiro | endpoint PagBank próprio + envelope normalizado | Crítico |
| Autenticação webhook | `_shared/payment-context-resolver.ts` / `validateWebhookTokenForContext` | aceita token do ambiente da venda | headers/token estático Asaas | Sim para Asaas | assinatura SHA-256 sobre body bruto no adapter PagBank | Crítico |
| Deduplicação | `asaas_webhook_event_dedup`, RPC `mark_asaas_webhook_event_duplicate` | exatamente uma reserva lógica por `event.id` | nome/chave só Asaas | Sim para Asaas | dedup aditiva com gateway+ambiente+conta+evento | Alto |
| Consulta/fallback | `verify-payment-status/index.ts` | consulta status e confirma | endpoint/status/IDs Asaas misturados à orquestração | manter endpoint compatível inicialmente | provider `queryPayment` + status normalizado | Crítico |
| Finalização | `_shared/payment-finalization.ts` | marca paga, solta locks, cria ticket, observa inconsistência | assinatura/campos de inspeção recebem `asaas_payment_*` | núcleo sim | entrada genérica de evidência, sem duplicar rotina | Crítico |
| Tickets | `createTicketsFromPassengersShared`, `tickets`, `TicketCard.tsx`, `ticket-lookup` | emissão/consulta/apresentação | emissão não depende de API Asaas | Sim | nenhum além de preservar idempotência | Crítico se duplicado |
| Reconciliação | `reconcile-sale-payment/index.ts` | repara pago sem ticket | lê/passa `asaas_payment_id` | algoritmo sim | evidência externa genérica e gateway da venda | Alto |
| Logs | `_shared/payment-observability.ts`, `sale_logs`, `sale_integration_logs` | trilha técnica e operacional | `provider` já existe, mas colunas `asaas_event_id` permanecem | estrutura principal sim | IDs/eventos genéricos aditivos | Médio |
| Diagnóstico de venda | `src/pages/admin/SalesDiagnostic.tsx` | cruza venda, logs, webhook e split | filtros/colunas/termos Asaas | layout e busca sim | dimensão gateway e IDs externos | Médio |
| Venda manual | `NewSaleModal.tsx`, `create-platform-fee-checkout` | reserva/admin e cobrança isolada da taxa | cobrança Asaas própria | permanece fora da fase 1 | não incluir no primeiro seam PagBank | Médio |
| Cancelamento/expiração | `cleanup-expired-locks`, cancelamento em telas/RPCs e handlers webhook | expira reserva/libera assento/cancela localmente | não equivale a refund; webhook conhece reversões Asaas | lógica local sim | ação externa explícita e posterior | Alto |
| Estorno/chargeback | não há módulo end-to-end; handlers de reversão em `asaas-webhook` e ledger `representative_commissions` | tratamento parcial/diagnóstico | sem política comum comprovada | não declarar suporte | contrato opcional bloqueado por decisão | Crítico |
| RLS/multiempresa | policies de `sales`, `tickets`, logs, dedup; service role nas Edges | isolamento de leitura e mutações | algumas tabelas/names Asaas; service role exige filtros manuais | políticas atuais sim | revisar toda tabela nova por `company_id` | Crítico |

## 5. Estruturas independentes de gateway

| Estrutura confirmada | Evidência real | Reuso esperado |
|---|---|---|
| Engine financeira | `_shared/platform-fee-engine.ts`: `resolveTierPercent`, `computeProgressiveFeeForPassengers`, `distributePlatformFee` | intacta; produzir plano em centavos antes do adapter |
| Integridade do checkout | `_shared/checkout-financial-integrity.ts` e `src/lib/checkoutFinancialIntegrity.test.ts` | mesma recomposição de itens/benefícios |
| Elegibilidade | `resolveAsaasSplitRecipients` consulta sócio global e representante por empresa/ambiente, mas a decisão SmartBus pode ser extraída da tradução wallet | regra permanece; apenas identificador de recebedor varia |
| Snapshot | campos `sales.split_snapshot_*`, migration `20260424120000_add_sales_split_snapshot_asaas.sql` | preservar dados comerciais; adicionar evidência do plano efetivamente enviado |
| Reserva | `seat_locks`, `sale_passengers`, `cleanup-expired-locks` | intacta e anterior à cobrança |
| Finalização | `finalizeConfirmedPayment` | único destino de webhook e consulta de ambos gateways |
| Ticket | `createTicketsFromPassengersShared`, trigger/índice global de `tickets` | emissão única, sem adapter |
| Ledger | `representative_commissions` e RPC de criação idempotente usada no webhook | regra comum; precisa separar evidência do mecanismo Asaas |
| Logs | `sale_logs`, `sale_integration_logs.provider`, helpers de observabilidade | reutilizar com gateway/ambiente/correlação explícitos |
| Relatórios | RPCs usam `sales.status = 'pago'` e snapshots, não consulta on-line ao Asaas | preservar compatibilidade de vendas antigas |

“Independente” aqui não significa “zero edição”: finalização, reconciliação e logs
ainda carregam campos Asaas em seus contratos e precisam de uma entrada aditiva,
mas seu comportamento SmartBus não deve ser refeito.

## 6. Fluxo atual completo do Asaas

1. **Configuração:** `/admin/empresa` lê `companies.payment_environment`; wizard
   chama `create-asaas-account`; diagnóstico chama `check-asaas-integration`.
2. **Reserva:** `Checkout.tsx` valida estoque/benefício/termos, cria `sales` com
   `company_id`, método e ambiente, depois `seat_locks` e `sale_passengers`.
3. **Cobrança:** chama `create-asaas-payment`. A Edge relê tudo, resolve contexto,
   taxa/split, cria customer/payment e salva `asaas_payment_id`, status, URL e
   snapshot. `externalReference` usa o ID da venda.
4. **Espera:** navega para `/confirmacao/:id`; a cobrança abre em outra aba e a
   confirmação consulta localmente e faz polling em `verify-payment-status`.
5. **Confirmação prioritária:** `asaas-webhook` correlaciona venda, seleciona o
   token exclusivamente pelo `sales.payment_environment`, valida, deduplica por
   evento, normaliza status e processa snapshot/ledger.
6. **Fallback:** `verify-payment-status` consulta a cobrança na API correta e, se
   confirmada, chama o mesmo núcleo.
7. **Finalização:** `finalizeConfirmedPayment` torna a venda `pago`, registra
   confirmação, remove locks e chama `createTicketsFromPassengersShared`; retry
   reconhece tickets existentes. Notificação/log acessório não deve duplicar o
   efeito financeiro.
8. **Reparo:** `reconcile-sale-payment` inspeciona `pago` sem ticket e reexecuta a
   finalização controlada; diagnóstico usa logs, dedup, snapshots e IDs.

Asaas aparece nos passos 1, 3, 5 e na consulta do 6. Reserva, transição comum,
assentos, tickets, relatórios e núcleo dos logs pertencem ao SmartBus.

## 7. Seam mínimo recomendado (proposta, não implementação)

### Contrato conceitual

Criar apenas um dispatcher backend e dois adapters concretos (`asaas` existente e
`pagbank` futuro). Os nomes abaixo são **propostos** e não existem hoje:

```text
PaymentGatewayPort
  createPix(context, paymentPlan) -> PaymentCreationResult
  createCard(context, paymentPlan, encryptedCard, cardContext) -> PaymentCreationResult
  queryPayment(context, externalIds) -> GatewayPaymentState
  parseAndAuthenticateWebhook(rawRequest, candidateContext) -> GatewayEvent
  cancel(context, externalIds, reason) -> GatewayOperationResult   [capacidade opcional]
  refund(context, externalIds, refundPlan) -> GatewayOperationResult [bloqueado por política]
```

**Entradas:** `sale_id`; `company_id`, gateway, ambiente, identidade lógica não
secreta da integração e identidade da conta/recebedor externo já congelados na
criação da venda; método; valor/moeda em centavos; snapshot/plano de split;
referências estáveis; chave idempotente; no cartão,
somente token/cartão criptografado transitório e contexto 3DS.

**Saídas:** gateway/ambiente; resultado normalizado (`pending`, `paid`, `failed`,
`canceled`, `reversed`, `unknown`); status bruto; IDs Order/Charge/Split ou Asaas;
artefato PIX/URL quando aplicável; timestamps; evidência sanitizada; flag de
recuperabilidade. `paid` é apenas evidência para a finalização comum, não emissão
de ticket pelo adapter.

**Erros:** tipados em configuração, autenticação/autorização, validação, recusa,
indeterminado após timeout, conflito de idempotência, assinatura inválida,
tenant/ambiente divergente, capability indisponível e erro transitório. Timeout
pós-envio é `indeterminate`, nunca “pode recriar”.

**Idempotência e correlação:** chave estável por
`gateway/company/environment/sale/operation`; persistir tentativa e hash do plano
antes da chamada; retry idêntico reutiliza chave/payload; ID existente provoca
consulta, não criação; webhook deduplica por gateway+ambiente+conta+evento.

**Imutabilidade desde a reserva:** a criação inicial pode ler gateway, ambiente e
configuração da empresa, mas deve gravar atomicamente com a venda/reserva, antes da
chamada ao adapter, `company_id`, gateway, ambiente, identidade lógica não secreta
da integração, conta/recebedor externo e os demais snapshots financeiros e
referências estáveis. A identidade lógica representa a combinação empresa +
gateway + ambiente + conta externa autorizada + configuração lógica persistente;
ela não identifica uma versão de access token, refresh token, API key, webhook
token, chave criptográfica ou outro secret rotativo. A partir daí, create, retry,
consulta, webhook, reconciliação, cancelamento e diagnóstico usam exclusivamente
essa identidade e os snapshots da venda, resolvendo a credencial válida atual que
pertença à mesma configuração lógica.

Segredos podem expirar, ser renovados, rotacionados, revogados ou substituídos com
segurança sem alterar gateway, ambiente ou conta externa da venda. Rotação não
autoriza credencial de outra empresa, conta PagBank, configuração ou provedor e
não deve impedir consulta/reconciliação histórica. Reconectar a integração a uma
conta externa diferente cria nova identidade lógica para vendas futuras; vendas
anteriores continuam vinculadas à identidade e conta originais enquanto houver
obrigação de consulta, webhook, estorno ou reconciliação. Se a credencial histórica
for revogada e não puder ser renovada, o fluxo falha fechado, registra diagnóstico
e exige ação operacional, sem fallback para a configuração corrente.

Timeout não autoriza trocar provedor ou ambiente; mudança posterior da empresa e
parâmetros de requests posteriores não sobrescrevem os snapshots. Se a tentativa
precisar ser abandonada definitivamente, qualquer nova operação comercial exige
decisão explícita e não pode reutilizar silenciosamente a mesma venda em outro
provedor.

**Limites:** adapters traduzem autenticação, endpoint, payload, resposta, status e
assinatura. Eles não calculam taxa/elegibilidade, não escolhem gateway/ambiente,
não criam venda/ticket/ledger, não alteram reserva e não decidem refund/chargeback.

### Introdução sem regressão

Manter inicialmente as Edges Asaas como compatibilidade. O primeiro dispatcher
deve resolver a venda e encaminhar Asaas para o comportamento caracterizado, sem
renomear campos nem mover toda a implementação. Só depois conectar PagBank. Isso
é menor e mais reversível que transformar todas as funções em framework.

## 8. Fluxo futuro PagBank convergente

`Checkout.tsx` continuará criando a mesma reserva. Na criação de `sales`, congela
empresa, gateway, ambiente, identidade lógica não secreta da integração e
conta/recebedor externo antes de qualquer chamada externa — não uma versão do
secret. O dispatcher relê a venda, resolve a credencial válida atual da mesma
identidade lógica, calcula o mesmo plano e
chama o adapter Order: PIX devolve QR/copia-e-cola; cartão recebe somente o valor
criptografado pelo SDK/chave pública da conta correta. IDs Order, Charge e Split e
status bruto são persistidos.

O webhook PagBank preserva body bruto, localiza a venda apenas para obter o token
candidato, valida `x-authenticity-token` por SHA-256 conforme contrato oficial,
consulta quando crítico/ambíguo, deduplica e normaliza. `PAID` converge para
`finalizeConfirmedPayment`; `WAITING`, `AUTHORIZED` e `IN_ANALYSIS` não finalizam.
A consulta de Confirmation/reconciliação converge pelo mesmo caminho. Portanto,
marcação paga, baixa dos locks, assentos derivados dos tickets, ticket, ledger,
notificações e logs não ganham uma cópia PagBank.

## 9. Ambiente e domínio

### Regra financeira ativa

- `use-runtime-payment-environment.ts`: empresa do evento → empresa ativa →
  `null`; não consulta hostname.
- `resolvePaymentContext`: `sales.payment_environment` →
  `companies.payment_environment` → request explícito → erro fechado.
- create persiste ambiente; verify/link/webhook usam venda e credencial desse
  ambiente. Mudança posterior da empresa não deve alterar a venda vinculada.

Esse é o **comportamento legado atual**, ainda monogateway: o resolvedor aceita a
precedência venda → empresa → request para acomodar a primeira criação e caminhos
de compatibilidade. Ele não persiste gateway nem identidade lógica da integração
e, por isso, não deve ser copiado literalmente como contrato multigateway.

### Contrato futuro para vendas existentes

Na criação inicial, o backend pode obter gateway e ambiente da configuração da
empresa, mas deve persistir `company_id`, `sales.payment_gateway`,
`sales.payment_environment`, a identidade lógica não secreta da integração e a
identidade da conta/recebedor externo na mesma criação da venda/reserva. Depois
que a venda existe, criação da cobrança,
retry, consulta, webhook, reconciliação, cancelamento e diagnóstico devem usar
exclusivamente esses snapshots e resolver a credencial válida atual pertencente à
mesma configuração lógica. Configuração corrente da empresa, hostname, origin,
referer e parâmetro do request não podem substituir nenhum snapshot.

Concluído o backfill histórico, uma venda sem gateway, ambiente ou identidade
lógica/conta externa compatível deve falhar fechada, registrar erro diagnóstico e
exigir tratamento operacional. É proibido inferir silenciosamente pelo domínio, selecionar o gateway
corrente da empresa, alternar ambiente ou tentar outro provedor. Essa regra vale
mesmo antes de existir ID externo: a imutabilidade começa ao criar a venda.

### Classificação completa da lógica de domínio relevante

| Local | Uso | Classe | Risco financeiro |
|---|---|---|---|
| `_shared/runtime-env.ts` | lê origin, referer, forwarded-host e host; dois domínios antigos = production, resto = sandbox | fallback/compatibilidade legada ativa para consumidores explícitos | Real: `smartbus.com.br` cai em sandbox |
| `get-runtime-payment-environment` | expõe a heurística | possivelmente obsoleto/código sem consumidor encontrado; comentário desatualizado | Médio se voltar a ser consumido |
| `create-asaas-account` | host é fallback; `target_environment` enviado pelos chamadores sobrescreve | compatibilidade legada ativa no onboarding | Alto para chamada incompleta futura; hoje mitigado |
| URLs por `window.location.origin` em Confirmation/Sales/relatórios/share/referral | links públicos, QR, navegação/redirect | URL pública, não regra financeira | Baixo; domínio segue relevante operacionalmente |
| `Company.tsx`, metatags, TicketCard e páginas públicas | links canônicos/marca | visual/SEO | Nenhum financeiro |
| auth e cadastro (`auth-email-*`, `create-user`, Login/MyAccount) | callback/site URL/e-mail | autenticação/redirect | Não escolhe ambiente, mas domínios antigos podem quebrar callback |
| `register-company` | registra origin/referer em log | diagnóstico | Nenhum seletor financeiro encontrado |
| `companyDomainRouting`/`PublicRootRedirect` | roteamento visual por hostname | comportamento de navegação | Nenhum financeiro |

Os quatro domínios conhecidos são contexto de produção para URLs/callbacks, mas
nenhum deve selecionar credencial. OAuth/Connect PagBank exigirá allowlists de
redirect URI e webhook/CORS coerentes, separadas da decisão financeira.

## 10. Proposta aditiva de dados (sem migration)

Não duplicar `companies.payment_environment`, `sales.payment_environment`,
`sales.payment_method`, `company_id`, snapshots financeiros, `payment_confirmed_at`,
`sale_logs` nem `sale_integration_logs.provider`.

| Proposta expressa | Estado atual comparado | Regra de evolução |
|---|---|---|
| `companies.payment_gateway` | ausente | backfill explícito `asaas` para existentes; default técnico Asaas apenas temporário se necessário à implantação; depois, criação de empresa grava escolha explícita e não aceita ausência como inferência |
| `sales.payment_gateway` | ausente | backfill histórico explícito `asaas`; NOT NULL para novas vendas e imutável desde a criação da venda, antes de ID/chamada externa |
| `payment_gateway_configs` (proposta de tabela privada/backend) | credenciais Asaas hoje estão em colunas de `companies` | identidade lógica estável por company/gateway/environment/conta externa; referenciar secret-vault, scopes, account/receiver IDs, status e rotação; reconexão a outra conta cria outra identidade; nunca token público |
| `payment_attempts` (proposta) | IDs/status primários estão em `sales`; logs não são estado transacional | gateway, ambiente, identidade lógica, operação, idempotency key única, payload hash, estado, IDs externos, tentativa, timestamps e erro sanitizado; versão/fingerprint de credencial somente como evidência sanitizada opcional |
| IDs externos | `asaas_payment_id/status/transfer_id` devem permanecer | tentativa genérica armazena Order/Charge/Split; opcional snapshot dos IDs ativos em sales sem reaproveitar coluna Asaas |
| `payment_webhook_events` (proposta) | dedup Asaas por `asaas_event_id` | chave gateway+environment+account+event/hash, raw seguro/retido, assinatura, tentativas, resultado; RLS fechada/service role |
| reconciliação | `reconcile-sale-payment` e logs, sem fila genérica | status/última consulta/próxima tentativa/origem/resultado em attempts ou tabela de jobs |
| configuração usada | venda só congela ambiente | `gateway_config_id` lógico e identidade não secreta da conta/recebedor congelados ao criar a venda; resolver secrets rotativos atuais dessa mesma identidade; nunca congelar nem persistir access/refresh token ou secret na venda |

Constraints devem impedir cruzamento de tenant/ambiente, chave idempotente duplicada
e alteração de gateway, ambiente, identidade lógica ou conta externa desde a
criação da venda — não apenas após existir ID externo. RLS deve permitir somente tenant
autorizado; service role sempre filtra `company_id`. Campos Asaas ficam intactos
durante coexistência. A forma de guardar OAuth (Vault/KMS versus serviço dedicado)
é decisão de segurança ainda pendente; não colocar tokens em tabela public legível.
Uma versão ou fingerprint de credencial pode existir somente como evidência de
auditoria sanitizada na tentativa, nunca como chave rígida para operações futuras.

### Implantação do gateway por empresa

1. **Backfill histórico:** todas as empresas existentes recebem explicitamente
   `asaas`; nenhuma é migrada automaticamente para PagBank.
2. **Default técnico temporário:** durante a implantação compatível, um default
   `asaas` pode existir somente se necessário para impedir regressão antes da nova
   interface. Seu uso deve ser rastreável e removido quando a criação explícita
   estiver disponível; ausência nunca significa Asaas, PagBank ou outro gateway.
3. **Fase intermediária:** enquanto PagBank estiver desabilitado, Asaas pode ser a
   única escolha operacional, mas a criação deve registrá-la de modo explícito e
   auditável, sem depender de `NULL` ou fallback invisível.
4. **Novas empresas:** depois da interface de seleção, o fluxo de criação grava a
   escolha expressa. PagBank só pode ser recomendado/destacado depois de homologado
   e habilitado; empresas existentes continuam no Asaas até troca deliberada.
5. **Estado final desejado:** `payment_gateway` obrigatório, sem default semântico;
   seleção explícita para novas empresas e alterações auditadas que afetam apenas
   vendas futuras.

## 11. Plano de testes de caracterização

### Obrigatórios antes da primeira alteração funcional

1. PIX Asaas: venda/reserva → única cobrança → pendente → webhook confirmado →
   venda paga/tickets; expiração/recusa não emitem.
2. Cartão Asaas em todos formatos hoje oferecidos, inclusive status intermediário
   e recusado, sem alterar o contrato atual.
3. Quatro cenários do split, mínimo R$5, teto R$25/item, resíduos, múltiplos itens,
   wallet ausente versus erro, snapshot e `representative_commissions`.
4. Ambiente: empresa sandbox/production em preview e publicado; venda mantém o
   snapshot após troca; credencial oposta nunca serve de fallback.
5. Webhook: token correto/incorreto/ausente, tenant/ambiente/valor/referência,
   duplicado, concorrente, atrasado e fora de ordem.
6. Consulta fallback: ausência do webhook e timeout; consulta não cria cobrança e
   converge pela finalização comum.
7. Finalização idempotente: webhook+verify+reconcile concorrentes; uma transição,
   um ledger e exatamente um ticket por passageiro/trecho.
8. Vendas antigas Asaas continuam consultáveis/finalizáveis após empresa escolher
   PagBank; troca afeta apenas venda nova; nenhum fallback/recriação.
9. Retry de create antes/depois de resposta perdida e dois cliques/abas: no máximo
   uma cobrança externa.
10. Isolamento A/B e sandbox/production em create, webhook, verify, diagnóstico,
    logs e reconciliação; RLS e queries service-role negativas.
11. Cancelamento local libera somente o previsto; comprovar que não dispara refund.
12. Venda manual/taxa permanece Asaas e relatórios pagos permanecem inalterados.

Já existem unitários para fee, integridade do checkout, distribuição/split,
continuidade Asaas, status de integração, invoice URL e hook de ambiente. Não foram
encontrados testes automatizados de Edge end-to-end para create/webhook/verify,
concorrência, finalização/ticket ou RLS multiempresa; essas são as maiores lacunas.

## 12. Riscos

1. Cobrança dupla por timeout/dispatcher sem estado transacional.
2. Venda histórica roteada pela configuração corrente da empresa.
3. Regressão do Asaas causada por refatoração ampla ou rename de campos.
4. Divergência entre snapshot, split FIXED, tarifas do primário e ledger.
5. Token/conta PagBank cruzados entre tenant ou ambiente; cartão criptografado com
   chave de outra conta.
6. Webhook Connect cuja chave real de assinatura por conta não esteja comprovada.
7. Ticket/comissão duplicados por webhook, verify e reconcile concorrentes.
8. Heurística residual mandar onboarding atual para ambiente incorreto.
9. Refund proporcional contrariar a taxa SmartBus ganha; chargeback sem responsável.
10. Logs exporem segredo, body sensível ou cartão criptografado.
11. RLS parecer suficiente enquanto service role executa query sem `company_id`.
12. Confundir payload aceito com split/liquidação efetivamente conciliados.

## 13. Gates por fase

### Bloqueios para começar desenvolvimento funcional de cobrança

- Testes de caracterização essenciais dos itens 1–10 acima ainda não existem.
- Acesso real a Sandbox com Order, Connect Authorization e split na conta/contrato
  alvo precisa ser confirmado antes de chamar endpoints (o desenho/migration pode
  avançar protegido antes disso).
- Definir e aprovar o armazenamento seguro de access/refresh token e token de
  autenticidade por empresa/ambiente.
- Fechar constraints, backfill explícito Asaas, default técnico temporário (se
  necessário) e transição para escolha explícita na criação de empresas.

### Pendências resolvíveis durante desenvolvimento

- UX exata do QR PIX e cartão criptografado/3DS dentro do checkout existente.
- Vocabulário/estrutura final de attempts, eventos e diagnóstico.
- Alinhar a constraint de origem do ambiente e caracterizar o fallback de host.
- Mapeamento completo de status não confirmatórios e mensagens públicas.
- Automação de reconciliação/alertas, desde que criação permaneça desabilitada.

### Bloqueios para homologação/piloto

- Duas empresas isoladas, OAuth/scopes/refresh/revogação e chave pública por conta.
- PIX, cartão, parcelas/3DS, timeout idempotente e webhook assinado por conta.
- Quatro cenários FIXED, resíduos, recebedores, primário, tarifa, consulta e
  liquidação conciliados.
- Fallback, finalização/ticket/ledger únicos, logs, reconcile e regressão Asaas.
- Refund customizado controlado e comportamento de saldo insuficiente comprovados.

### Bloqueios para produção

- Homologação técnica/comercial oficial marketplace/split e ambientes.
- Contrato de tarifas, prazo, primário, scopes, SLA/suporte e LGPD/PCI.
- Política aprovada de refund/cancelamento e chargeback (responsável, ledger,
  liquidação, saldo negativo e eventos).
- Webhook Connect multiempresa comprovado em produção, antifraude/3DS definido.
- Piloto de baixo valor conciliado, monitoramento/alertas/runbook e kill switch.
- Regressão integral Asaas e rollback técnico aprovados, reconhecendo que rollback
  não desfaz efeitos financeiros externos.

## 14. Sequência recomendada de Pull Requests funcionais

Todos os PRs intermediários devem ter base `feature/pagbank-integration`.

1. **Caracterização Asaas:** testes de create/verify/webhook/finalização, split,
   ambiente, idempotência e multiempresa, sem mudar produção.
2. **Dados aditivos:** gateway empresa/venda, configuração segura referenciada,
   attempts/eventos/constraints/RLS e backfill Asaas explícito.
3. **Seam mínimo Asaas:** dispatcher/contexto genérico encaminhando Asaas ao fluxo
   atual, com paridade total e feature flag PagBank desligada.
4. **Onboarding PagBank:** OAuth/Connect e credenciais por tenant/ambiente na área
   existente de pagamentos, sem habilitar vendas.
5. **Order PIX:** adapter, QR no checkout existente, consulta, webhook, logs e
   finalização comum em Sandbox.
6. **Order cartão:** SDK/criptografia por conta, parcelas/3DS e mesmos seams.
7. **Split e conciliação:** FIXED, quatro cenários, consulta/liquidação e ledger.
8. **Diagnóstico/reconciliação/piloto:** painel existente ganha gateway, alertas,
   runbook e liberação por empresa; Asaas segue disponível.
9. **Reversões:** somente após decisão de produto/financeiro e homologação própria.

## 15. Critérios objetivos para iniciar a primeira implementação

- PR 1 de caracterização aprovado e verde nos fluxos críticos listados.
- Schema aditivo e backfill de existentes como Asaas revisados, sem rename/drop.
- Contrato do seam aprovado com empresa, gateway, ambiente, identidade lógica da
  integração e conta externa imutáveis desde a criação da venda, credenciais
  rotativas resolvidas dentro dessa identidade e finalização única.
- Backfill de empresas/vendas existentes como Asaas e fluxo de novas empresas
  definidos em fases, sem `NULL` como inferência e sem migração automática.
- Operações de venda existente falham fechadas quando snapshots estiverem ausentes
  após o backfill; empresa, domínio e request não funcionam como fallback.
- Rotação/renovação não troca conta, tenant, ambiente ou gateway; reconexão a outra
  conta cria nova identidade, e credencial histórica irrecuperável falha fechada
  com diagnóstico, sem fallback.
- Estratégia de secrets/OAuth e RLS/service-role aprovada por segurança.
- Sandbox/contas Order+Connect+split disponíveis ou, para código preparatório,
  feature flag fechada e nenhuma chamada financeira possível.
- Capability gaps continuam registrados; nenhum exige mudar regra SmartBus.
- Base do PR confirmada como `feature/pagbank-integration`.

Cumpridos esses critérios, o próximo PR funcional recomendado é **somente testes
de caracterização do Asaas**. Não iniciar pelo adapter PagBank.
