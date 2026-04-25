# Step 5 de 5 — Hardening final e congelamento do padrão Asaas

## 1) Resumo executivo

Este Step 5 consolidou o contrato final do fluxo Asaas sem reabrir arquitetura:

- removeu fallback legado remanescente no `verify-payment-status`;
- removeu fallback legado no resolvedor para credenciais/wallets por ambiente;
- removeu fallback de wallet legado em `partners`;
- manteve webhook fail-closed e restringiu processamento a venda com ambiente persistido;
- preservou sandbox espelho da produção com owner `company` no fluxo principal;
- enxugou ruído de transição em consultas e logs.

**Resultado:** arquitetura final fechada, previsível e orientada a contrato único por ambiente.

---

## 2) Legados removidos

1. **Fallback de credencial no verify**
   - removida flag de compatibilidade `ASAAS_VERIFY_ALLOW_LEGACY_FALLBACK`;
   - verify agora usa somente API key da empresa no ambiente da venda.

2. **Fallback legado de campos de empresa no resolvedor**
   - removidas leituras de `asaas_api_key`, `asaas_wallet_id`, `asaas_account_id`, `asaas_account_email`, `asaas_onboarding_complete` como fallback;
   - resoluções agora usam somente campos explícitos por ambiente.

3. **Fallback legado de wallet de parceiro**
   - removido uso de `partners.asaas_wallet_id` como fallback;
   - resolução usa apenas `asaas_wallet_id_production` / `asaas_wallet_id_sandbox`.

4. **Webhook com suposição implícita de ambiente**
   - quando `sales.payment_environment` não existe, webhook agora rejeita o evento (não assume mais `sandbox`).

**Impacto da remoção:** elimina ambiguidade de contexto financeiro e reforça separação sandbox/produção.

---

## 3) Contrato final do sistema

### Ambiente
- `create-asaas-payment` decide ambiente inicial e persiste em `sales.payment_environment`.
- Demais fluxos (`verify`, `webhook`, `platform fee`) obedecem o ambiente persistido na venda.

### Owner
- Fluxo principal (`create`, `verify`, `webhook`) usa owner `company` em sandbox e produção.
- Fluxo de taxa de plataforma (`platform_fee`) usa owner `platform`.

### Credencial
- Fluxo principal usa exclusivamente API key da empresa por ambiente.
- Fluxo de taxa de plataforma usa API key da plataforma por ambiente.
- Falta de credencial de empresa gera falha explícita.

### Split
- Fluxo principal: split habilitado para plataforma + parceiro, em ambos os ambientes.
- Wallet da plataforma por secret do ambiente.
- Wallet do parceiro por campo do ambiente correspondente.

### Webhook
- Exige ambiente resolvido da venda.
- Exige secret de token configurado para o ambiente.
- Token inválido ou secret ausente => rejeição explícita.

### Verify
- Consulta Asaas usando somente credencial da empresa do ambiente da venda.
- Sem fallback para credencial de plataforma.

### Onboarding
- Prontidão por ambiente depende de configuração explícita nos campos de ambiente.

### Multi-tenant
- Seleção de parceiro para snapshot financeiro sempre filtrada por `company_id`.

---

## 4) Contrato final do resolvedor central

### Interface final
`resolvePaymentContext` governa oficialmente:
- ambiente (`production`/`sandbox`) e origem da decisão;
- owner do fluxo;
- credencial a ser usada por modo (`create`, `verify`, `webhook`, `platform_fee`);
- split policy;
- secret de wallet da plataforma;
- token de webhook do ambiente.

### Responsabilidades finais
- não faz fallback para campos legados de empresa/parceiro;
- não faz fallback de credencial de plataforma no verify;
- não usa dual-token para webhook;
- mantém rastreabilidade de decisão via `decisionTrace`.

---

## 5) Observabilidade final

### Logs mantidos
- `payment_context_loaded` / `payment_context_resolved`;
- transições de status (`status_transition_attempt`, `status_transition_success`);
- seleção financeira de parceiro (`financial_partner_selected`);
- validação de webhook com `expected_token_secret` e resultado da validação.

### Logs removidos/aposentados
- rastreio de fallback legado no verify (não há mais fallback para rastrear).

### Diagnóstico ponta a ponta
1. validar contexto resolvido (ambiente/owner/credencial);
2. validar criação de cobrança e persistência de `payment_environment`;
3. validar webhook (secret esperado + resultado de token);
4. validar snapshot financeiro e parceiro selecionado por `company_id`.

---

## 6) Documentação operacional

Documentação criada neste Step 5:
- `docs/step5-hardening-final-asaas.md` (este playbook final).

Cobre:
- contrato final por ambiente;
- pré-requisitos por empresa/ambiente;
- comportamento definitivo de create/verify/webhook/split;
- pontos de observabilidade operacional.

---

## 7) Checklist final de prontidão

- [x] Configuração sandbox por empresa (API key, wallet, onboarding)
- [x] Configuração produção por empresa (API key, wallet, onboarding)
- [x] Criação de cobrança com ambiente persistido
- [x] Split em sandbox e produção com política única
- [x] Webhook com validação fail-closed por ambiente
- [x] Verify sem fallback legado
- [x] Geração de ticket após confirmação
- [x] Isolamento multi-tenant em parceiros
- [x] Logs suficientes para suporte e auditoria
- [x] Prontidão explícita por empresa/ambiente

---

## 8) Parecer final

O fluxo Asaas está **oficialmente consolidado** no contrato final definido para o projeto.

O sistema está pronto para seguir sem dependência da fase de transição, com os seguintes cuidados operacionais contínuos:
- manter onboarding completo por ambiente para cada empresa;
- garantir configuração correta dos secrets por ambiente (API key/wallet/token);
- monitorar logs de contexto e rejeição de webhook para diagnóstico rápido.
