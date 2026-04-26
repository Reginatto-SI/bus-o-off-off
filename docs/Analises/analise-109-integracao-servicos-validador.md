# Análise 109 — Integração entre `/admin/servicos`, `/vendas/servicos` e `/validador`

## 1. Resumo executivo

Hoje o projeto está com a **base de cadastro e venda operacional de serviços parcialmente pronta**, mas a integração com validação por QR de serviços **ainda não começou de forma funcional ponta a ponta**.

O que já funciona bem:
- cadastro base de serviços por empresa em `/admin/servicos` (CRUD + `unit_type` + `control_type` + status);
- vínculo de serviços ao evento (preço/capacidade/flags operacionais) na aba de serviços do detalhe de evento;
- venda avulsa em `/vendas/servicos` com criação de registro em `sales`, atualização de `event_services.sold_quantity` e log em `sale_logs`.

O que não funciona (ou não existe) para o objetivo de produto atual:
- não existe `sale_items` para itens de serviço estruturados;
- não existe QR próprio de serviços;
- não existe parser de tipo de QR no `/validador` (passagem vs serviço);
- não existe consumo unitário de serviço nem saldo `comprada/usada/restante` por item;
- não existe validação atômica de consumo de serviço.

**Onde a integração parou:**
- parou no estágio de “venda operacional mínima” de serviço (registro em `sales` + payload provisório em `sale_logs`), sem evolução para comprovante/QR de serviços e sem integração com o fluxo operacional do Validador.

**Conclusão objetiva:**
- **a base atual NÃO está pronta** para implementar validação por QR de serviços diretamente no `/validador` sem uma etapa mínima intermediária de estruturação de item de venda e token de QR de serviço.

---

## 2. Mapa de rotas

| Rota | Existe? | Estado atual | Observação |
|---|---|---|---|
| `/admin/servicos` | sim | funcional (CRUD base) | cobre catálogo de serviços por empresa; não cobre vínculo com evento/capacidade (isso fica no evento) |
| `/vendas/servicos` | sim | parcial | venda avulsa funcional para 1 serviço por venda; sem comprovante/QR de serviços; sem cobrança Asaas integrada no wizard |
| `/validador` | sim | parcial | fluxo operacional existe, mas valida apenas QR de passagem via RPC `validate_ticket_scan` |
| `/motorista` | sim (legado) | redireciona | rotas legadas redirecionam para `/validador/*` |

---

## 3. Mapa de arquivos relevantes

### 3.1 Telas
- `src/App.tsx` — registro das rotas `/admin/servicos`, `/vendas/servicos`, `/validador` e redirects legados de `/motorista`.
- `src/pages/admin/Services.tsx` — CRUD do catálogo base de serviços.
- `src/pages/admin/ServiceSales.tsx` — wizard de venda avulsa de serviços.
- `src/pages/admin/EventDetail.tsx` — detalhe de evento com aba de serviços.
- `src/pages/driver/DriverHome.tsx` — home operacional do Validador.
- `src/pages/driver/DriverValidate.tsx` — scanner e validação atual de QR.
- `src/pages/driver/DriverBoarding.tsx` — lista operacional de embarque (passagens).
- `src/pages/Login.tsx` — redirecionamento de role motorista para `/validador`.

### 3.2 Componentes
- `src/components/admin/EventServicesTab.tsx` — vínculo serviço↔evento, preço, capacidade, flags `allow_checkout`/`allow_standalone_sale` e status do vínculo.
- `src/components/layout/AdminSidebar.tsx` — atalhos de menu para `/admin/servicos` e `/vendas/servicos`.

### 3.3 Hooks / libs
- `src/hooks/use-runtime-payment-environment.ts` — resolve ambiente de pagamento usado na venda.
- `src/lib/eventOperationalWindow.ts` — filtro de eventos operacionalmente visíveis para venda em campo.
- `src/lib/driverPhaseConfig.ts` — reason codes/mensagens operacionais do validador de passagem.

### 3.4 Funções/edge
- `supabase/functions/create-asaas-payment/index.ts` — criação de cobrança Asaas (hoje exige status de venda compatível com fluxo de passagens).
- `supabase/functions/verify-payment-status/index.ts` — verificação/confirmação de pagamento Asaas.
- `supabase/functions/_shared/payment-context-resolver.ts` — resolução de ambiente/credenciais.
- `supabase/functions/_shared/payment-finalization.ts` — finalização de pagamento e geração de tickets de passagem.

### 3.5 Migrations / schema
- `supabase/migrations/20260426020455_7ab13010-37bc-4adc-bb98-e2dd1508bbda.sql` — criação de `services` e `event_services` (+ RLS).
- `supabase/migrations/20260426033000_add_event_services_foreign_keys.sql` — FKs de `event_services`.
- `supabase/migrations/20260426130000_service_sales_minimal_compat.sql` — `sale_status` com `pendente`/`pendente_taxa`, flexibilização de campos de `sales` para venda avulsa.
- `supabase/migrations/20260403000000_add_driver_qr_validation_flow.sql` — RPC/tabela de validação operacional de passagens.
- `supabase/migrations/20260212213444_e2e671d2-fa63-4684-9d7b-3ba35db44b5a.sql` — `sale_logs`.

### 3.6 Tipos
- `src/types/database.ts` — tipos de `Service`, `EventService`, `SaleStatus` etc.
- `src/integrations/supabase/types.ts` — tipos gerados do schema atual (inclui `services`, `event_services`, `validate_ticket_scan`; não expõe `sale_items`).

### 3.7 PRDs / análises consultados
- `docs/PRD/Telas/PRD — Módulo de Passeios & Serviços (SmartBus BR).md`
- `docs/PRD/Telas/PRD — Tela Validador.md`
- `docs/Analises/analise-108-alinhamento-prds-servicos-validador.md`
- `docs/Analises/analise-11-transicao-rota-validador.md`
- `docs/Analises/analise-1-modulo-servicos.md`
- `docs/Analises/analise-6-ajustes-servicos-evento-venda.md`
- `docs/Analises/analise-3-correcao-wizard-venda-servicos.md`

---

## 4. Aderência aos PRDs

| Regra do PRD | Está implementada? | Evidência | Divergência/Risco |
|---|---|---|---|
| Passagem tem QR próprio | sim | validação atual usa `tickets.qr_code_token` na RPC `validate_ticket_scan` | aderente no fluxo de passagem |
| Venda de serviços tem QR próprio | não | não há tabela/campo/geração de token específico para venda de serviço | bloqueio principal para evolução do Validador |
| QR de serviços agrupa múltiplos serviços | não | venda atual seleciona apenas 1 `selectedEventServiceId` por vez | modelo atual não representa carrinho multi-serviço |
| Validador lista serviços vinculados ao QR | não | `DriverValidate` chama só `validate_ticket_scan` (passagem) | ausência de tela/lista de itens de serviço |
| Consumo unitário de serviço | não | inexistência de endpoint/ação para baixa unitária de serviço | sem consumo parcial operacional |
| Bloqueio por saldo esgotado | não | sem estrutura `usado/restante` por item de serviço | risco de consumo sem controle |
| Serviço `sem_validacao` não consumível | parcial | o cadastro permite `control_type`, mas não existe fluxo de consumo para aplicar essa regra | regra existe só como metadado |
| Venda sem pagamento confirmado não deve validar | parcial | passagem já bloqueia `sale.status <> pago`; serviço não tem validação implementada | quando serviço for implementado, ainda falta regra explícita no backend |

---

## 5. Estado real do QR Code

### Respostas objetivas

- **Existe QR de serviços hoje?**
  - Não.

- **Se existe, onde é gerado?**
  - Não há geração identificada para serviços.

- **Que identificador ele carrega?**
  - Não aplicável (inexistente).

- **Aponta para venda, item ou outro token?**
  - Não aplicável.

- **É separado do QR de passagem?**
  - Atualmente só existe o de passagem (`tickets.qr_code_token`).

- **Suporta múltiplos serviços na mesma venda?**
  - Não: o wizard atual trabalha com um único serviço por confirmação.

- **O `/validador` já interpreta QR de serviços?**
  - Não: hoje interpreta fluxo de passagem via RPC específica de ticket.

### Diagnóstico adicional
- A validação atual foi arquitetada para procurar ticket por token e aplicar regras de embarque/checkin/checkout/reboard, não para abrir contexto de venda de serviços.
- Não há camada de “detecção de tipo de QR” (passagem/serviço/inválido) no scanner atual.

---

## 6. Estado real da persistência de consumo

### Respostas objetivas

- **Onde está a quantidade comprada?**
  - Hoje está no `sales.quantity` da venda avulsa e no payload em `sale_logs.new_value` (`service_item_registered`) para o item provisório.

- **Onde está a quantidade utilizada?**
  - Não existe persistência dedicada para uso de serviços.

- **Onde está a quantidade restante?**
  - Não existe campo/snapshot dedicado por item de serviço.

- **Existe log por consumo?**
  - Não para consumo de serviços. Existe log de cadastro de item em `sale_logs` e log operacional de passagem em `ticket_validations`.

- **Existe proteção contra consumo duplicado?**
  - Não para serviço (porque não há consumo implementado). Para passagem, a proteção está na RPC de validação.

- **Existe validação atômica?**
  - Para consumo de serviço, não existe. Para passagem, sim via função RPC transacional.

### Observação importante de arquitetura
- O uso de `sale_logs` para item de serviço está explicitamente marcado no código como **solução provisória**, indicando que a camada estrutural de itens/consumo ainda não foi consolidada.

---

## 7. Riscos antes de implementar

1. **Risco de mistura de contexto QR passagem x serviço**
   - O scanner atual assume ticket; sem taxonomia de token pode haver ambiguidade de leitura.

2. **Risco de validar serviço sem pagamento confirmado**
   - Se o backend de serviços não herdar a trava de status `pago`, pode liberar consumo indevido.

3. **Risco de saldo incorreto**
   - Sem estrutura formal de item consumível (`comprada/usada/restante`), não há fonte de verdade por serviço.

4. **Risco de duplicidade por clique rápido/concorrência**
   - Sem operação atômica no backend para “consumir 1 unidade”, a dupla baixa é provável.

5. **Risco de acoplamento frágil em `sale_logs`**
   - Parser de JSON/texto em log para operar negócio crítico é frágil para MVP operacional de campo.

6. **Risco de desalinhamento com fluxo Asaas existente**
   - Fluxo de criação de cobrança atual está orientado a vendas com status de passagens (`reservado`/`pendente_pagamento`), enquanto venda de serviço nasce como `pendente`/`pendente_taxa`.

7. **Risco de criar estrutura paralela desnecessária**
   - Se implementar consumo sem aproveitar `sales` e padrões de trilha operacional existentes, aumenta dívida técnica e divergência de produto.

---

## 8. Próximo passo recomendado

### Objetivo
Definir a **menor etapa segura** para destravar QR de serviços no Validador sem refatoração ampla.

| Opção | Descrição | Risco | Esforço | Recomendação |
|---|---|---|---|---|
| A | Operar consumo de serviço em `sale_logs` (parse + append) sem tabela de item | alto | baixo | não recomendado |
| B | Criar camada mínima de item de serviço por venda (estrutura tipo `sale_items` para serviço), com token QR de venda de serviços e saldo por item; depois integrar leitura no Validador | médio | médio | **recomendado** |
| C | Reestruturar venda+validação de serviços completa de uma vez (checkout, relatórios, UX final) | médio/alto | alto | não recomendado para próximo passo |

### Recomendação prática (B)
1. Fechar contrato mínimo de persistência de item de serviço por venda (incluindo `control_type`).
2. Definir token/QR de serviços por venda (separado de ticket).
3. Criar endpoint atômico de consumo unitário por item validável.
4. Só então adaptar `/validador` para identificar tipo de QR e abrir lista de itens consumíveis.

---

## 9. Perguntas pendentes

1. A estrutura final será `sale_items` dedicada ou outra tabela com equivalente funcional? (o PRD cita `sale_items`)
2. O token do QR de serviços ficará em `sales` (nível venda) ou em tabela própria de comprovante?
3. Quando houver múltiplos serviços na venda, a UI do `/vendas/servicos` será carrinho no mesmo fluxo ou composição por etapas na mesma confirmação?
4. Qual regra oficial de elegibilidade de validação para `pendente_taxa` no caso de venda de serviço em dinheiro (bloqueio total até regularização)?
5. A trilha de consumo de serviços ficará inicialmente em `sale_logs` (provisório) ou já em estrutura dedicada de auditoria de consumo?
6. O fluxo Asaas de serviço vai reaproveitar integralmente o pipeline atual (create/verify/webhook) com ajuste de status iniciais, ou haverá gateway específico para serviço?

---

## 10. Checklist final

- [x] PRDs oficiais foram lidos.
- [x] Rotas foram mapeadas.
- [x] Arquivos relevantes foram identificados.
- [x] Banco/persistência foi analisado.
- [x] Pagamento/Asaas foi analisado.
- [x] QR Code foi analisado.
- [x] Validador foi analisado.
- [x] Nenhuma alteração de implementação foi feita.
- [x] Arquivo Markdown de análise foi criado em `docs/Analises`.

