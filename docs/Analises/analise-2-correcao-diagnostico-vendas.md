# Rastreabilidade da correção — `/admin/diagnostico-vendas`

## Objetivo

Registrar, com foco operacional, a correção mínima aplicada na tela `/admin/diagnostico-vendas` para blindar o escopo por empresa, estabilizar a troca de empresa, alinhar a ordenação padrão e deixar o comportamento mais previsível para suporte/auditoria rápida.

---

## Arquivos alterados

1. `src/pages/admin/SalesDiagnostic.tsx`
2. `analise-2-correcao-diagnostico-vendas.md`

---

## O que foi corrigido

### 1. Blindagem explícita por empresa (`company_id`)
Foi reforçado o uso de `company_id` nas consultas auxiliares da tela, além da query principal de `sales`.

#### Antes
- a query principal já filtrava `sales.company_id`
- porém consultas auxiliares ainda dependiam só de `sale_id` ou não reaplicavam empresa em todos os pontos
- a busca por `tickets.ticket_number` não reaplicava `company_id`

#### Depois
- `tickets` da busca textual passaram a filtrar por `company_id`
- `tickets` usados no enriquecimento da grade passaram a filtrar por `company_id`
- `seat_locks` usados no diagnóstico passaram a filtrar por `company_id`
- `sale_logs` do detalhe passaram a filtrar por `company_id`
- `sale_integration_logs` do detalhe passaram a filtrar por `company_id`

### 2. Blindagem por ambiente operacional
A tela agora aguarda a resolução do ambiente operacional já usado pelo projeto (`useRuntimePaymentEnvironment`) antes de consultar a grade.

#### Antes
- a grade podia consultar sem aguardar o ambiente operacional
- a linha mostrava `payment_environment`, mas a query principal não recortava por ele

#### Depois
- a query principal passou a aplicar `payment_environment`
- o detalhe técnico também reaplica `payment_environment` em `sale_integration_logs`
- a tela só consulta a grade depois que o ambiente operacional já está resolvido

### 3. Proteção contra race condition / stale response
Foi implementado controle por `requestId` incremental para impedir que respostas antigas sobrescrevam o estado atual.

#### Antes
- respostas atrasadas de empresa A podiam chegar depois da troca para empresa B e sobrescrever `sales`/`events`

#### Depois
- cada `fetchSales()` e `fetchEvents()` gera um `requestId`
- somente a resposta mais recente pode atualizar estado
- ao trocar a empresa, o componente invalida imediatamente requisições anteriores e limpa dados dependentes

### 4. Reset inteligente de filtros dependentes
Foi aplicado reset automático ao trocar a empresa ativa.

#### Antes
- `eventId`, `gateway` e `paymentStatus` podiam continuar com valores herdados da empresa anterior

#### Depois
- ao trocar a empresa, a tela limpa:
  - `eventId`
  - `gateway`
  - `paymentStatus`
- filtros neutros continuam preservados durante a troca:
  - texto de busca
  - intervalo de datas
  - status da venda

### 5. Ordenação previsível
Foi corrigida a ordenação final da grade.

#### Antes
- o backend já trazia `created_at DESC`
- o frontend reordenava a grade por `priority`, empurrando divergências para cima
- isso quebrava o critério “mais recente primeiro”

#### Depois
- o frontend agora mantém `created_at DESC` como critério principal
- `priority` virou apenas desempate secundário
- a tela também passou a exibir o resumo “Ordenação: mais recentes primeiro”

### 6. Clareza operacional mínima
Foram feitos ajustes visuais discretos, sem mudar o layout-base:
- badge da empresa ativa
- badge do ambiente operacional
- indicação da ordenação atual
- texto explícito do recorte operacional das últimas 100 vendas
- estado vazio contextual por empresa
- feedback por toast ao limpar filtros e ao trocar empresa

---

## Onde foi corrigido

### `src/pages/admin/SalesDiagnostic.tsx`

#### Escopo e ambiente
- leitura de `activeCompanyId` e `activeCompany`
- leitura de `runtimePaymentEnvironment`
- filtro por `company_id`
- filtro por `payment_environment`

#### Race condition
- `latestSalesRequestIdRef`
- `latestEventsRequestIdRef`
- descarte explícito de respostas antigas antes de `setSales` / `setEvents`

#### Filtros dependentes
- `useEffect` reagindo à troca de `activeCompanyId`
- reset de `eventId`, `gateway` e `paymentStatus`

#### Ordenação
- ajuste em `salesWithOperationalView`
- `created_at` como ordem principal
- `priority` apenas como critério secundário

#### Ajustes visuais
- badges de empresa/ordenação/ambiente
- estado vazio contextual
- feedback de limpeza de filtros

---

## Decisão sobre `limit(100)`

### Confirmação
O `limit(100)` continua aplicado na query principal da grade.

### Decisão adotada
**Mantido intencionalmente**.

### Justificativa
Nesta etapa, a tela foi tratada como **painel operacional recente**, não como relatório paginado de auditoria histórica.

Motivos para manter o limite agora:
- mudança mínima e segura
- evita ampliar custo/latência de uma tela crítica
- preserva o comportamento já existente, mas agora com comentário em código e comunicação visual do recorte aplicado

### Mitigação aplicada
A tela agora informa explicitamente:
- “Escopo operacional: últimas 100 vendas mais recentes”

### Risco remanescente
Para auditoria histórica profunda, o limite continua insuficiente. Se o uso operacional migrar para auditoria ampla, a próxima evolução segura deve ser **paginação** em vez de remoção cega do limite.

---

## Riscos e pontos de atenção

### Riscos reduzidos pela correção
- dados da empresa anterior aparecendo após troca rápida
- filtros invisivelmente inválidos após troca de empresa
- mistura parcial de consultas auxiliares sem `company_id`
- ordenação operacional contradizendo a expectativa de “mais recente primeiro”

### Pontos de atenção remanescentes
- `sale_logs` não possuem coluna explícita de ambiente; o detalhe depende do `sale_id` + `company_id`
- o limite de 100 segue válido apenas para cenário operacional recente
- o catálogo de gateways agora reflete o dataset recente da empresa/ambiente carregados; se não houver ocorrência no recorte atual, o gateway não aparece no dropdown

---

## Antes vs depois

### Empresa ativa
- **Antes:** query principal correta, mas encadeamento auxiliar parcial
- **Depois:** empresa ativa reforçada em todas as consultas auxiliares relevantes da tela

### Ambiente
- **Antes:** ambiente visível, mas não aplicado na query principal
- **Depois:** ambiente visível e aplicado no dataset principal

### Ordenação
- **Antes:** prioridade operacional podia sobrescrever a cronologia
- **Depois:** cronologia é dominante (`created_at DESC`)

### Troca de empresa
- **Antes:** vulnerável a resposta atrasada e filtros herdados
- **Depois:** respostas antigas são ignoradas e filtros dependentes são resetados

### UX operacional
- **Antes:** escopo menos explícito
- **Depois:** empresa, ambiente, ordenação e recorte operacional ficam visíveis na própria tela

---

## Checklist de validação

### Empresa e race condition
- [ ] Trocar empresa A → B e confirmar que nenhuma linha da empresa A permanece na grade
- [ ] Trocar empresa A → B → A rapidamente e confirmar ausência de dados fantasma
- [ ] Confirmar que eventos do dropdown pertencem apenas à empresa ativa

### Filtros
- [ ] Confirmar reset automático de `eventId`, `gateway` e `paymentStatus` ao trocar empresa
- [ ] Confirmar preservação de busca textual e datas ao trocar empresa, quando aplicável
- [ ] Confirmar que limpar filtros volta tudo ao estado inicial da tela

### Gateways
- [ ] Confirmar que o dropdown de gateway reflete apenas gateways presentes no dataset da empresa/ambiente ativos
- [ ] Confirmar que não há gateway herdado da empresa anterior

### Ordenação
- [ ] Confirmar que a primeira linha é sempre a venda mais recente por `created_at`
- [ ] Confirmar que casos com mesma data usam prioridade apenas como desempate

### KPIs e grade
- [ ] Confirmar que cards e grade mudam juntos ao trocar empresa
- [ ] Confirmar que cards e grade mudam juntos ao alterar filtros
- [ ] Confirmar que o total dos cards continua coerente com a grade renderizada

### Ambiente
- [ ] Confirmar que a grade respeita o ambiente operacional atual
- [ ] Confirmar que a tela não mistura Sandbox e Produção no mesmo dataset principal
- [ ] Confirmar que o detalhe técnico da venda respeita o ambiente da venda

### Estado vazio
- [ ] Confirmar mensagem contextual: “Nenhuma venda encontrada para esta empresa e filtros”
- [ ] Confirmar ausência de dados antigos quando o resultado é zero

---

## Resultado esperado desta etapa

Com esta correção, a tela `/admin/diagnostico-vendas` passa a operar com comportamento mais previsível e auditável, sem refatoração ampla:
- empresa ativa blindada
- ambiente aplicado ao dataset principal
- filtros dependentes coerentes
- ordenação cronológica dominante
- proteção contra stale response
- clareza operacional maior no topo da tela
