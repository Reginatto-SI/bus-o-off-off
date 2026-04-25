# 1. Resumo executivo

**Viável, com baixo risco para uma v1 útil**, porque a base atual já possui:
- contexto de empresa ativa (`activeCompanyId`) e ambiente operacional no header (`useRuntimePaymentEnvironment`);
- trilha técnica persistida de integração (`sale_integration_logs`) com `payment_environment`, `incident_code`, `warning_code`, `event_type`, `external_reference`, `payment_id`, `processing_status`;
- trilha funcional (`sale_logs`) e dados de venda (`sales`) com `asaas_payment_id`, `asaas_payment_status`, `payment_environment`, `company_id`.

A principal conclusão: **não precisa criar nova arquitetura para começar**. Dá para entregar uma primeira versão confiável combinando leitura de dados já persistidos + (opcional) uma chamada sob demanda para `verify-payment-status` quando o dev pedir confirmação ativa.

---

# 2. Estado atual do projeto

## 2.1 Tela alvo e padrão visual
- A rota `/admin/diagnostico-vendas` já existe e renderiza `SalesDiagnostic` (`src/App.tsx`).
- A tela já usa **modal com abas** (`Dialog` + `Tabs`) e já possui abas técnicas de venda (`src/pages/admin/SalesDiagnostic.tsx`).
- Isso reduz risco de UI, porque o padrão solicitado já está implementado no próprio módulo.

## 2.2 Escopo multiempresa e ambiente
- A empresa ativa vem do `AuthContext` (`activeCompanyId`, `activeCompany`) em `src/contexts/AuthContext.tsx`.
- O ambiente de execução vem de `useRuntimePaymentEnvironment` (`src/hooks/use-runtime-payment-environment.ts`) e é refletido no header (`src/components/layout/AdminHeader.tsx`).
- `SalesDiagnostic` já aplica filtro conjunto por `company_id` e `payment_environment` na query principal de `sales`.

## 2.3 Observabilidade já existente
- Existe tabela de logs técnicos `sale_integration_logs` (migrations em `supabase/migrations/*sale_integration_logs*`).
- O webhook (`supabase/functions/asaas-webhook/index.ts`) e o verify (`supabase/functions/verify-payment-status/index.ts`) gravam logs estruturados via helper `logSaleIntegrationEvent` (`supabase/functions/_shared/payment-observability.ts`).
- Há deduplicação de eventos Asaas (`asaas_webhook_event_dedup`) com contagem de duplicados.

---

# 3. Fontes de dados disponíveis

## 3.1 Tabelas centrais

### `sales`
Campos úteis já existentes para diagnóstico:
- `id`, `company_id`, `status`, `asaas_payment_id`, `asaas_payment_status`, `payment_environment`, `payment_confirmed_at`, `cancel_reason`, `updated_at`, `created_at`.

### `sale_integration_logs`
Campos técnicos úteis para popup de dev:
- correlação: `sale_id`, `company_id`, `payment_environment`, `external_reference`, `payment_id`, `asaas_event_id`;
- execução: `direction`, `event_type`, `processing_status`, `result_category`, `http_status`, `duration_ms`, `created_at`;
- diagnóstico: `incident_code`, `warning_code`, `message`, `payload_json`, `response_json`, `environment_decision_source`, `environment_host_detected`.

### `sale_logs`
- Histórico funcional resumido por venda (`action`, `description`, `created_at`, `company_id`).
- Complementa a leitura técnica quando não houver payload detalhado.

### `asaas_webhook_event_dedup`
- Evidência de duplicidade (`duplicate_count`, `first_received_at`, `last_seen_at`, `payment_environment`, `external_reference`, `sale_id`).

## 3.2 Edge functions relevantes (já existentes)
- `asaas-webhook`: fonte principal de confirmação e ingestão de evento.
- `verify-payment-status`: reconciliação/manual sync.
- `create-asaas-payment`: origem do outbound e falhas de criação.
- `_shared/payment-context-resolver.ts`: trilha de decisão de ambiente (`sale/request/host`) para auditoria.

## 3.3 Contexto do header reaproveitável
- O badge de ambiente no header já usa o mesmo hook global.
- Portanto, o botão “Executar diagnóstico técnico” pode usar **o mesmo contexto já carregado em tela**, sem inferência por URL e sem execução paralela de ambientes.

---

# 4. Lacunas encontradas

1. **Não existe hoje um “snapshot agregado” único** de diagnóstico por empresa/ambiente.
   - Os dados existem, mas estão distribuídos entre `sales`, `sale_integration_logs`, `sale_logs` e dedup.

2. **Campo `reason` literal não é padrão unificado** no fluxo de pagamentos.
   - No lugar disso, o sistema usa principalmente `incident_code`, `warning_code`, `message` e alguns campos em `response_json`.

3. **“Webhook saudável” é inferência, não flag pronta.**
   - Precisará regra explícita de leitura (ex.: último `incoming_webhook` recente + ausência de `failed/rejected` críticos no recorte).

4. **Diagnóstico “venda pendente com gateway confirmado” depende de reconciliação entre fontes**.
   - É viável com dados existentes, mas precisa critérios claros para evitar falso positivo.

5. **Logs de Edge no console (Deno/Supabase runtime)** não estão centralizados na UI por padrão.
   - O popup deve se apoiar no que já é persistido em banco (`sale_integration_logs`), não em logs efêmeros.

---

# 5. Melhor abordagem recomendada

## Estratégia de menor risco (v1)

**Arranjo recomendado: combinar banco + regras de leitura no frontend (ou 1 endpoint agregador fino), sem alterar checkout/webhook/verify.**

### Opção preferida para v1 (mínima)
- Botão abre modal técnico.
- Modal consulta apenas dados persistidos (`sales`, `sale_integration_logs`, `sale_logs`, `asaas_webhook_event_dedup`) filtrando por:
  - `company_id = activeCompanyId`
  - `payment_environment = runtimePaymentEnvironment`
- Não invocar verificação externa automaticamente.

### Opção v1.1 (ainda segura)
- Dentro do modal, botão secundário explícito “Rodar reconciliação on-demand desta venda” chamando `verify-payment-status` apenas quando solicitado.
- Mantém previsibilidade e evita efeito colateral oculto no botão principal de diagnóstico.

## Garantia técnica para ambiente ativo do header
1. Capturar `activeCompanyId` e `runtimePaymentEnvironment` no clique do botão.
2. Persistir esse snapshot local da execução (ex.: `analysisContext`).
3. Todas as queries do modal usam esse snapshot fixo até fechar modal.
4. Exibir no topo do popup: empresa + ambiente + timestamp da execução.
5. Bloquear execução se contexto não estiver pronto (`!activeCompanyId` ou `!isRuntimePaymentEnvironmentReady`).

Isso evita mistura por troca de empresa/ambiente durante carregamento.

---

# 6. Riscos avaliados

## 6.1 Duplicação de lógica
- **Risco médio** se o diagnóstico recriar regras de confirmação já existentes no webhook/verify.
- Mitigação: usar o popup para observabilidade, não para decidir pagamento.

## 6.2 Mistura de ambiente
- **Risco alto** se diagnóstico buscar sandbox+produção no mesmo fluxo.
- Mitigação: filtro obrigatório por `payment_environment` do contexto capturado no clique.

## 6.3 Baixa confiabilidade
- **Risco médio** se depender de console logs efêmeros.
- Mitigação: usar apenas dados persistidos (`sale_integration_logs` etc.) como fonte principal.

## 6.4 Falsa sensação de diagnóstico
- **Risco médio/alto** se o popup exibir “status geral” sem critérios explícitos.
- Mitigação: declarar regras de classificação (OK/Atenção/Crítico) baseadas em sinais verificáveis.

## 6.5 Custo de manutenção
- **Risco baixo** na v1 se o escopo ficar só em leitura e composição de dados já existentes.
- Sobe para médio caso se adicione muita inteligência nova fora das funções atuais.

---

# 7. Escopo mínimo viável recomendado

## Entraria na v1

1. **Botão único** em `/admin/diagnostico-vendas`: “Executar diagnóstico técnico”.
2. **Modal com abas** (reaproveitando padrão já existente):
   - **Resumo**: empresa, ambiente, horário, último webhook, tempo desde evento, última falha (`incident_code`/`warning_code`/`message`), status geral.
   - **Ambiente atual (técnico)**: último `incoming_webhook`, `event_type`, `external_reference`, `payment_id`, `sale_id`, `company_id`, `payment_environment`, `processing_status`, `environment_decision_source`, `http_status`, `duration_ms`.
   - **Divergências**: consultas objetivas por critérios fixos (ex.: `sales.status != 'pago'` com log recente de confirmação, ausência de `asaas_payment_id`, ausência de `payment_environment`, warning `webhook_not_observed_before_verify_confirmation`).
   - **Logs recentes**: lista compacta dos últimos N registros de `sale_integration_logs` no escopo.
3. **Escopo rígido por contexto ativo** (`company_id` + ambiente do header) sem testar os dois ambientes.

## Não entra na v1
- Nova infraestrutura de tracing distribuído.
- Alterações em checkout, webhook e verify.
- Reprocessamentos automáticos silenciosos.

---

# 8. Recomendação final

**Recomendação: seguir agora, em etapas, começando por uma v1 de leitura baseada em dados persistidos.**

Motivos:
- já há dados suficientes para diagnóstico técnico real (não fake);
- o padrão visual e parte da instrumentação já existem;
- o risco de regressão é baixo se o escopo ficar em leitura e contexto ativo;
- ganhos imediatos para suporte/dev: triagem mais rápida de falha de webhook, mismatch de status e lacunas de processamento.

## Decisão prática
- **Go para v1 mínima agora** (somente leitura + modal técnico por contexto ativo).
- **Depois** (v1.1), opcionalmente adicionar ação manual de reconciliação por venda via `verify-payment-status`.

---

## Observações objetivas sobre viabilidade de cada bloco pedido

- **Último webhook recebido / tipo / IDs / status de processamento**: **viável hoje** via `sale_integration_logs`.
- **Tempo desde último evento**: **viável hoje** (`created_at`).
- **Motivo do último erro (`reason`)**: **parcialmente viável**; usar `incident_code`, `warning_code`, `message` (não há campo único `reason` padronizado para pagamentos).
- **Fallback por `externalReference`**: **viável parcialmente** por `external_reference` + códigos de incidente/warning.
- **Timeout/falha/inconsistência**: **viável parcialmente**, derivando de `http_status`, `processing_status`, `result_category`, `incident_code`.
- **Divergência gateway x venda**: **viável**, mas com regra declarada para evitar inferência subjetiva.
- **Webhook saudável**: **viável como indicador calculado**, não como flag persistida nativa.

