# Pré-Step 5 — Correções cirúrgicas obrigatórias (Asaas)

## 1. Resumo executivo

Foram corrigidos os 3 riscos residuais apontados na auditoria:

1. **Fallback de credencial no `verify-payment-status`** agora é **opt-in por feature flag**, não padrão.
2. **Webhook** passou a operar com validação de token **fail-closed** e sem fallback dual-token.
3. **Consultas em `partners`** para snapshot financeiro/verify agora respeitam obrigatoriamente `company_id`.

### Impacto prático
- Redução de ambiguidade de credenciais no verify.
- Endurecimento de segurança no webhook (sem secret/token válido, não processa).
- Correção de risco multi-tenant na seleção de parceiro para cálculo financeiro.

### Estado de readiness
- **✅ pronto para Step 5** no escopo dos 3 riscos tratados neste pré-hardening.

---

## 2. Correção do fallback do verify

## Antes
- `verify-payment-status` chamava o resolver com `allowLegacyVerifyFallback: true`.
- Na ausência de API key da empresa no ambiente, podia usar credencial da plataforma silenciosamente.

## Como ficou
- O fallback legado agora só ocorre se a flag `ASAAS_VERIFY_ALLOW_LEGACY_FALLBACK=true` estiver ativa.
- Sem API key da empresa (e fallback desligado), o verify retorna falha explícita (`409`, `missing_company_asaas_api_key`).

## Compatibilidade residual
- Mantida apenas por **feature flag temporária e explícita**.
- Uso de fallback legado gera log dedicado (`legacy_fallback_used`).

---

## 3. Correção do webhook

## Antes
- Havia fallback dual-token em cenários não determinísticos.
- Validação era condicional (`fail-open`) quando secrets não existiam.

## Como ficou
- O webhook só continua quando o ambiente da venda foi determinado a partir da referência da venda.
- Removido fallback dual-token no resolver (`webhookTokenCandidates` agora usa somente token do ambiente resolvido).
- Validação de token agora é **fail-closed**:
  - sem secret configurado do ambiente => rejeita (`500`);
  - token inválido => rejeita (`401`);
  - sem ambiente resolvido => rejeita (`400`).

## Validação de token
- Determina ambiente da venda.
- Resolve `expected_token_secret` do ambiente.
- Valida token recebido contra somente esse ambiente.

---

## 4. Correção multi-tenant de partners

## Onde estava o risco
- Snapshot financeiro no webhook e cálculo financeiro no verify consultavam `partners` sem filtro por empresa.

## Como foi corrigido
- Inclusão de filtro obrigatório `.eq("company_id", <company_id_da_venda>)` nas consultas de parceiro ativo.

## Garantia de isolamento
- O parceiro selecionado agora sempre pertence à empresa da venda.
- A wallet usada segue resolução por ambiente sobre o parceiro já isolado por tenant.

---

## 5. Logs adicionados/ajustados

## Verify
- `payment_context_loaded` enriquecido com:
  - `legacy_fallback_allowed`
  - `legacy_fallback_used`
- `missing_company_api_key` com motivo explícito.
- `legacy_fallback_used` (warn) quando fallback estiver habilitado e usado.
- `financial_partner_selected` com `partner_id`, wallet e origem da wallet.

## Webhook
- `webhook_received` com:
  - `expected_token_secret`
  - `token_validation_result`
  - `token_validation_mode=single_environment_token`
- Log operacional quando token válido com `sale_id`, `environment`, `external_reference` e secret esperado.
- Persistência de rejeições por ambiente não resolvido, secret ausente e token inválido.

---

## 6. Validação do sandbox espelho (Step 4)

As correções preservam o contrato do Step 4:
- sandbox continua com owner da empresa no fluxo principal (via resolver);
- split continua ativo no sandbox;
- credenciais e wallets seguem resolução por ambiente;
- verify continua funcional para fluxo novo (com API key da empresa no sandbox);
- webhook sandbox continua processando com token correto do sandbox.

---

## 7. Parecer final

**✅ pronto para Step 5** no escopo de pré-correções solicitado (fallback verify, segurança webhook e escopo multi-tenant de partner).
