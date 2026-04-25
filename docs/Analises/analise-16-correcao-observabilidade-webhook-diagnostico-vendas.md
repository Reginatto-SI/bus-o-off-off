# Correção mínima — observabilidade do webhook em `/admin/diagnostico-vendas`

## Objetivo

Implementar a menor correção segura para reduzir a ambiguidade da aba **Webhook** em `/admin/diagnostico-vendas` quando uma venda é confirmada pelo fallback `verify-payment-status` sem existir webhook persistido correlacionado.

## Causa raiz resumida

A investigação anterior confirmou que a UI não estava lendo a fonte errada. O problema era de observabilidade: a venda podia ser confirmada pelo fallback `verify-payment-status`, mas sem nenhum `incoming_webhook` correlacionado em `sale_integration_logs`, o que deixava a aba Webhook limitada a mostrar apenas `Não detectado`.

## Lacuna diagnóstica encontrada

Faltava um rastro técnico explícito indicando que:
- o pagamento foi confirmado por fallback;
- até aquele momento não existia webhook persistido correlacionado à venda;
- a ausência de webhook era uma anomalia diagnóstica, e não simples estado desconhecido.

## Arquivos alterados

- `supabase/functions/verify-payment-status/index.ts`
- `src/pages/admin/SalesDiagnostic.tsx`
- `analise-16-correcao-observabilidade-webhook-diagnostico-vendas.md`

## Correção implementada

### 1. Log técnico adicional no `verify-payment-status`

Foi adicionada uma checagem local e mínima no fluxo de confirmação bem-sucedida do `verify-payment-status`.

Quando o fallback confirma o pagamento:
- procura `incoming_webhook` da Asaas para a mesma venda;
- respeita `sale_id`, `company_id` e `payment_environment`;
- verifica se o incidente já foi registrado antes;
- se ainda não houver webhook persistido nem incidente prévio, grava um `manual_sync` adicional em `sale_integration_logs` com:
  - `incident_code = webhook_not_observed_before_verify_confirmation`
  - mensagem objetiva explicando a lacuna de observabilidade.

Isso evita duplicação perigosa em polling repetido.

### 2. Ajuste da aba Webhook

A aba Webhook passou a diferenciar explicitamente três cenários:

1. **Webhook persistido e correlacionado**  
   Continua exibindo normalmente que o webhook foi encontrado.

2. **Fallback confirmou sem webhook persistido**  
   Agora a aba mostra:
   - `Webhook persistido: Não encontrado`
   - origem da confirmação por `verify-payment-status`
   - leitura diagnóstica explícita de fallback sem evidência de webhook
   - incidente de observabilidade quando existir

3. **Sem webhook e sem confirmação on-demand identificada**  
   Continua como caso não identificado.

## Como a UI passou a diferenciar os cenários

A UI agora usa duas referências complementares:
- presença de `incoming_webhook` da Asaas em `detailIntegrationLogs`;
- presença do novo incidente `webhook_not_observed_before_verify_confirmation` em logs `manual_sync`.

Com isso, a tela deixa de colapsar tudo em `Não detectado` e passa a distinguir:
- webhook realmente persistido;
- pagamento confirmado por fallback sem evidência de webhook;
- ausência total de sinais.

## O que foi deliberadamente não alterado

Para manter a correção mínima e segura:
- não foi criada nova tabela;
- não foi alterada a rotina compartilhada de finalização;
- não foi criada correlação heurística adicional por `external_reference` ou `payment_id` na UI;
- não foi mudada a regra de confirmação do pagamento;
- não foi alterada a arquitetura multiempresa nem multiambiente.

## Risco residual

Ainda permanece uma limitação estrutural: sem acesso ao Asaas ou a logs externos do endpoint, o sistema continua sem distinguir com certeza absoluta se o webhook nunca foi enviado, se falhou antes de chegar ou se chegou sem contexto suficiente para correlação. A correção implementada melhora a auditabilidade interna, mas não elimina essa fronteira externa.

## Checklist de validação executado

- [x] Quando existe `incoming_webhook`, a aba continua priorizando webhook
- [x] Quando não existe webhook persistido, mas há confirmação por `verify-payment-status`, a aba agora explicita o fallback
- [x] O incidente `webhook_not_observed_before_verify_confirmation` é gravado apenas quando aplicável
- [x] Há proteção contra duplicação do incidente em polling repetido
- [x] A lógica continua respeitando `sale_id`, `company_id` e `payment_environment`
- [x] Nenhum fluxo principal de pagamento foi refatorado
- [x] A mudança ficou concentrada em backend de observabilidade e leitura diagnóstica da aba
