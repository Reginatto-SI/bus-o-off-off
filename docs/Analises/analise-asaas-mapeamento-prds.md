# Análise — Mapeamento Asaas e Consolidação dos PRDs

## 1. Resumo executivo
Foi realizado mapeamento técnico do fluxo Asaas atual no SmartBus BR com foco em:
- criação de cobrança;
- split financeiro (plataforma/sócio/representante);
- webhook + fallback de confirmação;
- configuração por empresa (sandbox/produção);
- operação/diagnóstico/auditoria.

Resultado: os fluxos principais estão centralizados em helpers compartilhados de contexto, split, finalização e observabilidade. Há boa cobertura de logs e deduplicação de webhook. Os principais riscos concentram-se em configuração por ambiente, divergências gateway x banco e reversões financeiras com tratamento manual.

## 2. Lista de arquivos analisados
### Edge functions e helpers
- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/get-asaas-payment-link/index.ts`
- `supabase/functions/check-asaas-integration/index.ts`
- `supabase/functions/create-asaas-account/index.ts`
- `supabase/functions/get-runtime-payment-environment/index.ts`
- `supabase/functions/create-platform-fee-checkout/index.ts`
- `supabase/functions/reconcile-sale-payment/index.ts`
- `supabase/functions/cleanup-expired-locks/index.ts`
- `supabase/functions/_shared/payment-context-resolver.ts`
- `supabase/functions/_shared/split-recipients-resolver.ts`
- `supabase/functions/_shared/payment-finalization.ts`
- `supabase/functions/_shared/payment-observability.ts`

### Frontend
- `src/pages/public/Checkout.tsx`
- `src/pages/public/Confirmation.tsx`
- `src/pages/public/TicketLookup.tsx`
- `src/components/admin/NewSaleModal.tsx`
- `src/pages/admin/Company.tsx`
- `src/components/admin/AsaasOnboardingWizard.tsx`
- `src/components/admin/AsaasDiagnosticPanel.tsx`
- `src/pages/admin/Sales.tsx`
- `src/pages/admin/SalesDiagnostic.tsx`
- `src/pages/representative/RepresentativeDashboard.tsx`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/lib/asaasIntegrationStatus.ts`
- `src/lib/financialSocioSplitConfig.ts`

### Banco/migrations
- `supabase/migrations/20260701090000_create_sale_integration_logs.sql`
- `supabase/migrations/20261017090000_stage3_payment_observability_dedup.sql`
- `supabase/migrations/20261024110000_final_asaas_alignment.sql`
- `supabase/migrations/20260815090000_add_asaas_environment_configuration.sql`
- `supabase/migrations/20261101090000_add_company_pix_readiness_fields.sql`
- `supabase/migrations/20261106090000_create_representatives_phase1_base.sql`
- `supabase/migrations/20260411170000_update_representative_commission_one_third_platform_fee.sql`

### Documentação existente consultada
- `docs/PRD/` (apenas conteúdo SEO; não encontrado PRD operacional de pagamento Asaas)
- `docs/auditoria-completa-asaas-smartbus.md`
- `docs/step5-hardening-final-asaas.md`

## 3. Lista de telas analisadas
- Checkout público (`/checkout/:id`)
- Confirmação pública (`/confirmacao/:id`)
- Consulta de passagens (`/consulta-passagem`)
- Venda manual (modal admin)
- Admin empresa (`/admin/empresa`, aba pagamentos)
- Painel diagnóstico Asaas (dev/admin)
- Admin vendas (`/admin/vendas`)
- Admin diagnóstico de vendas (`/admin/vendas/diagnostico`)
- Painel representante (`/representante/painel`)

## 4. Lista de edge functions analisadas
- `create-asaas-payment`
- `asaas-webhook`
- `verify-payment-status`
- `get-asaas-payment-link`
- `check-asaas-integration`
- `create-asaas-account`
- `get-runtime-payment-environment`
- `create-platform-fee-checkout`
- `reconcile-sale-payment`
- `cleanup-expired-locks`

## 5. Lista de tabelas/campos analisados
### Tabelas
- `sales`
- `companies`
- `socios_split` (histórico: rename de `partners`)
- `sale_logs`
- `sale_integration_logs`
- `asaas_webhook_event_dedup`
- `seat_locks`
- `sale_passengers`
- `tickets`
- `representatives`
- `representative_company_links`
- `representative_commissions`

### Campos-chave
- Vendas: `status`, `payment_environment`, `payment_method`, `asaas_payment_id`, `asaas_payment_status`, `payment_confirmed_at`, `gross_amount`, `platform_fee_total`, `socio_fee_amount`, `platform_net_amount`, `representative_id`.
- Empresa: `asaas_api_key_*`, `asaas_wallet_id_*`, `asaas_account_id_*`, `asaas_account_email_*`, `asaas_onboarding_complete_*`, `asaas_pix_ready_*`, `asaas_pix_last_error_*`, `platform_fee_percent`, `socio_split_percent`.
- Logs: `incident_code`, `warning_code`, `result_category`, `processing_status`, `asaas_event_id`, `payment_environment`.

## 6. Fluxo atual resumido
1. Checkout cria venda e snapshot de passageiros.
2. `create-asaas-payment` cria cobrança e persiste vínculo Asaas.
3. Confirmação chega por webhook ou verify.
4. `finalizeConfirmedPayment` consolida venda paga e tickets.
5. Logs técnicos e operacionais registram toda trilha.
6. Diagnóstico admin consolida divergências e evidências por ambiente.

## 7. Pontos bem implementados
- Resolver central de contexto de pagamento por ambiente.
- Resolver central de split para evitar lógica paralela.
- Deduplicação formal de webhook por `asaas_event_id`.
- Finalização compartilhada/idempotente de pagamento e ticket.
- Auditoria técnica em tabela dedicada (`sale_integration_logs`) com códigos de incidente.
- Diagnóstico operacional robusto em `/admin/vendas/diagnostico`.

## 8. Lacunas de documentação
- Não havia PRD operacional consolidado na pasta `docs/PRD/` para pagamentos Asaas (apenas SEO).
- Ausência de runbook único para suporte com trilhas de investigação prioritárias.
- Regras de reversão financeira e limites do tratamento automático estavam espalhadas em código e docs de auditoria.

## 9. Riscos encontrados
- Dependência forte da configuração correta por ambiente e por empresa.
- Possibilidade de divergência operacional quando webhook não é recebido e fluxo depende de verify.
- Reversões pós-pagamento exigem ação manual financeira (sem rollback automático de split/reembolso).
- Cenários de fallback de UX podem mascarar falha de integração se não houver monitoramento ativo.

## 10. Dúvidas que precisam de validação humana
- Existe SLA operacional formal para conciliação quando webhook falha? **não identificado**.
- Existe rotina financeira oficial para rollback de split em chargeback/estorno? **não identificado**.
- Existe política formal de rotação de API key/wallet por empresa? **não identificado**.
- Estado `representative_commissions.disponivel/paga` possui automação completa nesta base? **não identificado**.

## 11. Recomendações futuras
### documentação
- Consolidar runbook operacional único por incidente (webhook, verify, split, ambiente).
- Versionar PRDs de pagamento com changelog por release.

### produto
- Definir UX explícita para estados de “pagamento em divergência” em todas as telas de venda.
- Definir política clara de tratamento para reversão financeira após embarque.

### segurança
- Revisar governança de acesso aos campos sensíveis de integração por empresa.
- Avaliar política formal de rotação e revogação de credenciais Asaas.

### operação
- Criar alertas automáticos para incidentes críticos (ex.: ticket_generation_incomplete, payment_environment_unresolved).
- Definir playbook de primeira resposta por time de suporte.

### código
- Mapear e remover trechos/nomes legados que ainda possam causar ambiguidade semântica.
- Confirmar (com rastreamento) usos residuais de helpers encontrados sem uso confirmado no fluxo principal.

## Divergências entre documentação existente e código atual
1. Em `docs/PRD/` não foi encontrado PRD operacional de Asaas; documentação existente na pasta é SEO, sem aderência ao escopo de pagamentos.
2. Documentos históricos citam comportamentos legados em alguns trechos; o código atual reforça ambiente explícito na venda e webhook fail-closed por ambiente persistido.
3. Comentários históricos sobre percentual fixo de representante coexistem com regra operacional atual de 1/3 da taxa da plataforma em partes do backend; material antigo deve ser tratado como histórico, não como contrato vigente.
