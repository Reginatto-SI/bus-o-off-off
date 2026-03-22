# Análise técnica profunda — filtros/data da tela `/admin/diagnostico-vendas`

## Objetivo

Investigar com evidência, sem corrigir ainda, por que a tela `/admin/diagnostico-vendas` não retorna a venda esperada quando filtros visíveis — principalmente os de data — são aplicados, mesmo em casos em que a passagem já foi gerada com sucesso.

O foco desta análise é confirmar exatamente:

1. qual query a tela executa hoje;
2. em que etapa a venda recente entra ou sai;
3. qual campo temporal está sendo filtrado;
4. se existe erro de timezone/conversão de data;
5. se há divergência entre o que a UI sugere e o que a implementação realmente filtra;
6. se KPI e grade usam a mesma base;
7. se o limite de 100 linhas pode ocultar casos reais.

---

## Arquivos inspecionados

- `src/pages/admin/SalesDiagnostic.tsx`
- `src/contexts/AuthContext.tsx`
- `src/App.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `.env`
- documentos prévios de análise já existentes no repositório para contexto histórico:
  - `docs/analise-diagnostico-vendas-2026-03-21.md`
  - `analise-7-diagnostico-vendas-empresa-ambiente.md`
  - `analise-9-fechamento-ambiguidades-diagnostico-vendas.md`
  - `analise-10-correcao-empresa-ativa-diagnostico-vendas.md`

---

## Ambiente e contexto real usados na investigação

### Usuário autenticado usado para reproduzir
- email: `edimarreginato@gmail.com`
- user_id: `27add21e-ade9-436a-9ec2-185a3d7819cc`

### Empresa ativa resolvida pelo código para esse usuário
Pelo `AuthContext`, a empresa ativa é resolvida na ordem:
1. `localStorage` válido
2. `profiles.company_id`
3. primeira empresa ativa disponível

No banco, `profiles.company_id` deste usuário está em:
- `a0000000-0000-0000-0000-000000000001`
- nome: `Empresa Padrão (Teste)`

Este é o melhor proxy objetivo para “empresa ativa” em ambiente não interativo, porque não foi possível inspecionar o `localStorage` do navegador nesta etapa.

### Empresas vinculadas ao usuário
- `a0000000-0000-0000-0000-000000000001` — `Empresa Padrão (Teste)`
- `3838e687-1a01-4bae-a979-e3ac5356e87e` — `BUSÃO OFF OFF`

### Caso real principal usado
A venda mais recente elegível da empresa ativa (`a000...`) que já gerou passagem é:

- **sale_id:** `07ce8f4b-83be-4b27-8cd4-9acd9cd2aa38`
- cliente: `Lucas Pedroso`
- status: `pago`
- `asaas_payment_status`: `CONFIRMED`
- `payment_environment`: `sandbox`
- `created_at`: `2026-03-22T12:23:32.935164+00:00`
- `updated_at`: `2026-03-22T12:24:10.732596+00:00`
- tickets gerados: `SB-000086` e `SB-000087`

### Caso auxiliar explicitamente pedido pelo usuário
- `ticket_number`: `SB-000086`
- pertence à venda `07ce8f4b-83be-4b27-8cd4-9acd9cd2aa38`

---

## Evidência bruta consultada no banco

### Venda principal
```json
{
  "id": "07ce8f4b-83be-4b27-8cd4-9acd9cd2aa38",
  "company_id": "a0000000-0000-0000-0000-000000000001",
  "payment_environment": "sandbox",
  "status": "pago",
  "asaas_payment_status": "CONFIRMED",
  "created_at": "2026-03-22T12:23:32.935164+00:00",
  "updated_at": "2026-03-22T12:24:10.732596+00:00",
  "event_id": "aa5d23a6-8b06-430f-8a52-b419ba2ea378",
  "customer_name": "Lucas Pedroso",
  "customer_cpf": "06610443190",
  "reservation_expires_at": null,
  "asaas_payment_id": "pay_60j08zmxj7b4pq2t",
  "stripe_checkout_session_id": null,
  "stripe_payment_intent_id": null,
  "sale_origin": "online_checkout"
}
```

### Tickets gerados
```json
[
  {
    "id": "f63603e0-7cc6-4436-aba8-1be9a1b79ef9",
    "ticket_number": "SB-000086",
    "created_at": "2026-03-22T12:24:09.645999+00:00"
  },
  {
    "id": "41d41502-2d6f-43d7-8a87-bf12cabc053a",
    "ticket_number": "SB-000087",
    "created_at": "2026-03-22T12:24:09.645999+00:00"
  }
]
```

### Presença de trilhas operacionais
- `sale_logs`: 5 registros
- `sale_integration_logs`: 3 registros

### Últimos `sale_logs`
- `payment_create_started` — `2026-03-22T12:23:35.879672+00:00`
- `payment_create_completed` — `2026-03-22T12:23:37.300262+00:00`
- `payment_finalize_started` — `2026-03-22T12:24:08.721385+00:00`
- `payment_finalize_completed` — `2026-03-22T12:24:10.525168+00:00`
- `payment_confirmed` — `2026-03-22T12:24:10.931548+00:00`

### Últimos `sale_integration_logs`
- `create_payment / requested` — `2026-03-22T12:23:36.175992+00:00`
- `create_payment / success` — `2026-03-22T12:23:36.885488+00:00`
- `verify_payment_status / success` — `2026-03-22T12:24:11.130451+00:00`

Conclusão desta etapa: **a venda existe, está paga, tem ticket gerado e tem rastros completos de integração/finalização**.

---

## 1. Query base real executada pela tela hoje

## Tabela principal
A consulta parte de `sales`.

## Joins/relacionamentos carregados na query principal
A tela faz:
- `event:events(name, date)`
- `company:companies(name)`

Ou seja: o dado bruto principal vem de `sales`, com enriquecimento inline de `event` e `company`.

## Ordenação
- `order('created_at', { ascending: false })`

## Limite
- `limit(100)`

## Filtros server-side aplicados antes de executar a query
Na ordem em que aparecem no código:
1. `company_id = activeCompanyId` se houver empresa ativa
2. busca textual via `.or(...)`
3. `status = filters.status`
4. `event_id = filters.eventId`
5. `created_at >= new Date(filters.dateFrom).toISOString()`
6. `created_at <= toDate.toISOString()` após `toDate.setHours(23, 59, 59, 999)`

## Query lógica equivalente
```sql
SELECT
  sales.*,
  events.name,
  events.date,
  companies.name
FROM sales
LEFT JOIN events ON events.id = sales.event_id
LEFT JOIN companies ON companies.id = sales.company_id
WHERE 1 = 1
  AND sales.company_id = :activeCompanyId                -- quando existir
  AND (
    sales.customer_name ILIKE :search
    OR sales.customer_cpf ILIKE :search
    OR sales.id ILIKE :search
  )                                                     -- quando search != ''
  AND sales.status = :status                            -- quando status != 'all'
  AND sales.event_id = :eventId                         -- quando eventId != 'all'
  AND sales.created_at >= :dateFromIso                  -- quando dateFrom != ''
  AND sales.created_at <= :dateToIso                    -- quando dateTo != ''
ORDER BY sales.created_at DESC
LIMIT 100;
```

## Enriquecimento pós-query, ainda antes do render
Depois da query base, a tela faz chamadas adicionais para os `saleIds` retornados:
- `tickets` para contar passagens por venda
- `seat_locks` para calcular lock ativo/expirado/ausente

Essas chamadas **não removem** a venda; apenas agregam colunas derivadas.

## Filtros client-side aplicados depois do mapeamento
Apenas dois filtros são realmente client-side:
1. `gateway`
2. `paymentStatus`

Eles rodam sobre `mapped`, depois que os dados já voltaram do servidor.

## Ordenação final exibida na grade
A grade **não mantém** simplesmente `created_at desc`. Ela passa por `salesWithOperationalView`, que:
1. calcula `computeOperationalView(sale)`
2. ordena primeiro por `operational.priority`
3. em empate, por `created_at desc`

Isto altera a ordem visual da grade, mas **não remove** registros.

---

## 2. A venda recente que gerou ticket entra na query bruta?

## Resposta curta
**Sim.**

## Evidência
Sem filtros adicionais além de `company_id = a000...`, a venda principal aparece no resultado bruto de `sales` com `order=created_at.desc&limit=100`.

Resultado observado para a venda alvo:
```json
[
  {
    "id": "07ce8f4b-83be-4b27-8cd4-9acd9cd2aa38",
    "created_at": "2026-03-22T12:23:32.935164+00:00",
    "status": "pago"
  }
]
```

## Conclusão
- entra no banco: **sim**
- entra na query base sem filtros de data/texto adicionais: **sim**
- entra entre as 100 mais novas da empresa ativa: **sim**

Portanto, **o problema não é ausência da venda na base nem exclusão pelo `limit(100)` no contexto atual analisado**.

---

## 3. A venda recente é removida por algum filtro client-side?

## Gateway
A venda tem `asaas_payment_id`, então `computeGateway(sale)` retorna `Asaas`.

Se o filtro `gateway` estiver em:
- `all` → passa
- `asaas` → passa
- `stripe` → sai
- `manual` → sai

No cenário real investigado, **não há evidência de que ela suma por `gateway`**, desde que o operador selecione o valor coerente.

## Payment status
A venda tem `asaas_payment_status = CONFIRMED`.
Logo `computePaymentStatus(sale)` retorna:
- label: `Pagamento confirmado`

Se `filters.paymentStatus` estiver em:
- `all` → passa
- `pago` → passa
- `aguardando` → sai
- `falhou` → sai

Também aqui, **não há remoção indevida** quando o filtro usado é coerente com a venda.

## Busca textual
A busca textual **não é client-side**; ela é aplicada no servidor.
Mesmo assim, para rastreio da jornada, ela é problemática:

- a UI promete: `Nome, CPF, ID da venda ou evento...`
- a implementação consulta apenas:
  - `customer_name`
  - `customer_cpf`
  - `id`
- `event.name` **não entra** na query de busca
- `ticket_number` **não entra** na busca
- e o trecho `id.ilike.%texto%` em uma coluna UUID gera erro de operador no Postgres/PostgREST

Ao reproduzir a semântica atual da tela com busca por `Lucas` ou `SB-000086`, o backend respondeu:
```json
{
  "code": "42883",
  "message": "operator does not exist: uuid ~~* unknown"
}
```

Ou seja: **qualquer busca textual não vazia tende a quebrar a query atual**, além de não cobrir ticket nem evento, apesar do placeholder sugerir isso.

## Status da venda
O filtro `status` é server-side. Para a venda principal:
- `all` → passa
- `pago` → passa
- qualquer outro status → sai por regra coerente

## Evento
O filtro `eventId` também é server-side. Para a venda principal:
- `all` → passa
- `aa5d23a6-8b06-430f-8a52-b419ba2ea378` → passa
- outro evento → sai por regra coerente

## Data inicial/final
Os filtros de data são server-side e aqui está o problema principal confirmado.
A venda **não é removida por filtro client-side de data**; ela é removida **antes**, na query SQL/PostgREST de `sales.created_at`.

## Transformações adicionais antes do render
- contagem de tickets: não remove
- leitura de `seat_locks`: não remove
- `map` para colunas derivadas: não remove
- `salesWithOperationalView.sort(...)`: apenas reordena

## Conclusão desta etapa
Para o caso principal:
- `gateway`: **não remove indevidamente**
- `paymentStatus`: **não remove indevidamente**
- busca textual: **é defeituosa**, mas em outra camada
- data: **remove no servidor**, não no client-side

---

## 4. O filtro de data usa exatamente qual campo?

## Resposta objetiva
A tela filtra **exatamente por `sales.created_at`**.

Ela **não** filtra por:
- `updated_at`
- data do evento
- data do pagamento confirmado
- data do ticket
- data de `sale_logs`
- data de `sale_integration_logs`

## Consequência semântica
Se o operador pensa:
- “quero ver pagamento de hoje”
- “quero ver a passagem gerada hoje”
- “quero ver o que foi confirmado hoje”

...a tela **não entrega essa intenção**. Ela entrega apenas:
- “vendas cuja `created_at` caiu dentro do intervalo filtrado”

No caso principal isso ainda deveria encontrar a venda, porque `created_at` também é de hoje. Porém a implementação de timezone do filtro faz com que **mesmo esse caso correto semanticamente seja cortado** em alguns fusos.

---

## 5. Existe problema de timezone/localidade nos filtros de data?

## Resposta curta
**Sim. Problema confirmado.**

## Como a conversão acontece hoje
### `dateFrom`
```ts
new Date(filters.dateFrom).toISOString()
```

### `dateTo`
```ts
const toDate = new Date(filters.dateTo);
toDate.setHours(23, 59, 59, 999);
toDate.toISOString();
```

## Por que isso é perigoso
O `input type="date"` entrega valor no formato ISO curto:
- `2026-03-22`

Em JavaScript, `new Date('2026-03-22')` é interpretado como **meia-noite em UTC**.

Em `America/Sao_Paulo` (UTC-03), isso vira localmente:
- `Sat Mar 21 2026 21:00:00 GMT-0300`

A partir daí, `setHours(23,59,59,999)` atua no **fuso local**, não em UTC.
Resultado: o limite final desloca para um intervalo truncado.

## Simulação objetiva
### Em UTC
Para `2026-03-22`:
- `dateFrom` → `2026-03-22T00:00:00.000Z`
- `dateTo` → `2026-03-22T23:59:59.999Z`

### Em `America/Sao_Paulo`
Para `2026-03-22`:
- `dateFrom` → `2026-03-22T00:00:00.000Z`
- objeto local representado como `21/03/2026 21:00:00 -03`
- após `setHours(23:59:59.999)`:
- `dateTo` → `2026-03-22T02:59:59.999Z`

Ou seja, com ambos os filtros preenchidos com `2026-03-22`, a janela efetiva vira:
- de `2026-03-22T00:00:00.000Z`
- até `2026-03-22T02:59:59.999Z`

Isso representa apenas as **primeiras 3 horas do dia UTC**, e não o “dia inteiro” esperado pelo operador brasileiro.

## Exemplo concreto com a venda principal
Venda:
- `created_at = 2026-03-22T12:23:32.935164+00:00`

### Se o filtro fosse o dia inteiro em UTC correto
Intervalo:
- `2026-03-22T00:00:00.000Z`
- `2026-03-22T23:59:59.999Z`

Resultado:
- a venda **entra**

### Com a implementação atual em navegador UTC-03
Intervalo:
- `2026-03-22T00:00:00.000Z`
- `2026-03-22T02:59:59.999Z`

Resultado:
- a venda **fica de fora**

Isso foi confirmado reproduzindo a query do servidor com esse intervalo truncado: o resultado voltou vazio.

## Conclusão
O problema de data/timezone **não é hipótese**; ele está confirmado por:
1. leitura do código;
2. simulação do JavaScript com timezone `America/Sao_Paulo`;
3. reprodução da query real contra o banco com a janela truncada;
4. ausência da venda principal nesse intervalo incorreto.

---

## 6. O filtro de data final inclui corretamente o fim do dia no timezone do usuário?

## Resposta curta
**Não.**

## Motivo técnico
O código faz:
1. `new Date('YYYY-MM-DD')` → cria meia-noite em UTC
2. `setHours(23,59,59,999)` → modifica a hora local do objeto
3. `toISOString()` → converte novamente para UTC

Isso é uma mistura inconsistente de:
- parsing baseado em UTC
- ajuste de hora baseado em timezone local
- serialização final em UTC

## Efeito prático
No timezone do usuário brasileiro, `dateTo = 2026-03-22` não representa o fim do dia `22/03/2026 23:59:59.999` em Brasília. Na prática, vira algo equivalente a:
- `21/03/2026 23:59:59.999 -03`
- serializado como `2026-03-22T02:59:59.999Z`

Portanto o filtro final **corta registros válidos do próprio dia 22**, inclusive registros de manhã, tarde e noite do horário local.

## Diagnóstico objetivo
A implementação atual **não inclui corretamente o fim do dia no timezone operacional brasileiro**.

---

## 7. Existe divergência entre a intenção da UI e a implementação do filtro?

## Sim, em dois níveis diferentes

### Nível 1 — semântica da data
A UI mostra:
- `Data inicial`
- `Data final`

Mas **não informa qual data** está sendo filtrada.
Na implementação, é `sales.created_at`.

Para uma tela chamada **Diagnóstico de Vendas**, em contexto operacional, o operador pode legitimamente interpretar “data” como:
- data da venda criada
- data do pagamento confirmado
- data da passagem gerada
- data do problema operacional

A tela não esclarece isso.

### Nível 2 — placeholder de busca textual
A busca sugere:
- `Nome, CPF, ID da venda ou evento...`

Mas a implementação:
- não busca `event.name`
- não busca `ticket_number`
- tenta aplicar `ILIKE` sobre UUID (`id`), o que é tecnicamente inválido no backend atual

### Nível 3 — caso `SB-000086`
Operacionalmente, é muito natural um atendente tentar localizar uma venda a partir do número oficial da passagem (`SB-000086`).
A tela, hoje:
- **não busca ticket_number**
- portanto o caso `SB-000086` **não aparece por busca textual**, mesmo que a venda exista e esteja saudável

## Conclusão semântica
A semântica atual da tela é **enganosa** em pelo menos três pontos:
1. não explicita que a data filtrada é `sales.created_at`;
2. o campo de busca promete `evento`, mas não implementa isso;
3. a experiência de diagnóstico não aceita o identificador operacional mais natural do caso (`ticket_number`).

---

## 8. Os KPIs do topo usam exatamente o mesmo conjunto filtrado da grade?

## Resposta curta
**Sim.**

## Evidência
Fluxo do código:
1. `fetchSales()` monta `filtered`
2. `setSales(filtered)`
3. `salesWithOperationalView` é derivado de `sales`
4. `operationalSummary` é derivado de `salesWithOperationalView`
5. a grade renderiza `salesWithOperationalView`
6. os cards usam `operationalSummary`

Logo:
- **cards e grade partem da mesma coleção `sales` já filtrada**
- não encontrei subconjunto alternativo para os KPIs

## Consequência
Se a venda some da grade por conta do filtro de data, ela também some dos KPIs.
Não há evidência, nesta tela, de KPI contar uma venda que a grade não mostra, nem o inverso.

---

## 9. Há risco de a venda estar fora por causa do limite de 100 registros?

## Resposta curta
**No caso investigado, não.**

## Evidência quantitativa
Contagem de vendas por empresa do usuário analisado:
- `Empresa Padrão (Teste)` (`a000...`): **83 vendas**
- `BUSÃO OFF OFF` (`3838...`): **16 vendas**

Portanto:
- a venda principal está entre as 100 mais novas da empresa ativa
- mesmo sem qualquer outro filtro, ela não estaria sendo cortada por `limit(100)`

## Avaliação arquitetural
Apesar de **não ser a causa do caso atual**, `limit(100)` é frágil para uma tela operacional de diagnóstico, porque:
- a consulta é recortada antes de alguns filtros client-side;
- o operador pode imaginar que está vendo “tudo que bate com os filtros”, mas na prática vê apenas “os 100 mais recentes que bateram nos filtros server-side”.

Então:
- **causa atual:** não
- **risco estrutural futuro:** sim

---

## 10. O filtro de ambiente deveria existir explicitamente nesta tela?

## Situação atual
A tela exibe `payment_environment` na linha/detalhe, mas **não oferece filtro explícito por ambiente**.

## Evidência observada no caso principal
A venda principal está em:
- `payment_environment = sandbox`

No caso da empresa ativa analisada, as vendas recentes elegíveis vistas na investigação também estão em sandbox. Então, para este caso específico, o ambiente **não foi a causa direta** da ausência.

## Avaliação arquitetural
Mesmo não sendo a causa direta aqui, a ausência de filtro explícito de ambiente contribui para confusão operacional porque:
- a tela é de diagnóstico, não apenas de listagem;
- em diagnóstico, ambiente é dimensão operacional primária;
- exibir o campo sem possibilitar recorte explícito força inspeção manual linha a linha;
- isso piora especialmente quando houver mistura futura entre sandbox/produção dentro do mesmo conjunto da empresa.

## Conclusão
- **causa direta do caso atual:** não confirmada
- **fonte de confusão operacional:** sim
- **necessidade arquitetural para uma tela de diagnóstico confiável:** alta

---

## 11. A venda recente aparece no banco com quais campos relevantes?

## Venda principal — campos solicitados
- `id`: `07ce8f4b-83be-4b27-8cd4-9acd9cd2aa38`
- `company_id`: `a0000000-0000-0000-0000-000000000001`
- `payment_environment`: `sandbox`
- `status`: `pago`
- `asaas_payment_status`: `CONFIRMED`
- `created_at`: `2026-03-22T12:23:32.935164+00:00`
- `updated_at`: `2026-03-22T12:24:10.732596+00:00`
- `event_id`: `aa5d23a6-8b06-430f-8a52-b419ba2ea378`
- presença de `tickets`: **sim** (2 tickets)
- presença de `sale_logs`: **sim** (5 logs)
- presença de `sale_integration_logs`: **sim** (3 logs)

## Campo auxiliar operacional relevante
- `asaas_payment_id`: `pay_60j08zmxj7b4pq2t`
- `sale_origin`: `online_checkout`

Conclusão: é um caso legítimo e completo para diagnosticar o problema, porque a venda **não está incompleta nem ambígua**.

---

## 12. Em que ponto exato a venda recente deixa de aparecer na tela?

## Resposta final resumida no formato solicitado
- entra no banco? **sim**
- entra na query base? **sim**, quando não há filtro de data truncado e não há busca textual preenchida
- entra no resultado bruto? **sim**, no recorte normal por empresa ativa
- passa pelos filtros client-side? **sim**, para `gateway=all/asaas` e `paymentStatus=all/pago`
- entra no array final renderizado? **sim**, quando a query base não a corta antes
- se não, qual regra exata a remove? **o filtro server-side em `sales.created_at` construído com `new Date('YYYY-MM-DD')` + `setHours(...)` + `toISOString()` em timezone local UTC-03, que reduz indevidamente `dateTo` para `2026-03-22T02:59:59.999Z` no caso de `22/03/2026`**

## Aplicando ao caso principal
Com filtro de data do dia `22/03/2026` em contexto Brasil:
- a venda tem `created_at = 2026-03-22T12:23:32.935164Z`
- a janela efetiva atual vira `2026-03-22T00:00:00.000Z` até `2026-03-22T02:59:59.999Z`
- a venda fica fora

Portanto, **ela some no servidor, antes de qualquer filtro client-side e antes do render**.

---

## Caso específico `SB-000086`: por que também não aparece na tela?

Há duas possibilidades operacionais distintas:

### Cenário A — operador tenta localizar pelo mesmo dia via filtro de data
Então `SB-000086` falha pelo **mesmo problema principal**: a venda mãe `07ce8f4b...` é cortada pelo filtro de `created_at` com timezone truncado.

### Cenário B — operador tenta localizar pelo número da passagem
Então falha por **segundo problema independente**:
- a tela não busca `ticket_number`
- portanto `SB-000086` nunca seria um critério de busca válido nesta implementação

### Agravante adicional
A busca textual atual ainda tenta `id.ilike`, o que gera erro de operador em UUID.
Então a busca não está apenas incompleta; ela está tecnicamente quebrável.

---

## Causa raiz confirmada e causas prováveis com grau de confiança

## Causa raiz confirmada #1 — filtro de data com bug de timezone
**Grau de confiança: muito alto**

Evidências:
- leitura direta do código
- simulação de JavaScript em `America/Sao_Paulo`
- reprodução da query com intervalo truncado
- venda real ficando de fora por esse intervalo

## Causa confirmada #2 — semântica da data não explicitada
**Grau de confiança: alto**

A UI não informa que filtra `sales.created_at`. Em uma tela diagnóstica, isso é semanticamente ambíguo.

## Causa confirmada #3 — busca textual inconsistente com o que a UI promete
**Grau de confiança: alto**

Evidências:
- placeholder promete evento
- implementação não busca evento
- não busca `ticket_number`
- `id.ilike` em UUID falha no backend atual

## Causa descartada no caso principal — limite de 100
**Grau de confiança: muito alto**

A empresa ativa analisada tem 83 vendas; a venda principal entra facilmente no top 100.

## Causa não confirmada como raiz do caso atual — ambiente
**Grau de confiança: médio**

O ambiente não removeu esta venda, mas a ausência de filtro explícito é um risco real de confusão operacional.

---

## Recomendação de correção em ordem de prioridade

> Observação: esta seção recomenda; não implementa.

### Prioridade 1 — corrigir a construção do intervalo de data
Objetivo:
- impedir truncamento por timezone
- tornar `dateFrom/dateTo` previsíveis e auditáveis

Essa é a **primeira correção mínima obrigatória**, porque é a causa direta confirmada do caso real.

### Prioridade 2 — explicitar na UI qual campo temporal está sendo filtrado
Objetivo:
- deixar claro se a data é da venda, do pagamento ou da passagem
- reduzir interpretação errada do operador

### Prioridade 3 — alinhar a busca textual ao que a UX promete
Objetivo:
- parar de aplicar `ILIKE` diretamente em UUID sem cast/estratégia segura
- incluir busca real por `ticket_number`
- incluir `event.name` apenas se a UI continuar prometendo isso

### Prioridade 4 — adicionar filtro explícito de ambiente
Objetivo:
- separar sandbox e produção explicitamente
- tornar a tela confiável para diagnóstico operacional

### Prioridade 5 — revisar o papel do `limit(100)` na tela diagnóstica
Objetivo:
- evitar falso sentimento de completude
- avaliar paginação ou estratégia de consulta mais transparente

### Prioridade 6 — revisão maior de semântica operacional da tela
Objetivo:
- separar claramente “data da venda”, “data do pagamento” e “data da passagem”
- consolidar a tela como ferramenta primária de suporte

Esta prioridade já tende para refatoração de produto/UX, não para correção mínima imediata.

---

## Riscos se nada for feito

1. **Falso negativo operacional**: venda paga com ticket gerado continuará “sumindo” ao filtrar por data.
2. **Perda de confiança da operação**: a equipe deixa de usar a tela como fonte confiável.
3. **Diagnósticos errados**: suporte pode concluir que webhook, ticketing ou pagamento falharam, quando o problema é apenas filtro incorreto.
4. **Ambiguidade persistente**: operadores continuarão sem saber se a data é da venda, pagamento ou passagem.
5. **Busca textual enganosa**: casos por `SB-000086` continuarão invisíveis, e buscas por texto podem continuar quebrando a consulta.
6. **Risco futuro de incompletude silenciosa**: `limit(100)` pode passar a ocultar casos sem aviso quando a base crescer.

---

## Resumo executivo final

A venda real mais recente da empresa ativa (`07ce8f4b-83be-4b27-8cd4-9acd9cd2aa38`, tickets `SB-000086` e `SB-000087`) **está correta no banco, entra na query base e passa pelos filtros client-side coerentes**. Ela deixa de aparecer **antes do render**, porque o filtro de data atua sobre `sales.created_at` e a conversão atual (`new Date('YYYY-MM-DD')` + `setHours` + `toISOString`) gera um intervalo truncado em timezone local brasileiro.

No caso de `22/03/2026`, a tela pode acabar consultando apenas até `2026-03-22T02:59:59.999Z`, excluindo uma venda criada às `12:23:32Z` do mesmo dia. Paralelamente, a tela também tem um segundo problema independente: a busca textual é semântica e tecnicamente inconsistente com a UX atual, pois não busca `ticket_number`, não busca `event.name` apesar do placeholder sugerir isso, e ainda tenta aplicar `ILIKE` em UUID.

Conclusão final: **o problema principal confirmado é uma combinação de filtro server-side por `sales.created_at` com bug de timezone, somado a uma semântica de busca/data enganosa para uso operacional**.
