

# Plano: Auditoria Completa da Integração Asaas — Smartbus BR

## Objetivo

Gerar um documento Markdown abrangente (`docs/auditoria-completa-asaas-smartbus.md`) com análise sistêmica de todo o fluxo Asaas, cobrindo frontend, backend (edge functions), banco de dados, e experiência administrativa.

## Resumo dos achados da investigação

### Pontos fortes identificados
- Arquitetura de contexto centralizada (`payment-context-resolver`) bem desenhada
- Separação sandbox/produção consolidada em todas as edge functions
- Finalização de pagamento compartilhada (`payment-finalization.ts`) elimina assimetria webhook vs verify
- Deduplicação de webhook formal com tabela dedicada
- Observabilidade rica com logs estruturados
- Webhook fail-closed (rejeita sem ambiente persistido)
- Reconciliação disponível para vendas inconsistentes

### Fragilidades e problemas encontrados

1. **Partners: campo `asaas_wallet_id` legado no frontend** — A página `Partners.tsx` lê/grava apenas `asaas_wallet_id` (campo legado). O backend já usa exclusivamente `asaas_wallet_id_production` / `asaas_wallet_id_sandbox`. Isso significa que qualquer wallet cadastrada pelo admin na UI nunca chega ao split real.

2. **Partners: sem `company_id` no frontend** — A tela de Partners não filtra por `company_id`. Consulta `partners` sem filtro multi-tenant. A RLS protege por role, mas a tabela `partners` não tem foreign key para `companies` no schema. O backend filtra por `sale.company_id`, mas a UI não filtra.

3. **Coluna `partners.asaas_wallet_id`** — Existe no banco mas não é mais lida pelo backend. É lixo funcional que confunde o admin.

4. **`sale_logs` referenciado no código mas ausente do schema** — `payment-finalization.ts` faz INSERT em `sale_logs`, mas essa tabela não aparece no schema fornecido. Pode causar erros silenciosos.

5. **Opção "Automático pelo host atual" no wizard** — Quando o admin seleciona "Automático" no onboarding, o ambiente é resolvido por host da requisição edge (que é sempre `edge-runtime.supabase.com` ou o domínio Lovable). Isso sempre resulta em sandbox. A opção "Automático" é enganosa.

6. **Checkout envia `payment_environment: null` se hook não resolver** — Se `useRuntimePaymentEnvironment` não retornar antes do submit, `runtimePaymentEnvironment` pode ser `null`, e o `create-asaas-payment` rejeita com `payment_environment_unresolved`.

7. **`companies` não tem mais campos legados genéricos (`asaas_api_key`, `asaas_wallet_id`, etc.)** — Já foram removidos do schema. Os tipos em `database.ts` estão corretos. Nenhum fallback legado existe.

8. **Snapshot financeiro duplicado** — `verify-payment-status` e `asaas-webhook` (`upsertFinancialSnapshot`) ambos calculam e gravam `gross_amount`, `platform_fee_total`, `partner_fee_amount`, `platform_net_amount`. A mesma venda pode ter o snapshot recalculado múltiplas vezes.

9. **`payment_environment` na tabela `sales` com `NOT NULL` e sem default** — O campo é obrigatório mas não tem default. Vendas manuais criadas antes da persistência do ambiente podem ter problemas. O `create-asaas-payment` persiste antes de criar cobrança, mas vendas admin_manual podem não passar por esse fluxo.

10. **`get-runtime-payment-environment` edge function** — Listada no config.toml mas não no diretório de functions. Se não existir, o hook frontend faz fallback silencioso para browser hostname.

## Estrutura do documento de auditoria

O arquivo será gerado com todas as 14 seções solicitadas:
1. Objetivo
2. Escopo da auditoria
3. Visão geral atual da integração
4. Fluxo completo do uso da API
5. Estrutura atual das tabelas e campos relacionados
6. Pontos corretos já consolidados
7. Duplicidades, legados e ambiguidades encontrados
8. Riscos estruturais e operacionais
9. Ajustes recomendados
10. Prioridade dos ajustes
11. O que corrigir agora
12. O que manter temporariamente
13. O que remover futuramente
14. Veredito final

## Implementação

1. **Criar arquivo `docs/auditoria-completa-asaas-smartbus.md`** com toda a análise detalhada, campo por campo, função por função, cobrindo os achados acima e o fluxo completo ponta a ponta.

Nenhuma alteração de código será proposta nesta etapa — apenas o diagnóstico documental.
