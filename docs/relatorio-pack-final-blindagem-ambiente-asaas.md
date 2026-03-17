# Resumo executivo

- Foi implementado um pack cirúrgico de blindagem para separar Sandbox vs Produção no fluxo Asaas sem refatoração ampla.
- O banco agora bloqueia valores inválidos de ambiente em `sales.payment_environment`.
- O runtime removeu fallback silencioso perigoso quando não há decisão segura de ambiente.
- A trilha técnica (`sale_integration_logs`) passou a registrar ambiente e metadados de decisão (`source` e `host`) para auditoria.
- O administrativo (`Diagnóstico de Vendas`) passou a exibir o ambiente persistido da venda e, no bloco de webhook, os dados técnicos de decisão.

**Risco residual após o pack:** baixo a médio (a decisão inicial continua por host oficial, porém agora explícita, rastreável e sem fallback silencioso).

---

# Arquivos alterados

- `supabase/migrations/20261001120000_harden_payment_environment_and_logs.sql`
  - hardening de `sales.payment_environment` (normalização + `CHECK`);
  - inclusão de rastreabilidade de ambiente em `sale_integration_logs`;
  - backfill de ambiente em logs antigos.

- `supabase/functions/_shared/payment-context-resolver.ts`
  - remove fallback implícito para sandbox sem contexto seguro;
  - adiciona `hostDetected` no trace de decisão.

- `supabase/functions/create-asaas-payment/index.ts`
  - decisão inicial tratada com erro explícito quando ambiente não é determinável;
  - evita herdar default de `sales.payment_environment` em venda recém-criada;
  - grava ambiente/origem/host em `sale_integration_logs`.

- `supabase/functions/asaas-webhook/index.ts`
  - persiste no log técnico ambiente e metadados de decisão.

- `supabase/functions/verify-payment-status/index.ts`
  - remove sinal legado ambíguo;
  - falha explicitamente se ambiente persistido da venda estiver inválido/ausente.

- `supabase/functions/create-platform-fee-checkout/index.ts`
  - falha explicitamente se ambiente persistido da venda estiver inválido/ausente.

- `src/pages/admin/SalesDiagnostic.tsx`
  - exibe ambiente persistido na listagem de vendas;
  - exibe ambiente/origem/host no painel de webhook para suporte.

---

# O que mudou na regra de ambiente

## Antes
- Havia fallback implícito para `sandbox` em contexto sem venda/request.
- Em venda recém-criada, o default de banco (`sandbox`) podia influenciar criação indevidamente.
- Rastreabilidade de ambiente ficava espalhada (sem colunas próprias em `sale_integration_logs`).

## Agora
- A decisão inicial continua seguindo a regra oficial por host, porém com falha explícita se não for determinável.
- A criação da cobrança usa host como decisão inicial para venda nova e só reutiliza ambiente persistido quando já existe vínculo de cobrança (`asaas_payment_id`).
- Depois de persistido, o ambiente da venda continua sendo a fonte de verdade para webhook/verify/platform-fee/reconciliação.

## Regra oficial final
- `smartbusbr.com.br` e `www.smartbusbr.com.br` => `production`.
- Qualquer outro host => `sandbox`.
- Sem decisão segura => erro explícito, sem fallback silencioso.

---

# Blindagem do banco

- `sales.payment_environment` segue `text`, mas agora com `CHECK` para aceitar somente `sandbox`/`production`.
- Dados históricos foram tratados de forma segura na migration:
  - normalização de caixa/espaços;
  - correção de inválidos para `sandbox` antes de ativar a constraint.
- `sale_integration_logs` recebeu campos:
  - `payment_environment`
  - `environment_decision_source`
  - `environment_host_detected`
- `sale_integration_logs` também ganhou constraints leves para valores válidos.

---

# Blindagem do runtime

- A resolução de contexto em `_shared/payment-context-resolver.ts` não usa mais fallback silencioso para sandbox sem contexto confiável.
- `create-asaas-payment` agora:
  - falha com `payment_environment_unresolved` quando não consegue decidir com segurança;
  - registra motivo no `sale_logs`;
  - registra trilha técnica no `sale_integration_logs`.
- `verify-payment-status` e `create-platform-fee-checkout` falham de forma explícita se a venda não tiver ambiente válido.
- `asaas-webhook` continua obedecendo ambiente persistido da venda e agora grava metadados de ambiente no log técnico.

---

# Rastreabilidade

- Ambiente ficou visível e consultável em:
  - `sales.payment_environment` (fonte de verdade por venda);
  - `sale_integration_logs.payment_environment`;
  - `sale_integration_logs.environment_decision_source`;
  - `sale_integration_logs.environment_host_detected`.
- A decisão inicial de criação passa a deixar trilha mínima auditável no log técnico de integração.

---

# Front/admin

- Em `Diagnóstico de Vendas`, a tabela principal agora mostra a coluna **Ambiente** (Sandbox/Produção) baseada na venda persistida.
- No bloco de webhook dos detalhes da venda, o suporte visualiza:
  - ambiente do log técnico;
  - origem da decisão;
  - host detectado.

---

# Limitações remanescentes

- A decisão inicial ainda é baseada em host (intencional e alinhada com regra oficial), portanto depende de configuração correta de domínio/proxy.
- Não foi criado painel novo nem refatoração ampla de arquitetura (escopo proposital para manter mudança mínima e segura).
- Não foi alterada a estrutura para enum SQL (escolha intencional para reduzir risco neste pack).

---

# Recomendação objetiva

- **Sim**, após este pack o fluxo ficou substancialmente mais blindado e explicável, com bloqueio de ambiente inválido no banco e sem fallback silencioso no runtime.
- **Risco relevante remanescente:** baixo/médio, concentrado em configuração externa de host/dns/proxy (não em lógica interna).
- **Avaliação final:** já é seguro tratar a regra como estável para operação, mantendo monitoramento operacional e disciplina de configuração de domínio oficial.

---

# Checklist de validação

- [ ] Venda criada em URL de teste nasce em `sandbox`.
- [ ] Venda criada no domínio oficial nasce em `production`.
- [ ] `payment_environment` inválido é barrado no banco.
- [ ] Sem fallback silencioso quando ambiente não for determinável.
- [ ] Webhook respeita o ambiente persistido da venda.
- [ ] Verify respeita o ambiente persistido da venda.
- [ ] Reconciliação respeita o ambiente persistido da venda.
- [ ] Logs mostram ambiente de forma fácil de consultar.
- [ ] Admin/diagnóstico mostra o ambiente persistido da venda.
