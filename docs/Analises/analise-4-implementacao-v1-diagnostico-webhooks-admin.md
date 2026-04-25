# Resumo do que foi implementado

Foi implementada a v1 mínima do diagnóstico técnico em `/admin/diagnostico-vendas` com:
- botão **Executar diagnóstico técnico** no header da página;
- modal técnico com abas (**Resumo**, **Ambiente atual**, **Divergências**, **Logs recentes**);
- leitura somente de dados persistidos (`sales`, `sale_integration_logs`, `sale_logs`, `asaas_webhook_event_dedup`);
- captura de **snapshot fixo no clique** (`company_id`, ambiente ativo, horário de execução), usado durante toda a sessão do modal;
- sem chamadas automáticas de reconciliação e sem escrita/alteração de estado de venda.

---

# Arquivos alterados

- `src/pages/admin/SalesDiagnostic.tsx`
  - adição do botão e do modal técnico v1;
  - adição de estados e regras de cálculo do diagnóstico;
  - consultas filtradas por contexto congelado (`company_id` + `payment_environment`);
  - comentários no código explicando decisões da v1.

- `analise-4-implementacao-v1-diagnostico-webhooks-admin.md`
  - relatório de implementação e validação manual.

---

# Estratégia usada

## Abordagem
- Reaproveitar a própria tela `SalesDiagnostic` e o padrão visual existente (PageHeader, Dialog, Tabs, Badge, Card).
- Não criar backend novo para a v1.
- Não alterar contratos nem fluxo de pagamento.

## Snapshot de contexto (regra crítica)
No clique do botão, é capturado e congelado:
- `companyId` ativo (`activeCompanyId`)
- `paymentEnvironment` ativo (`runtimePaymentEnvironment`)
- `executedAt`

Esse snapshot é a fonte do modal até o fechamento, evitando mistura quando o usuário muda contexto no header durante investigação.

---

# Fontes de dados utilizadas

## `sale_integration_logs`
Usado como trilha técnica principal (últimos 120 logs no contexto ativo):
- `provider`, `direction`, `event_type`, `processing_status`, `result_category`, `http_status`, `duration_ms`
- `incident_code`, `warning_code`, `message`
- `sale_id`, `company_id`, `payment_environment`, `payment_id`, `external_reference`
- `environment_decision_source`, `environment_host_detected`

## `sales`
Usado para divergências objetivas no recorte (últimas 120 vendas no contexto ativo):
- `status`, `asaas_payment_id`, `asaas_payment_status`, `payment_environment`, `company_id`

## `sale_logs`
Usado como apoio funcional para contexto (sem escrita).

## `asaas_webhook_event_dedup`
Usado para sinal de duplicidade real de webhook (`duplicate_count > 0`).

---

# Critérios de classificação (`OK`, `Atenção`, `Crítico`)

## `Crítico`
- existe divergência crítica; **ou**
- existe log com `processing_status` forte de falha (`failed`, `partial_failure`, `rejected`, `unauthorized`); **ou**
- existe `incident_code` no recorte.

## `Atenção`
- existe divergência de atenção; **ou**
- existe warning (`processing_status=warning` ou `warning_code`); **ou**
- não há evento recente (janela simples de 12h).

## `OK`
- há atividade recente no recorte;
- sem incidentes críticos;
- sem divergências relevantes.

Observação: os critérios foram mantidos simples, explícitos e revisáveis para evitar semáforo “fake”.

---

# Regras de divergência adotadas

Foram implementadas regras objetivas com severidade:

1. **Venda sem `payment_environment`** → crítica.
2. **Venda sem `asaas_payment_id`** e não cancelada → atenção.
3. **Venda não paga com indício técnico de confirmação** (`event_type`/`result_category`) → crítica.
4. **Inconsistência `sales.status` pago vs `asaas_payment_status` não confirmado/received** → atenção.
5. **Warning de observabilidade** `webhook_not_observed_before_verify_confirmation` → atenção.
6. **Incidente técnico crítico em log** (`incident_code` + status de falha forte) → crítica.
7. **Duplicidade de webhook** (`duplicate_count > 0` em dedup) → atenção.

---

# O que ficou de fora da v1 propositalmente

- qualquer alteração em checkout/webhook/verify/create-payment;
- reconciliação automática;
- chamadas externas automáticas;
- backend agregador novo;
- inferência de ambiente por URL/host no diagnóstico;
- escrita em tabelas de venda ou integração durante abertura do modal.

---

# Riscos controlados

1. **Mistura de ambiente/empresa**
   - controlado com snapshot congelado no clique.

2. **Efeito colateral operacional**
   - controlado com v1 somente leitura.

3. **Diagnóstico subjetivo**
   - controlado com regras explícitas e comentadas.

4. **Quebra de padrão visual**
   - controlado com reutilização do padrão de modal/abas já existente no admin.

---

# Checklist de validação manual

- [ ] Header em Sandbox → diagnóstico usa Sandbox.
- [ ] Header em Produção → diagnóstico usa Produção.
- [ ] Trocar empresa/ambiente após abrir modal não muda o snapshot já capturado.
- [ ] Modal técnico abre sem quebrar a tela de diagnóstico.
- [ ] Logs do modal aparecem filtrados por `company_id` + `payment_environment` do snapshot.
- [ ] Aba Divergências mostra apenas achados por regras objetivas.
- [ ] Status geral muda conforme o recorte real de logs/achados.
- [ ] Abrir diagnóstico não altera estado de venda nem dispara reconciliação automática.
