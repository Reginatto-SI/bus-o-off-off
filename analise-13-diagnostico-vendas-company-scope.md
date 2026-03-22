# Análise de viabilidade profunda — `/admin/diagnostico-vendas`

## Objetivo

Investigar, com base no código real atual, se a tela administrativa `/admin/diagnostico-vendas` está corretamente amarrada à empresa ativa, se os filtros e KPIs compartilham o mesmo escopo, se a ordenação atende ao uso operacional e se existe risco de mistura entre empresas e ambientes.

---

## Escopo analisado

### Arquivos inspecionados
- `src/App.tsx`
- `src/components/layout/AdminHeader.tsx`
- `src/contexts/AuthContext.tsx`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/pages/admin/Sales.tsx`
- `src/pages/admin/SalesDiagnostic.tsx`
- `src/types/database.ts`

### Comandos usados
- `find /workspace -name AGENTS.md -print`
- `rg -n "/admin/diagnostico-vendas|diagnostico-vendas|SalesDiagnostic" . --glob '!node_modules' --glob '!dist' --glob '!build'`
- `rg -n "activeCompanyId|setActiveCompany|payment_environment|company_id" src --glob '!node_modules' --glob '!dist' --glob '!build'`
- Leituras direcionadas com `sed -n` e `nl -ba` nos arquivos acima.

---

## 1. Mapeamento da tela e fluxo atual

### Rota e componente principal
A rota `/admin/diagnostico-vendas` é registrada em `src/App.tsx` e renderiza `SalesDiagnostic`. A navegação da sidebar também aponta para essa mesma tela e a restringe a `developer` no menu lateral.

### Estrutura de dados da tela
A tela é concentrada em `src/pages/admin/SalesDiagnostic.tsx`.

Ela monta a experiência em quatro blocos principais:
1. **filtros** (`filters` + `events`)
2. **listagem principal** (`sales`)
3. **KPIs/cards** (`operationalSummary` derivado de `salesWithOperationalView`)
4. **modal de detalhe** (`openDetail`, `detailLogs`, `detailIntegrationLogs`, `detailCompany`)

Não há hook externo específico nem service dedicado: a tela consulta o Supabase diretamente.

---

## 2. Fonte de verdade da empresa ativa

### Como a empresa ativa é resolvida hoje
A fonte de verdade atual da empresa ativa é o `AuthContext`.

Fluxo encontrado:
1. `AuthProvider` carrega `profiles`, `user_roles` e `companies`.
2. Resolve a empresa ativa pela prioridade:
   - `localStorage`
   - `profile.company_id`
   - primeira empresa disponível
3. Persiste o resultado em `activeCompanyId` e `activeCompany`.
4. O seletor do header chama `switchCompany(companyId)`, que atualiza imediatamente `activeCompanyId` e `activeCompany`, persiste em `localStorage` e então tenta recarregar o papel para a empresa escolhida.

### Conclusão objetiva
A tela **não depende de parâmetro de rota** para saber a empresa. Ela depende exclusivamente de `useAuth()` e lê `activeCompanyId` diretamente.

### Onde a empresa entra corretamente
No componente `SalesDiagnostic`, a empresa ativa entra aqui:
- `const { activeCompanyId } = useAuth();`
- `fetchSales()` reaplica `eq('company_id', activeCompanyId)` na query principal de `sales`
- `fetchEvents()` reaplica `eq('company_id', activeCompanyId)` na lista de eventos
- buscas auxiliares por nome/CPF/evento reaplicam `activeCompanyId`

### Onde a empresa se perde ou fica incompleta
Apesar da base principal já usar `activeCompanyId`, há quatro fragilidades reais:

#### 2.1. Race condition na troca de empresa
`switchCompany()` troca o estado imediatamente, mas `fetchSales()` e `fetchEvents()` não têm cancelamento nem proteção contra resposta obsoleta.

Se o operador trocar rapidamente de empresa A para B, uma resposta atrasada da consulta de A pode chegar depois e sobrescrever `sales` ou `events` já no contexto visual de B. Isso é um risco clássico de tela crítica porque o `useEffect` apenas dispara `fetchSales()`/`fetchEvents()` e as funções fazem `setSales` / `setEvents` ao final, sem validar se o `activeCompanyId` ainda é o mesmo da requisição iniciada.

#### 2.2. Filtros dependentes não são resetados na troca de empresa
Ao trocar `activeCompanyId`, a tela refaz `fetchEvents()`, mas **não reseta `filters.eventId`**, nem limpa filtros dependentes.

Consequência: é possível permanecer com `eventId` de uma empresa anterior. A query principal então continuará aplicando `eq('event_id', filters.eventId)`, o que pode gerar grade vazia ou percepção de inconsistência mesmo com a empresa correta selecionada.

#### 2.3. Consultas auxiliares ainda não reaplicam empresa em todos os pontos
A busca complementar por ticket usa `tickets.ticket_number` sem `eq('company_id', activeCompanyId)`.

Na prática, como o resultado final ainda passa pela query principal de `sales` com `company_id`, isso reduz o risco de vazamento explícito na grade. Porém, continua sendo um encadeamento inconsistente: uma etapa da resolução de busca opera fora do escopo da empresa ativa.

#### 2.4. Consultas de enriquecimento e detalhe dependem só do `sale_id`
As consultas em `tickets`, `seat_locks`, `sale_logs` e `sale_integration_logs` usam `sale_id` como chave principal, sem reaplicar `company_id`.

Se o banco e a RLS garantirem isolamento forte por `sale_id`, isso tende a funcionar. Mesmo assim, para uma tela operacional crítica, o contrato mais seguro é reaplicar `company_id` sempre que o schema expõe essa coluna. Hoje isso não é feito de forma uniforme.

### Diagnóstico resumido da empresa ativa
- **Fonte de verdade:** correta (`AuthContext`)
- **Leitura da tela:** correta
- **Aplicação na query principal:** correta
- **Aplicação em todas as consultas da tela:** parcial
- **Risco de renderizar empresa A consultando dados de B:** **baixo a médio**, principalmente por race condition e por filtros persistidos de empresa anterior
- **Causa raiz mais provável:** encadeamento incompleto do contexto multiempresa, não ausência total de `activeCompanyId`

---

## 3. Escopo real da listagem principal

### Query principal identificada
A listagem principal parte desta consulta:

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

Depois disso a tela aplica, em cadeia:
- `eq('company_id', activeCompanyId)` quando há empresa ativa
- busca textual resolvida em etapas auxiliares
- `eq('status', filters.status)`
- `eq('event_id', filters.eventId)`
- `gte('created_at', ...)`
- `lte('created_at', ...)`

### O que está correto
- A **grade principal** está, hoje, explicitamente filtrada por `company_id` quando `activeCompanyId` existe.
- O join de `events` e `companies` vem ancorado pela própria linha de `sales`; não há indício de view/RPC dissolvendo esse filtro.
- Não há transformação posterior que remova o recorte de empresa antes de renderizar a grade.

### Pontos frágeis no escopo da listagem

#### 3.1. Limite fixo de 100 linhas antes do enriquecimento completo
A tela limita a query a `100` registros no banco. Isso não quebra o isolamento por empresa, mas impacta a confiabilidade operacional se a empresa tiver alto volume. O painel deixa de ser “universo consultado” e passa a ser “até 100 linhas mais recentes conforme a query base”.

#### 3.2. Gateway e status de pagamento são filtrados só no frontend
Depois que o banco devolve as vendas, a tela ainda aplica `filters.gateway` e `filters.paymentStatus` localmente.

Isso preserva o escopo de empresa porque o dataset já veio recortado, mas cria um escopo híbrido:
- empresa/data/status/evento: filtrados no banco
- gateway/paymentStatus: filtrados no cliente

Operacionalmente isso não vaza empresa, mas complica previsibilidade, paginação futura e coerência do entendimento do operador sobre “qual query real está ativa”.

#### 3.3. Enriquecimento sem `company_id`
Após a query base, a tela carrega:
- tickets por `sale_id`
- seat_locks por `sale_id`

Isso é suficiente para enriquecer a grade, mas não reaplica `company_id` nesses pontos.

### Diagnóstico da listagem principal
- **Filtro obrigatório por `company_id`:** sim, na query base
- **Join/view/RPC que dissolve o filtro:** não encontrado
- **Uso de dados derivados sem reaplicar empresa:** sim, em enriquecimento e busca complementar
- **Logs exibidos apenas da empresa selecionada:** provável, mas não blindado por `company_id` no código
- **Ambiente respeitado na listagem principal:** não; a listagem mostra `sale.payment_environment`, mas não filtra por ele

---

## 4. Compatibilidade dos filtros com a empresa ativa

## 4.1 Busca textual
### Como funciona hoje
A busca tenta resolver correspondências por:
- `sales.customer_name`
- `sales.customer_cpf`
- UUID exato da venda
- `tickets.ticket_number`
- `events.name`
- depois converte isso em `sale_id`/`event_id`

### Avaliação por empresa
- **Nome:** respeita empresa
- **CPF:** respeita empresa
- **UUID exato:** respeita indiretamente, porque a query final continua presa ao `company_id`
- **Evento por nome:** respeita empresa
- **Ticket:** **parcialmente respeita** empresa, porque a busca em `tickets` não filtra `company_id`

### Risco
Baixo para vazamento visual na grade, mas médio para coerência de implementação.

## 4.2 Status da venda
Filtro aplicado no banco com `eq('status', filters.status)` sobre a query já recortada por empresa.

**Status:** respeita empresa.

## 4.3 Gateway
Filtro aplicado apenas no cliente via `computeGateway(sale)`.

Como o dataset já veio de `sales` filtrada por empresa, o resultado final permanece da empresa ativa. Porém as **opções do dropdown são estáticas** (`Asaas`, `Stripe`, `Manual`) e não refletem necessariamente os gateways realmente usados/configurados pela empresa ativa.

**Status:** respeita empresa no resultado; **não respeita empresa como catálogo contextual**.

## 4.4 Status de pagamento
Também é filtrado apenas no cliente, via `computePaymentStatus(sale)`.

O resultado continua no escopo da empresa, mas a classificação depende de heurística de front baseada em campos da venda, não de uma coluna normalizada no banco.

**Status:** respeita empresa no dataset; parcial em previsibilidade técnica.

## 4.5 Evento
`fetchEvents()` busca `events` já com `eq('company_id', activeCompanyId)`, o que está correto.

Problema: o estado `filters.eventId` não é resetado quando a empresa muda.

**Status:** respeita empresa no catálogo carregado; **parcial** no comportamento porque o valor previamente selecionado pode ficar obsoleto.

## 4.6 Data inicial / final
Os filtros de data usam `created_at` da venda e corrigem explicitamente o boundary com `buildCreatedAtBoundary()` para evitar truncamento por timezone no navegador.

Eles continuam presos à query principal de `sales`, portanto respeitam empresa.

**Status:** respeita empresa.

## 4.7 Limpar filtros
`onClearFilters={() => setFilters(initialFilters)}` reseta somente os filtros locais; não toca `activeCompanyId`.

Isso está correto em relação à empresa, mas não resolve o problema de troca de empresa com filtros dependentes já selecionados antes da mudança.

**Status:** respeita empresa, mas não trata contexto dependente de troca de empresa.

### Resumo objetivo dos filtros
- **Já respeitam a empresa:** status da venda, datas, evento no carregamento, busca por nome/CPF/evento
- **Respeitam parcialmente:** busca por ticket, gateway, status de pagamento, filtro de evento após troca de empresa
- **Não respeitam como contexto operacional completo:** catálogo de gateways, reset de filtros dependentes, proteção contra resposta obsoleta

---

## 5. Ordenação padrão da listagem

### O que acontece hoje
Há duas ordenações diferentes:

1. **Banco:** `order('created_at', { ascending: false })`
2. **Frontend:** `salesWithOperationalView.sort(...)`
   - primeiro por `operational.priority`
   - depois por `created_at DESC`

### Consequência prática
A grade **não está ordenada simplesmente do mais recente para o mais antigo**.

Ela está ordenada assim:
1. divergências/prioridades operacionais primeiro
2. dentro de cada prioridade, mais novas primeiro

Isso contradiz o objetivo operacional pedido agora, que é “sempre do mais recente para o mais antigo”.

### Qual campo é o mais confiável
Pelo desenho atual da tela, o campo mais confiável e já consistente para ordenar é `sales.created_at`:
- é usado na query principal
- é usado nos filtros de data visíveis
- é usado como fallback de tempo operacional
- aparece na apresentação da linha

`sale_date` não aparece como coluna da entidade `Sale` no tipo local analisado. `updated_at` existe, mas pode ser alterado por efeitos posteriores e bagunçar a leitura cronológica da criação real da venda.

### Onde a ordenação deve acontecer
Para consistência operacional, a ordenação principal deve acontecer **no banco**.

Se a tela quiser destacar divergências, isso deveria virar badge/sinalização visual, não critério oculto de ordenação padrão, a menos que isso esteja explicitamente indicado ao usuário.

### Diagnóstico da ordenação
- **Ordenação atual:** híbrida e conflitante
- **Campo dominante no banco:** `created_at desc`
- **Campo dominante na grade renderizada:** `priority asc`, depois `created_at desc`
- **Pode mudar dependendo do filtro:** não pelo filtro em si, mas porque a ordenação local sempre reagrupa por prioridade
- **Paginação/lazy loading quebrando ordem:** não há paginação; o limite é fixo de 100
- **Causa raiz:** sort adicional no frontend com prioridade operacional

---

## 6. KPIs e coerência entre cards e grade

### Como os KPIs são calculados
Os cards superiores usam `operationalSummary`, que reduz `salesWithOperationalView`.

Isso significa que os KPIs usam exatamente o mesmo dataset da grade **depois** dos filtros locais e da classificação operacional.

### O que isso garante
- mesmo `company_id` da grade principal
- mesmos filtros já aplicados
- mesmo subconjunto final de `sales`

### O que isso não garante
- não garante que a grade represente o universo completo, porque tudo depende do `limit(100)` da query base
- não garante coerência com um ambiente operacional da empresa, porque o dataset não é filtrado por `payment_environment`

### Diagnóstico dos KPIs
- **Mesmo dataset da grade:** sim
- **Mesmo `company_id`:** sim, herdado da query base
- **Mesmo intervalo de datas:** sim
- **Mesmos filtros aplicados:** sim, inclusive gateway/paymentStatus porque ambos alimentam `sales`
- **Possibilidade de card global e grade local:** não encontrada na implementação atual
- **Incoerência principal:** cards e grade são coerentes entre si, mas ambos podem estar coerentemente errados em relação ao escopo operacional esperado por ambiente ou por filtros dependentes obsoletos

**Conclusão:** os KPIs estão **coerentes com a grade atual**, mas não necessariamente com o “escopo de operação ideal” que o negócio espera.

---

## 7. Diagnóstico por ambiente

### O que a tela faz hoje
- cada venda carrega `payment_environment`
- cada linha exibe badge `Produção` ou `Sandbox` baseado na própria venda
- o modal escolhe as credenciais Asaas da empresa conforme `detailSale.payment_environment`

### O que a tela não faz hoje
- não filtra a grade por `payment_environment`
- não cruza a consulta com um “ambiente operacional ativo” da empresa
- não reseta nem bloqueia a tela quando o contexto global de ambiente muda

### Ponto importante do header
O badge “Sandbox” do header vem de `useRuntimePaymentEnvironment()`, cuja decisão depende de:
1. `VITE_PAYMENT_ENVIRONMENT`
2. edge function `get-runtime-payment-environment`
3. fallback por hostname

Ou seja: o badge superior é **contexto de runtime do app**, não um filtro da query da tela.

### Implicação operacional
É possível o operador ver:
- header sinalizando Sandbox pelo runtime do app
- mas a grade contendo linhas de vendas com badge Sandbox e Produção misturados, porque não há filtro por `sales.payment_environment`

Se a regra de negócio é que produção e sandbox são espelhos mas não devem se misturar, a tela atual está **estruturalmente vulnerável à mistura de ambientes no dataset**.

### Diagnóstico objetivo do ambiente
- **Contexto visual de ambiente:** parcial
- **Isolamento de ambiente na query:** inexistente
- **Lógica paralela desnecessária:** sim, porque há ambiente do runtime no header e ambiente persistido por venda na grade, sem unificação de escopo
- **Risco de mistura:** médio a alto, dependendo da coexistência de vendas antigas/atuais em ambientes diferentes

---

## 8. Avaliação de UX operacional

Sem redesign, há melhorias enxutas e valiosas:

### Melhorias de alto valor e baixo risco
1. **Badge explícito da empresa ativa dentro da própria tela**
   - reduz dependência do header global
   - reforça auditabilidade do escopo

2. **Resumo do escopo atual acima da grade**
   - empresa ativa
   - período aplicado
   - evento selecionado
   - ordenação atual
   - ambiente efetivo, quando houver

3. **Reset seguro de filtros dependentes ao trocar empresa**
   - principalmente `eventId`
   - idealmente com feedback discreto: “Filtros dependentes da empresa foram limpos”

4. **Estado vazio contextual**
   - hoje a mensagem é genérica
   - melhor: “Nenhuma venda encontrada para a empresa X com os filtros Y”

5. **Indicação explícita da ordenação aplicada**
   - hoje a UI não revela que prioridade operacional interfere na ordem

6. **Proteção visual contra dados obsoletos ao trocar empresa**
   - loading imediato + invalidação da grade anterior
   - evita “fantasma visual” durante troca rápida

7. **Catálogo de gateway contextual**
   - manter o seletor atual, mas opcionalmente ocultar/desabilitar gateways sem ocorrência na empresa carregada

---

## 9. Causa raiz mais provável

A causa raiz mais provável **não é ausência de `activeCompanyId` na tela**. Essa parte já existe.

A causa raiz é um conjunto de fragilidades de encadeamento:

1. **o escopo de empresa foi aplicado à query base, mas não de forma uniforme em todas as consultas auxiliares**
2. **a troca de empresa não invalida filtros dependentes nem respostas assíncronas anteriores**
3. **a ordenação final da grade foi desviada para prioridade operacional no frontend**
4. **o ambiente é exibido, mas não usado como filtro estrutural do dataset**

Em resumo: a tela está **parcialmente corrigida no multiempresa**, porém ainda não está totalmente blindada para uso operacional crítico.

---

## 10. Diagnóstico técnico objetivo

### Como a empresa ativa é obtida hoje
Via `AuthContext`, por `activeCompanyId`, resolvido com base em `localStorage`, `profile.company_id` e empresas disponíveis do usuário.

### A listagem principal respeita `company_id`?
**Sim, hoje respeita na query principal de `sales`.**

### Os filtros respeitam `company_id`?
**Parcialmente.**
- status/evento/data: sim
- busca por ticket: parcial
- gateway/paymentStatus: dependem de filtragem local sobre dataset já recortado
- troca de empresa não reseta filtros dependentes

### Os KPIs respeitam o mesmo escopo?
**Sim, o mesmo dataset da grade.**

### A ordenação atual está correta?
**Não**, se o requisito for “mais recente primeiro sempre”. A grade é reordenada por prioridade operacional antes da data.

### Há risco de mistura entre empresas ou ambientes?
- **Empresas:** risco baixo a médio, principalmente por race condition e encadeamento incompleto
- **Ambientes:** risco médio a alto, porque não existe filtro estrutural por `payment_environment`

### Qual é a causa raiz mais provável?
Encadeamento incompleto do contexto: empresa parcialmente blindada, ambiente não blindado, filtros dependentes persistindo, e ordenação final conflitante no frontend.

---

## 11. Classificação de viabilidade

## 11.1 Amarração por empresa da grade
- **Viabilidade:** alta
- **Risco:** baixo
- **Impacto esperado:** alto
- **Mudança mínima recomendada:**
  - reaplicar `company_id` em consultas auxiliares (`tickets`, `seat_locks`, `sale_logs`, `sale_integration_logs`) quando houver `activeCompanyId`
  - proteger `fetchSales()` contra resposta obsoleta

## 11.2 Amarração por empresa dos filtros
- **Viabilidade:** alta
- **Risco:** baixo
- **Impacto esperado:** alto
- **Mudança mínima recomendada:**
  - resetar `eventId` e outros filtros dependentes ao trocar `activeCompanyId`
  - filtrar busca de ticket por `company_id`
  - opcionalmente recalcular opções de gateway com base no dataset atual da empresa

## 11.3 Ordenação por data mais recente
- **Viabilidade:** alta
- **Risco:** baixo
- **Impacto esperado:** alto para previsibilidade
- **Mudança mínima recomendada:**
  - remover ou tornar explícito o `sort` por prioridade operacional na grade principal
  - manter `order('created_at', { ascending: false })` no backend como fonte de verdade

## 11.4 Coerência dos KPIs
- **Viabilidade:** alta
- **Risco:** baixo
- **Impacto esperado:** médio
- **Mudança mínima recomendada:**
  - manter KPIs derivados do mesmo dataset
  - revalidar após correções de empresa/ambiente/ordenação

## 11.5 Melhorias visuais operacionais
- **Viabilidade:** alta
- **Risco:** baixo
- **Impacto esperado:** médio a alto
- **Mudança mínima recomendada:**
  - badge da empresa ativa na própria página
  - estado vazio contextual
  - indicação de ordenação
  - loading/placeholder ao trocar empresa

## 11.6 Blindagem por ambiente
- **Viabilidade:** média
- **Risco:** médio
- **Impacto esperado:** alto
- **Mudança mínima recomendada:**
  - confirmar no domínio se o ambiente operacional esperado da tela deve filtrar `sales.payment_environment`
  - se sim, adicionar filtro explícito e resumo visual do ambiente aplicado

Motivo da viabilidade média: o código já distingue ambiente em runtime e por venda, mas o “ambiente ativo” da tela não está formalizado como contrato único.

---

## 12. Plano de correção mínima e segura

> Esta seção descreve a menor solução segura. Não foi implementada nesta etapa.

### Arquivos que precisariam ser ajustados
1. `src/pages/admin/SalesDiagnostic.tsx`
2. `src/contexts/AuthContext.tsx` *(somente se for necessário expor algum marcador melhor de troca de empresa; provavelmente dispensável)*
3. `src/components/layout/AdminHeader.tsx` *(apenas se a decisão de UX exigir reforço visual, não obrigatório para correção funcional)*
4. `src/hooks/use-runtime-payment-environment.ts` *(apenas se a definição final de ambiente da tela exigir reutilização direta do hook na página)*

### Menor solução segura recomendada

#### Etapa 1 — blindagem de empresa na própria tela
Em `SalesDiagnostic.tsx`:
- adicionar guarda de requisição ativa em `fetchSales()` e `fetchEvents()` para ignorar respostas antigas
- ao mudar `activeCompanyId`, limpar `sales`, `events` e resetar filtros dependentes (`eventId`; opcionalmente `gateway` se virar catálogo contextual)
- adicionar `eq('company_id', activeCompanyId)` onde o schema já suporta:
  - busca de `tickets` por `ticket_number`
  - enriquecimento de `tickets`
  - enriquecimento de `seat_locks`
  - `sale_logs`
  - `sale_integration_logs`

#### Etapa 2 — previsibilidade de ordenação
Em `SalesDiagnostic.tsx`:
- trocar a ordenação principal da grade para `created_at DESC` puro
- se a prioridade operacional continuar útil, apresentá-la como badge/indicador, não como ordenação oculta

#### Etapa 3 — consistência operacional de ambiente
Ainda em `SalesDiagnostic.tsx`:
- validar com negócio se a tela deve refletir apenas o ambiente operacional corrente
- se a resposta for “sim”, aplicar filtro explícito por `payment_environment`
- exibir no topo um resumo claro do ambiente em uso para consulta

### Pontos que exigem validação manual após a correção
- troca rápida de empresa A → B → A
- filtro de evento herdado de empresa anterior
- busca por ticket em empresas com tickets semelhantes
- coerência dos cards após reset de empresa
- comportamento da grade quando uma empresa não tem vendas no ambiente corrente
- detalhe da venda abrindo logs apenas do mesmo escopo esperado

---

## 13. Checklist de testes pós-correção

### Troca de empresa
- [ ] Trocar empresa A → B e confirmar que a grade limpa imediatamente os dados anteriores
- [ ] Trocar empresa A → B e confirmar que eventos do filtro pertencem só à empresa B
- [ ] Trocar empresa A → B → A rapidamente e confirmar ausência de dados obsoletos

### Ambiente
- [ ] Validar comportamento em contexto Sandbox
- [ ] Validar comportamento em contexto Produção
- [ ] Confirmar que não aparecem vendas de ambiente divergente quando houver filtro operacional por ambiente
- [ ] Confirmar que badges de ambiente na linha continuam coerentes com o dado persistido da venda

### Filtros
- [ ] Busca textual por nome respeita a empresa ativa
- [ ] Busca por CPF respeita a empresa ativa
- [ ] Busca por ticket respeita a empresa ativa
- [ ] Filtro de evento lista apenas eventos da empresa ativa
- [ ] Filtro de gateway permanece coerente com vendas da empresa ativa
- [ ] Filtro de status de pagamento mantém coerência com o dataset final
- [ ] Limpar filtros mantém a empresa ativa intacta
- [ ] Trocar empresa reseta filtros dependentes de forma segura

### Ordenação
- [ ] Confirmar que a primeira linha é sempre a venda mais recente por `created_at`
- [ ] Confirmar que aplicar filtros não altera a regra de ordenação padrão
- [ ] Confirmar que a ordenação percebida na UI bate com a ordenação do backend

### KPIs
- [ ] Confirmar que Total = número de linhas da grade após filtros
- [ ] Confirmar que cards refletem o mesmo subconjunto da lista
- [ ] Confirmar que cards continuam coerentes após troca de empresa
- [ ] Confirmar que cards continuam coerentes com zero resultados

### Zero resultados e estados vazios
- [ ] Confirmar estado vazio contextual para empresa + filtros ativos
- [ ] Confirmar que não restam opções de evento da empresa anterior
- [ ] Confirmar ausência de “dados fantasma” de outra empresa ou ambiente

---

## 14. Conclusão final

A tela `/admin/diagnostico-vendas` **já está parcialmente amarrada à empresa ativa**: a query principal de `sales` e a lista de eventos usam `activeCompanyId` corretamente.

Porém, para um painel operacional crítico, isso ainda é insuficiente para chamar a implementação de plenamente confiável.

### Estado atual resumido
- **Isolamento por empresa:** parcialmente correto
- **Coerência dos filtros:** parcialmente correta
- **Ordenação operacional:** incorreta para o requisito “mais recente primeiro sempre”
- **KPIs vs grade:** coerentes entre si
- **Blindagem por ambiente:** insuficiente
- **Confiabilidade operacional geral:** média, com pontos de risco concretos

### Menor caminho seguro
A menor correção segura é concentrada em `src/pages/admin/SalesDiagnostic.tsx`, sem nova arquitetura:
1. blindar respostas assíncronas e filtros dependentes na troca de empresa
2. reaplicar `company_id` em todas as consultas auxiliares possíveis
3. remover a ordenação oculta por prioridade operacional
4. decidir explicitamente se a tela deve filtrar por `payment_environment`

Essa combinação é pequena, compatível com o padrão atual do projeto e tem alto retorno operacional.
