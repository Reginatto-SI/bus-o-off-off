# Resumo da etapa

- **Objetivo da Etapa 4:** fechar a blindagem operacional do fluxo com observabilidade útil por `sale_id`, deixando ambiente (`sandbox`/`production`), origem e resultado explícitos sem criar arquitetura pesada.
- **Implementado:**
  - padronização de trilha operacional em `sale_logs` via helper compartilhado;
  - enriquecimento dos eventos estruturados (`logPaymentTrace`) em verify e reconciliação;
  - visibilidade de `payment_environment` em detecção/reconciliação e resultados administrativos;
  - documentação operacional curta para suporte.
- **Como ficou melhor:** agora a equipe consegue seguir a linha do tempo por `sale_id` com `source`, `result`, `env` e motivo principal de falha/inconsistência.

---

# Arquivos alterados

1. `supabase/functions/_shared/payment-observability.ts`
   - novo helper `logSaleOperationalEvent` para registrar trilha mínima padronizada em `sale_logs`.

2. `supabase/functions/_shared/payment-finalization.ts`
   - integração do helper operacional em pontos críticos (`started`, `completed`, `inconsistent`, `failed`);
   - detecção (`inspectSaleConsistency`) passou a incluir `payment_environment` no estado inspecionado.

3. `supabase/functions/create-asaas-payment/index.ts`
   - criação de pagamento passa a registrar `payment_create_started`, `payment_create_completed` e falhas críticas com contexto de ambiente.

4. `supabase/functions/verify-payment-status/index.ts`
   - adicionados logs estruturados para falha de consulta Asaas e para estados `payment_not_confirmed`/`status_unchanged`.

5. `supabase/functions/reconcile-sale-payment/index.ts`
   - resultados por item passaram a incluir `payment_environment`;
   - adicionados eventos estruturados por cenário (`healthy`, `not_eligible`, `reconciled`, `inconsistent_unresolved`, `error`).

6. `docs/analise-etapa4-observabilidade-trilha-operacional.md`
   - relatório final da etapa.

7. `docs/guia-operacional-diagnostico-venda-pagamentos.md`
   - guia operacional curto para suporte e desenvolvedores.

---

# Estratégia de observabilidade

## Eventos rastreados com mais consistência
- criação de pagamento (`payment_create_started`, `payment_create_completed`, `payment_create_failed`)
- finalização central (`payment_finalize_started`, `payment_finalize_completed`, `payment_finalize_inconsistent`, `payment_finalize_failed`)
- verify sem confirmação (`payment_not_confirmed`, `payment_status_unchanged`)
- reconciliação administrativa (`sale_already_healthy`, `sale_not_eligible`, `sale_reconciled`, `sale_inconsistent_unresolved`, `sale_reconciliation_error`)

## Campos/contexto registrados
- `sale_id`
- `company_id`
- `payment_environment`
- `source`
- `result`
- `error_code` (quando aplicável)
- `detail` (motivo resumido)

## Leitura da trilha por `sale_id`
1. consultar `sale_logs` para cronologia operacional (`[payment_ops] ...`)
2. consultar `sale_integration_logs` para payload/resposta de integração
3. correlacionar com `logPaymentTrace` em funções edge quando necessário

---

# Ambiente sandbox vs produção

- `payment_environment` agora aparece explicitamente em:
  - eventos operacionais de finalização (`logSaleOperationalEvent`)
  - inspeção de consistência e reconciliação administrativa
  - logs estruturados de verify/reconcile
- Pontos com registro explícito reforçado:
  - criação de pagamento
  - verify
  - finalização compartilhada
  - reconciliação administrativa
- Limitação remanescente: legibilidade depende de disciplina de consulta combinada (`sale_logs` + `sale_integration_logs` + logs edge), já que não foi criado painel novo (intencionalmente fora do escopo).

---

# Erros silenciosos mitigados

- verify agora registra contexto ao falhar consulta de status no Asaas (`http_status`, `payment_environment`, `sale_id`).
- reconciliação administrativa agora registra claramente cenários não elegíveis/saudáveis/erro, reduzindo “caixa preta”.
- finalização central registra estados operacionais em `sale_logs`, evitando perda de contexto entre webhook/verify/reconcile.

Pontos que ainda exigem atenção:
- comandos operacionais devem sempre usar `sale_id` correto e conferir `payment_environment` antes de ações manuais.

---

# Limitações remanescentes

- não foi criado painel de observabilidade dedicado (fora do escopo por simplicidade);
- não foi criado scheduler novo de reconciliação automática (também fora do escopo);
- não houve mudança de modelagem pesada para evitar complexidade desnecessária.

Cuidado antes de declarar fluxo “saudável de verdade”:
- manter rotina operacional de leitura da trilha por `sale_id`;
- validar periodicamente se equipes estão interpretando estados padronizados corretamente.

---

# Recomendação objetiva

- O fluxo está mais profissional e sustentável com as 4 etapas concluídas no escopo proposto.
- Sim, o essencial foi coberto para estabilização pragmática.
- Alerta crítico residual: garantir processo operacional claro para uso da reconciliação administrativa e leitura combinada dos logs.
