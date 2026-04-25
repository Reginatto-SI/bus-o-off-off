# Análise técnica conservadora — `/admin/diagnostico-vendas`

## Objetivo

Documentar com evidência a fonte real de dados da tela administrativa `/admin/diagnostico-vendas`, os filtros efetivamente aplicados, a resolução de empresa ativa e ambiente, os critérios de inclusão/exclusão da listagem e o comportamento observado no caso real da venda `30400fef-99fe-4418-8357-7085b000c823`, sem implementar correções nesta etapa.

## Arquivos inspecionados

### Frontend / rota / contexto
- `src/App.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `src/components/layout/AdminLayout.tsx`
- `src/components/layout/AdminHeader.tsx`
- `src/components/admin/FilterCard.tsx`
- `src/contexts/AuthContext.tsx`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/pages/admin/SalesDiagnostic.tsx`

### Backend / fluxo de pagamento consultado para contextualizar o caso real
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/_shared/payment-finalization.ts`

### Evidências remotas levantadas no banco (via REST autenticado com o usuário informado)
- `sales`
- `sale_logs`
- `sale_integration_logs`
- `tickets`
- `seat_locks`
- `companies`
- `events`
- `user_roles`

## Comandos executados para coleta de evidências

### Inspeção do código
- `rg -n "/admin/diagnostico-vendas|diagnostico-vendas|SalesDiagnostic" . --glob '!node_modules' --glob '!dist' --glob '!build'`
- `sed -n '1,220p' src/App.tsx`
- `sed -n '1,260p' src/components/layout/AdminSidebar.tsx`
- `sed -n '1,1220p' src/pages/admin/SalesDiagnostic.tsx`
- `sed -n '1,320p' src/contexts/AuthContext.tsx`
- `sed -n '1,260p' src/components/layout/AdminHeader.tsx`
- `sed -n '1,220p' src/hooks/use-runtime-payment-environment.ts`
- `sed -n '330,420p' supabase/functions/verify-payment-status/index.ts`
- `sed -n '100,380p' supabase/functions/_shared/payment-finalization.ts`

### Consulta remota ao Supabase
Autenticação feita por `POST /auth/v1/token?grant_type=password` com o usuário informado pelo solicitante.

Principais consultas executadas:
- `GET /rest/v1/sales?...&id=eq.30400fef-99fe-4418-8357-7085b000c823`
- `GET /rest/v1/sale_logs?...&sale_id=eq.30400fef-99fe-4418-8357-7085b000c823`
- `GET /rest/v1/sale_integration_logs?...or=(sale_id.eq.30400fef-99fe-4418-8357-7085b000c823,external_reference.eq.30400fef-99fe-4418-8357-7085b000c823)`
- `GET /rest/v1/tickets?select=*&sale_id=eq.30400fef-99fe-4418-8357-7085b000c823`
- `GET /rest/v1/seat_locks?select=*&sale_id=eq.30400fef-99fe-4418-8357-7085b000c823`
- `GET /rest/v1/companies?select=id,name,is_active&id=eq.a0000000-0000-0000-0000-000000000001`
- `GET /rest/v1/events?select=*&id=eq.aa5d23a6-8b06-430f-8a52-b419ba2ea378`
- `GET /rest/v1/user_roles?select=user_id,company_id,role&user_id=eq.27add21e-ade9-436a-9ec2-185a3d7819cc`

## 1. Fonte real da tela `/admin/diagnostico-vendas`

### Arquivo e função que renderizam a rota
- A rota `/admin/diagnostico-vendas` é registrada em `src/App.tsx` e renderiza o componente `SalesDiagnostic`.
- O item de menu fica em `src/components/layout/AdminSidebar.tsx` e é restrito ao papel `developer`.
- A implementação real da tela está em `src/pages/admin/SalesDiagnostic.tsx`.

### Query principal da listagem
A tela monta a listagem principal a partir de `sales`:

```ts
supabase
  .from('sales')
  .select(`
    *,
    event:events(name, date),
    company:companies(name)
  `)
  .order('created_at', { ascending: false })
  .limit(100)
```

Conclusão objetiva:
- **Fonte primária da grade/KPIs:** `sales`
- **Enriquecimento no mesmo select:** `events` e `companies`
- **Enriquecimento adicional em chamadas separadas:**
  - `tickets` para contagem por `sale_id`
  - `seat_locks` para lock ativo/expirado/ausente por `sale_id`
- **Não depende de `sale_logs` nem `sale_integration_logs` para incluir a venda na grade**

### Fontes usadas no modal de detalhe
Ao abrir “Ver detalhes da venda”, a tela busca em paralelo:
- `sale_logs` por `sale_id`
- `sale_integration_logs` por `sale_id`
- `companies` por `sale.company_id`

Ou seja:
- **A tabela principal não é construída a partir de incidentes/logs.**
- **Os logs são apenas complementares no detalhe.**

### O que a tela efetivamente lê
| Parte da tela | Fonte real |
|---|---|
| Grade principal | `sales` |
| Nome do evento na grade | relação `events(name, date)` |
| Nome da empresa na grade/detalhe | relação `companies(name)` |
| KPIs do topo | array `sales` já carregado |
| Diagnóstico operacional da linha | campos de `sales` + contagem em `tickets` + leitura em `seat_locks` |
| Linha do tempo funcional | `sale_logs` |
| Webhook/payloads técnicos | `sale_integration_logs` |

### A tela mostra vendas ou incidentes?
**Mostra vendas.**
Mais precisamente:
- primeiro carrega até 100 linhas de `sales`;
- depois calcula um diagnóstico operacional para cada venda carregada;
- só no modal complementa com trilha funcional/técnica.

Ela **não** faz uma consulta tipo “listar somente vendas com incidentes/logs”.

## 2. Como a empresa ativa é resolvida

### Origem da empresa ativa na UI
A empresa ativa vem de `AuthContext`:
1. carrega `profiles`;
2. carrega `user_roles`;
3. carrega empresas acessíveis em `companies`;
4. escolhe a empresa ativa com prioridade:
   - `localStorage` válido,
   - senão `profile.company_id` se existir entre as empresas ativas,
   - senão a primeira empresa da lista.

O cabeçalho administrativo mostra a empresa ativa em um dropdown (`AdminHeader`) e permite alternar com `switchCompany(company.id)`.

### Regra aplicada especificamente nesta tela
Na `fetchSales`, o filtro por empresa **só** é aplicado se o usuário **não** for developer:

```ts
if (!isDeveloper && activeCompanyId) {
  query = query.eq('company_id', activeCompanyId);
}
```

A mesma lógica é repetida na carga dos eventos do filtro.

### Consequência prática
- Para **gerente/operador**: a tela respeita `activeCompanyId`.
- Para **developer**: a tela **ignora completamente** `activeCompanyId` e faz leitura cross-company.

### Evidência do caso analisado
No banco, o usuário informado possui:
- `user_roles.company_id = 3838e687-1a01-4bae-a979-e3ac5356e87e`, `role = gerente`
- `user_roles.company_id = a0000000-0000-0000-0000-000000000001`, `role = developer`

No `AuthContext`, existe ainda o override para o usuário `27add21e-ade9-436a-9ec2-185a3d7819cc`, garantindo papel efetivo `developer` em qualquer empresa ativa.

**Conclusão objetiva:** na tela `/admin/diagnostico-vendas`, para esse usuário, a empresa escolhida no cabeçalho **não recorta a consulta principal**. A UI mostra uma empresa ativa, mas a query da tela não a respeita quando o papel efetivo é `developer`.

### Resposta objetiva ao ponto do solicitante
> A venda criada em Sandbox deveria aparecer ao selecionar “Empresa Padrão (Teste)”? 

**Sim, deveria aparecer.**
Mas não porque a tela esteja filtrando corretamente pela empresa ativa. Ela deveria aparecer **por coincidência favorável**, porque a consulta de developer está sem filtro e a venda também está entre as 100 mais recentes.

### Risco operacional confirmado
Há risco concreto de:
- mostrar dados de empresa errada para quem estiver como developer;
- ocultar a semântica “empresa ativa” porque o cabeçalho sugere um recorte que a query não aplica;
- induzir o operador a acreditar que o painel está isolado por empresa quando, para developer, não está.

## 3. Como o ambiente é resolvido

### Ambiente da aplicação no cabeçalho
O cabeçalho usa `useRuntimePaymentEnvironment()` para exibir badge global “Sandbox” quando a aplicação roda nesse ambiente. Essa resolução vem de:
1. `VITE_PAYMENT_ENVIRONMENT`, ou
2. edge function `get-runtime-payment-environment`, ou
3. fallback por hostname.

Isso é **ambiente global da aplicação**, não filtro de dados da grade.

### Ambiente da venda na grade
Na grade, o ambiente exibido em cada linha vem de `sale.payment_environment`:
- `'production'` => “Produção”
- qualquer outro valor / ausência => “Sandbox” no label visual

### A query principal filtra ambiente?
**Não.**
A tela:
- não possui select/filtro de ambiente;
- não aplica `.eq('payment_environment', ...)`;
- não separa a grade entre sandbox e produção;
- apenas exibe um badge com o valor persistido da venda.

### Como logs técnicos tratam ambiente no detalhe
No detalhe, a aba de webhook compara:
- `detailSale.payment_environment`
- `webhookLog.payment_environment`
- `environment_decision_source`
- `environment_host_detected`

Mas isso acontece apenas no modal, não na grade/KPIs.

### Resposta objetiva pedida
> A tela respeita ou não respeita o ambiente corretamente?

**Não respeita o ambiente corretamente como recorte de listagem.**
Motivos:
1. não há filtro explícito por ambiente;
2. a grade mistura vendas sandbox e produção no mesmo dataset;
3. o badge global “Sandbox” do cabeçalho pode sugerir que os dados listados já estão restritos ao ambiente atual, mas não estão;
4. o diagnóstico resumido da grade usa principalmente `sales`, sem cruzar com `sale_integration_logs` para validar divergências de ambiente ou reconciliação técnica.

Observação conservadora: a tela **lê** `sales.payment_environment` e o **mostra**, mas **não o usa para recortar a consulta**.

## 4. Filtros reais e critérios de inclusão/exclusão da listagem

### Filtros efetivos da query principal
Aplicados no servidor:
- `company_id = activeCompanyId` **somente quando não é developer**
- busca textual em `customer_name`, `customer_cpf`, `id`
- `status`
- `event_id`
- intervalo `created_at >= dateFrom`
- intervalo `created_at <= dateTo 23:59:59.999`
- ordenação por `created_at desc`
- limite de `100` linhas

Aplicados apenas no cliente depois da consulta:
- `gateway`
- `paymentStatus`

### O que NÃO é critério de inclusão da grade
A venda **não precisa** ter para aparecer:
- `sale_logs`
- `sale_integration_logs`
- `tickets`
- `seat_locks`
- `asaas_payment_id`
- webhook recebido
- passagem gerada

### Critérios que fazem a venda aparecer
A venda aparece se:
1. estiver entre as **100 mais recentes** da consulta base;
2. passar pelos filtros visíveis ativos (`search`, `status`, `eventId`, `dateFrom`, `dateTo`, `gateway`, `paymentStatus`);
3. em perfis não-developer, pertencer ao `activeCompanyId`.

### Critérios que fazem a venda sumir
A venda pode sumir da grade por:
1. estar fora do recorte de **100** linhas mais recentes;
2. filtro de busca (`customer_name`, `customer_cpf`, `id`) não combinar;
3. filtro de status excluir o status atual;
4. filtro de evento excluir o `event_id`;
5. filtro de data excluir `created_at`;
6. filtro client-side de gateway excluir o gateway detectado (`Asaas`, `Stripe`, `Manual`);
7. filtro client-side de “Status Pagamento” excluir o label derivado de `computePaymentStatus`;
8. para não-developer, `company_id` diferente da empresa ativa.

### Critérios que NÃO somem a venda, mas mudam o diagnóstico
- ausência de `tickets`
- ausência de `seat_locks`
- ausência de `sale_logs`
- ausência de `sale_integration_logs`
- ausência de webhook

Esses fatores mudam a narrativa/diagnóstico da linha, mas **não impedem a venda de entrar na lista**.

### Importante: a grade não busca por incidente
A grade é “**lista de vendas com diagnóstico calculado**”, não “lista de incidentes de venda”.

## 5. Caso real — venda `30400fef-99fe-4418-8357-7085b000c823`

## Confirmações no banco
### Registro em `sales`
A venda **existe** em `sales` com os seguintes campos relevantes:
- `id`: `30400fef-99fe-4418-8357-7085b000c823`
- `company_id`: `a0000000-0000-0000-0000-000000000001`
- `event_id`: `aa5d23a6-8b06-430f-8a52-b419ba2ea378`
- `status`: `cancelado`
- `payment_environment`: `sandbox`
- `asaas_payment_id`: `pay_fmmatycwsg7n9830`
- `asaas_payment_status`: `PENDING`
- `sale_origin`: `online_checkout`
- `cancel_reason`: `Reserva expirada automaticamente após 15 minutos sem confirmação de pagamento`
- `created_at`: `2026-03-22T11:43:03.990822+00:00`
- `updated_at`: `2026-03-22T12:00:00.952296+00:00`

### Empresa da venda
A `company_id` da venda corresponde a:
- `Empresa Padrão (Teste)`
- `id = a0000000-0000-0000-0000-000000000001`
- `is_active = true`

### Evento da venda
O evento existe e está:
- `name = NOVA MUTUM`
- `status = a_venda`
- `is_archived = false`
- `company_id = a0000000-0000-0000-0000-000000000001`

### Tickets e seat locks
Consultas remotas mostraram:
- `tickets` da venda: `[]`
- `seat_locks` da venda: `[]`

### Trilhas funcionais e técnicas
Em `sale_logs`:
- houve `payment_create_started`
- houve `payment_create_completed`
- houve várias tentativas `payment_finalize_started`
- houve várias falhas `payment_finalize_failed`
- houve `auto_cancelled`

A mensagem repetida nas falhas de finalização foi:
- `error_code=sale_update_failed`
- detalhe: `there is no unique or exclusion constraint matching the ON CONFLICT specification`

Em `sale_integration_logs`:
- houve `create_payment` com `processing_status=requested`
- houve `create_payment` com `processing_status=success`
- houve várias entradas `verify_payment_status` com `processing_status=partial_failure`
- mensagem repetida: `Pagamento confirmado, mas a passagem não foi gerada durante verify-payment-status`

## A venda deveria aparecer na tela?
**Sim.**
Pelos critérios da tela, ela deveria aparecer porque:
- existe em `sales`;
- está entre as vendas mais recentes;
- pertence à empresa de teste;
- não depende de ticket/log para entrar na grade;
- não há filtro obrigatório de ambiente;
- o status `cancelado` continua sendo incluído quando o filtro está em `Todos`.

## Então por que ela “não aparece corretamente”? 
### Conclusão principal
A evidência aponta que o problema **não é de persistência da venda em `sales`** e **não é de exclusão por join/log/ticket**.

O problema mais provável e mais bem suportado pelas evidências é duplo:

#### 1) A tela não respeita o recorte de empresa para developer
Para o usuário analisado, a tela ignora `activeCompanyId`. Logo, a noção de “empresa correta selecionada” não é confiável no nível da query.

#### 2) A grade diagnostica pelo estado persistido em `sales`, não pela trilha técnica confirmada
No caso real:
- `sale_integration_logs` indica pagamento confirmado com falha parcial na finalização;
- mas `sales` permaneceu com `status = cancelado` e `asaas_payment_status = PENDING`;
- como a grade calcula `paymentStatus` e `hasGatewayDivergence` quase exclusivamente com base em `sales`, ela não sobe esse caso como “pagamento confirmado, venda pendente/cancelada”.

Resultado prático:
- a venda pode até estar na lista,
- mas o diagnóstico resumido da linha fica **semanticamente incorreto/incompleto**,
- porque o sinal mais importante do incidente ficou preso em `sale_integration_logs` e não é usado na grade/KPIs.

## 6. Vendas x incidentes; grade x KPIs

### KPIs do topo usam a mesma fonte da tabela?
**Sim.**
Os KPIs são derivados do mesmo array `salesWithOperationalView`, que por sua vez nasce do array `sales` carregado pela query principal.

### Pode existir venda real no banco sem aparecer na grade principal?
**Sim.**
Motivos confirmados no código:
- limite fixo de 100 vendas;
- filtros ativos;
- filtro de empresa para não-developer.

### Pode existir métrica agregada diferente da listagem real?
No sentido de fonte base, **não**: KPIs e grade usam o mesmo array.

Mas existe uma diferença operacional importante:
- a grade/KPIs usam sobretudo `sales` + `tickets` + `seat_locks`;
- o detalhe usa `sale_logs` + `sale_integration_logs`;
- portanto a visão agregada pode parecer “saudável/cancelada/pendente” mesmo quando o detalhe técnico mostra pagamento confirmado com falha parcial.

### Resposta objetiva
A tela mostra **vendas com diagnóstico resumido**, não uma lista confiável de incidentes técnicos.

## 7. UX / mensagens que contribuem para a confusão

### Empresa ativa
- O cabeçalho mostra a empresa ativa com clareza visual.
- Porém, para developer, a query da tela não usa essa empresa ativa.
- Isso cria **falsa sensação de recorte multiempresa correto**.

### Ambiente ativo
- O cabeçalho mostra um badge global “Sandbox”.
- A grade também mostra badge por venda (“Sandbox”/“Produção”).
- Porém não existe filtro explícito de ambiente.
- Isso pode induzir o operador a concluir que “estou vendo só sandbox”, quando na verdade o badge do cabeçalho não limita a consulta.

### Origem do diagnóstico
- A UI não deixa claro, na grade, que o diagnóstico resumido depende majoritariamente de `sales`, `tickets` e `seat_locks`.
- Também não deixa claro que `sale_integration_logs` só entram no modal.

### Ausência de venda vs ausência de log
- A tela não diferencia com clareza “venda inexistente” de “venda existe, mas sem logs”.
- O empty state apenas diz “Nenhuma venda encontrada”, sem explicar se o motivo foi empresa, data, ambiente, limite de 100, busca etc.

### Caso específico desta venda
A UI pode induzir o operador a interpretar o caso como:
- “pagamento ainda pendente” ou
- “venda só expirou/cancelou normalmente”

quando a trilha técnica real indica algo bem mais grave:
- **pagamento confirmado no Asaas / verify**,
- **falha na finalização**,
- **passagem não gerada**,
- **venda acabou auto-cancelada**.

## Causa raiz confirmada ou causas prováveis com grau de confiança

### Confirmado — alta confiança
1. **A tela é baseada em `sales`, não em incidentes/logs.**
2. **A grade não exige logs/tickets para incluir a venda.**
3. **A tela ignora `activeCompanyId` quando o usuário é developer.**
4. **Não existe filtro explícito por ambiente na listagem.**
5. **A venda `30400fef-99fe-4418-8357-7085b000c823` existe em `sales`, pertence à Empresa Padrão (Teste), está em sandbox e deveria estar elegível para a grade.**
6. **`sale_integration_logs` mostram confirmação de pagamento com falha parcial, enquanto `sales` permaneceu cancelada/PENDING.**

### Muito provável — alta confiança
7. **O motivo pelo qual a venda “não aparece corretamente” é que o resumo da grade usa o estado persistido em `sales` e ignora o incidente já registrado em `sale_integration_logs`.**

### Provável — média/alta confiança
8. **Existe um problema a montante da tela no fluxo de finalização do pagamento**, evidenciado por `sale_logs.payment_finalize_failed` com detalhe `sale_update_failed` / `there is no unique or exclusion constraint matching the ON CONFLICT specification`, que impede a venda de refletir corretamente o pagamento confirmado.

Observação conservadora: a análise desta etapa não localizou exatamente qual `ON CONFLICT` a montante está falhando no banco, apenas confirmou a falha pela trilha persistida e pelo ponto do backend que deveria transicionar a venda para `pago`.

## Risco operacional atual

### Alto
Porque hoje o painel pode simultaneamente:
- sugerir que está filtrado pela empresa ativa quando não está (developer);
- sugerir leitura coerente de sandbox/produção sem filtrar ambiente;
- mostrar um resumo da venda baseado em `sales` que contradiz a trilha técnica de integração;
- esconder da grade/KPI principal um incidente severo de confirmação sem emissão de passagem.

Em termos operacionais, isso reduz auditabilidade e previsibilidade exatamente no cenário mais sensível: cobrança confirmada sem finalização consistente.

## Correção mínima recomendada (sem implementar ainda)

### Ajustes prioritários na tela
1. **`src/pages/admin/SalesDiagnostic.tsx`**
   - aplicar `company_id = activeCompanyId` também no modo developer, ou introduzir um seletor explícito “todas as empresas” vs “empresa ativa” com comportamento inequívoco;
   - adicionar filtro explícito de ambiente (`payment_environment`);
   - deixar explícito na UI qual recorte está ativo (empresa e ambiente);
   - na grade/KPIs, distinguir “estado persistido da venda” de “incidente técnico detectado em logs”.

2. **`src/components/layout/AdminHeader.tsx`**
   - revisar a semântica do badge global “Sandbox” para não parecer filtro da grade quando é apenas ambiente global da aplicação.

### Ajustes a montante, fora da tela, mas diretamente relacionados ao caso real
3. **`supabase/functions/_shared/payment-finalization.ts`** e fluxo associado
   - investigar a causa real do `sale_update_failed` registrado nos logs;
   - garantir que confirmação de pagamento reflita corretamente `sales.status` / `sales.asaas_payment_status` ou, no mínimo, que a divergência fique explícita na camada diagnóstica.

4. **`supabase/functions/verify-payment-status/index.ts`**
   - revisar o caminho em que `partial_failure` é persistido para que o painel consiga refletir esse incidente sem depender apenas do estado final de `sales`.

## Resposta final consolidada

### A tela está lendo a fonte certa?
**Parcialmente.**
Ela lê a fonte certa para listar vendas (`sales`), mas **não** lê a fonte suficiente para representar incidentes técnicos reais na grade principal.

### A tela respeita empresa corretamente?
**Não, para developer não respeita.**

### A tela respeita ambiente corretamente?
**Não como recorte de listagem.** Ela apenas exibe o ambiente persistido da venda.

### Por que a venda real não apareceu corretamente?
Porque o incidente real ficou registrado em `sale_integration_logs` / `sale_logs`, enquanto a grade resume o caso pelo estado persistido em `sales`, que terminou como `cancelado` + `asaas_payment_status = PENDING`. Além disso, o recorte por empresa é semanticamente frágil para developer.
