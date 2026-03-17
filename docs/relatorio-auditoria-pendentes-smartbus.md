# Relatório de Auditoria — Vendas aguardando pagamento

## 1. Resumo executivo
- O checkout público cria a venda com `status = pendente_pagamento` **antes** da confirmação do gateway e cria `seat_locks` com expiração de 15 minutos para cada assento selecionado.
- Esses `seat_locks` entram no cálculo de assentos ocupados no front público, portanto **venda pendente bloqueia assento na prática** enquanto o lock estiver ativo.
- Existe função de limpeza/cancelamento (`cleanup-expired-locks`) que cancela vendas pendentes associadas a locks expirados e remove locks/passageiros em staging.
- Porém, no repositório auditado, **não foi encontrado agendamento efetivo (cron SQL/job) dessa função**; só existe a Edge Function e comentário dizendo que seria chamada por cron.
- Em financeiro/comissão há comportamento misto:
  - Alguns painéis consideram só `pago` (ex.: Dashboard financeiro e comissão formal).
  - Outros relatórios somam receita/ocupação com vendas não canceladas (incluindo pendentes), gerando risco de leitura inflada.
- A tela `/admin/diagnostico-vendas` é majoritariamente diagnóstica (somente leitura + modal), não executa ações operacionais diretas.
- Sandbox/produção: o ambiente de pagamento é persistido em `sales.payment_environment` e respeitado em verify/webhook; contudo, relatórios administrativos em geral **não filtram por ambiente**, podendo misturar os dois contextos.

## 2. Fluxo atual identificado
### 2.1 Nascimento da venda pendente
1. Checkout valida capacidade geral via `get_trip_available_capacity`.
2. Cria `seat_locks` com `expires_at = now + 15 minutos`.
3. Insere venda em `sales` com `status = pendente_pagamento`.
4. Atualiza `seat_locks.sale_id` com o ID da venda.
5. Insere `sale_passengers` (staging para emissão de ticket após confirmação).
6. Chama `create-asaas-payment`.

### 2.2 Campos e vínculos gravados no nascimento
Na criação da venda são gravados, entre outros:
- vínculo com `event_id`, `trip_id`, `boarding_location_id`, `company_id`, `seller_id` (quando válido);
- dados do comprador (`customer_name`, `customer_cpf`, `customer_phone`);
- `quantity`, `unit_price`, `gross_amount`;
- `status = pendente_pagamento`;
- aceite jurídico de intermediação e timestamp do aceite.

O campo de ambiente (`payment_environment`) existe na tabela `sales` com default `sandbox`; no fluxo Asaas ele é consolidado/atualizado ao criar cobrança (`create-asaas-payment`) e depois vira fonte de verdade para verify/webhook.

## 3. Impacto em reserva de assentos/capacidade
### 3.1 Bloqueia assento?
**Sim.**
- O mapa de assentos público considera ocupados:
  - tickets existentes +
  - `seat_locks` não expirados (`expires_at > now`).
- Logo, pendente bloqueia imediatamente via lock (não depende de status `pago`).

### 3.2 Escopo do bloqueio
- O lock é por `trip_id + seat_id` (único), então o bloqueio é por viagem+assento específico.
- A venda também referencia embarque/evento, mas o lock técnico é no nível da viagem/assento.

### 3.3 Capacidade geral x mapa de assentos
- `get_trip_available_capacity` calcula capacidade com base em `tickets` (vendido definitivo), não em `seat_locks`.
- O checkout mitiga isso com revalidação de assentos (`tickets + seat_locks`) e com falha por chave única ao inserir lock.
- Resultado: para assento marcado, o bloqueio funciona; para capacidade agregada, a RPC não “enxerga” pendências.

### 3.4 Diferença entre ocupado/bloqueado/reservado
- **occupied** (mapa): ticket válido ou seat lock ativo.
- **blocked** (mapa): assento operacionalmente bloqueado (`seat.status='bloqueado'` ou ticket de venda `status='bloqueado'`).
- **reservado/pendente_pagamento** (venda): status comercial da venda, não necessariamente indicador direto no mapa sem lock/ticket.

### 3.5 Abandono de pagamento
- Se o cliente abandona e nada limpar, o lock permanece até `expires_at`.
- A liberação automática depende da execução da rotina `cleanup-expired-locks` (ver seção 6).

## 4. Impacto em financeiro
### 4.1 O que deveria acontecer (referência de negócio)
- Somente `pago` deveria compor receita financeira consolidada.

### 4.2 O que o código faz hoje
#### A) Relatórios que podem inflar receita com pendente
- `get_sales_report_kpis` e `get_sales_report_summary_paginated` somam `gross_revenue` de **todas** as vendas filtradas (independente de status), embora `platform_fee` e `sellers_commission` usem somente `pago`.
- `EventReport` considera “vendida” qualquer venda `status != cancelado`, logo inclui pendente/reservado no sold/ocupação/receita.
- `Sales.tsx` (stats da tela de vendas) soma `totalValue` de todas as comerciais (`status != bloqueado`), incluindo pendentes/canceladas.

#### B) Relatórios que usam somente pago
- Dashboard financeiro chama `get_sales_report_kpis` com `p_status='pago'`.
- Métricas operacionais de ocupação no Dashboard também usam apenas vendas `pago`.

**Conclusão:** há inconsistência entre telas; parte dos relatórios financeiros pode incluir pendente e distorcer leitura.

## 5. Impacto em comissão
### 5.1 Regra de comissão formal
- SQL de comissão (`get_sellers_commission_*`) considera comissão apenas quando `status='pago'`.
- `SellersCommissionReport` também reforça no front: venda não paga gera comissão zero.

### 5.2 KPI do vendedor (dashboard vendedor)
- `SellerDashboard` calcula `totalSold` e `totalValue` em cima de vendas filtradas sem restringir a pago.
- Mostra também `paidValue` e usa este para comissão agregada.

**Risco:** comissão oficial não infla por pendente, mas KPIs de volume/valor do vendedor podem parecer “venda válida” mesmo sem pagamento.

## 6. Expiração automática
### 6.1 Existe timeout?
- Sim, lock é criado com 15 minutos (`expires_at = now + 15 min`).

### 6.2 Existe rotina de expiração/cancelamento?
- Sim, Edge Function `cleanup-expired-locks`:
  - busca locks expirados;
  - cancela vendas pendentes associadas (`status='cancelado'`, motivo “Tempo de pagamento expirado”);
  - remove `sale_passengers` dessas vendas;
  - remove os locks expirados.

### 6.3 É realmente automática?
- No código auditado **não foi encontrado SQL de agendamento** (`cron.schedule`/`net.http_post`) para disparar a função.
- Há comentário na função dizendo “Called via pg_cron every 5 minutes”, mas essa evidência não apareceu em migrations/config.

**Conclusão objetiva:** a lógica de expiração existe, mas a automação do disparo não está comprovada no repositório.

## 7. Riscos encontrados
1. **Travamento indevido de assentos** se `cleanup-expired-locks` não estiver realmente agendado em produção.
2. **Receita/ocupação infladas** em relatórios que somam pendente como venda efetiva.
3. **Leitura comercial ambígua** para vendedor/admin (mistura de “gerada” com “paga”).
4. **Mistura sandbox/produção** em telas que não filtram `payment_environment`.
5. **Diferença de lógica entre capacidade agregada e mapa por assento** (RPC vs lock).

## 8. Inconsistências encontradas
1. `SalesReport` não lista `pendente_pagamento` no label/filter principal, mas SQL aceita qualquer `sale_status`.
2. `status distribution` do Dashboard considera apenas `reservado/pago/cancelado`, omitindo `pendente_pagamento`.
3. `types/database.ts` define `SaleStatus` com `pendente_pagamento`, mas interface `Sale` não inclui explicitamente `payment_environment`, embora a coluna exista e seja usada via cast `any` em telas.
4. `SalesDiagnostic` combina status da venda com status bruto Asaas para rotular “Status Pagamento”; isso é útil para diagnóstico, mas pode divergir semanticamente do status persistido de venda.

## 9. Avaliação da regra de 15 minutos
## Regra proposta
- pendente reserva temporariamente por 15 min;
- após 15 min sem confirmação, cancelar/expirar e liberar assento;
- apenas pago impacta financeiro/comissão/ocupação definitiva.

### 9.1 Compatibilidade com arquitetura atual
**Alta compatibilidade.**
- Já existe lock com 15 min, status pendente e função de cancelamento por expiração.

### 9.2 Pontos que precisariam ajuste
1. Garantir agendamento real da `cleanup-expired-locks` (e monitoramento).
2. Padronizar relatórios para separar “gerada/pendente” de “paga” (principalmente `gross_revenue` e ocupação).
3. Opcional: criar status explícito `expirado` (ou manter `cancelado` com `cancel_reason` padronizado).
4. Padronizar filtros por `payment_environment` onde leitura operacional exigir isolamento.

### 9.3 Forma mais simples/determinística/segura
1. Manter modelo atual de `seat_locks` (já funciona para bloqueio imediato).
2. Tornar o cleanup um job determinístico (a cada 1–5 min) e auditar execução/log.
3. Em relatórios financeiros/comissão, fixar cálculo baseado em `status='pago'` por padrão, mantendo cards separados para pendentes.
4. Na `/admin/diagnostico-vendas`, destacar “pendente dentro do prazo” vs “pendente com lock expirado/sem lock” para suporte.

### 9.4 Riscos de regressão
- Se alterar filtros de status em relatórios sem cuidado, pode quebrar comparabilidade histórica.
- Se o cleanup cancelar sem checar corrida com confirmação tardia, pode haver disputa webhook vs cancelamento (mitigável com atualização condicional por status já existente no código).

## 10. Recomendação final
1. **Primeira prioridade:** validar se `cleanup-expired-locks` está agendado em produção/sandbox (observabilidade + evidência operacional).
2. **Segunda prioridade:** alinhar definição de receita/ocupação “financeira” para `status='pago'` em todos os relatórios executivos.
3. **Terceira prioridade:** melhorar semântica visual da `/admin/diagnostico-vendas` para separar pendência saudável x pendência envelhecida.
4. **Quarta prioridade:** revisar telas de vendedor/admin para não comunicar pendente como venda consolidada.

## 11. Evidências técnicas
- Fluxo checkout e criação de pendente/locks: `src/pages/public/Checkout.tsx`.
- Mapa de assentos e semântica occupied/blocked: `src/components/public/SeatMap.tsx`.
- Estrutura `seat_locks`/`sale_passengers`: migration `20260311010520...sql`.
- Rotina de limpeza e cancelamento por expiração: `supabase/functions/cleanup-expired-locks/index.ts`.
- Fluxos Asaas (create/verify/webhook) e finalização centralizada: `create-asaas-payment`, `verify-payment-status`, `asaas-webhook`, `_shared/payment-finalization.ts`.
- Ambiente sandbox/produção: `_shared/payment-context-resolver.ts` e coluna `sales.payment_environment`.
- Diagnóstico admin: `src/pages/admin/SalesDiagnostic.tsx`.
- Relatórios financeiros/comissão: `src/pages/admin/SalesReport.tsx`, `src/pages/admin/EventReport.tsx`, `src/pages/admin/Dashboard.tsx`, `src/pages/admin/SellersCommissionReport.tsx` e RPCs SQL correspondentes.
