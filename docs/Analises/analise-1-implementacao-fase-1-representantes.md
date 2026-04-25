# Implementação Fase 1 — Módulo de Representantes

## 1. O que foi implementado

Foi implementada a base estrutural da Fase 1 com foco em persistência, vínculo oficial no backend e rastreabilidade:
- estrutura de dados de representantes;
- estrutura de vínculo representante → empresa;
- ledger de comissão por venda;
- snapshot de representante na venda;
- criação idempotente da comissão após confirmação de pagamento.

## 2. Tabelas criadas

- `representatives`: cadastro oficial do representante (identidade, código, wallet por ambiente, status, comissão padrão).
- `representative_company_links`: fonte de verdade do vínculo representante → empresa (fase inicial com 1 empresa = 1 representante).
- `representative_commissions`: ledger auditável da comissão por venda (1 registro por `sale_id`).

## 3. Campos adicionados em estruturas existentes

- `sales.representative_id`:
  - snapshot histórico do representante associado à empresa no nascimento da venda.
- `sale_integration_logs.representative_id`:
  - metadado opcional para rastreabilidade futura em integrações.

## 4. Onde o vínculo representante → empresa foi implementado

- Arquivo: `supabase/functions/register-company/index.ts`
- Função/fluxo: `register-company`
- Lógica aplicada:
  - recebe código por `representative_code` (campo controlado) ou, como fallback seguro, por `referral_code` quando esse código não foi consumido por indicação entre empresas;
  - valida código no backend (`representatives` ativos);
  - cria vínculo oficial em `representative_company_links` com `source_code`, `link_source`, `source_context`, `linked_at` e `locked=true`;
  - mantém robustez do cadastro (falha do vínculo não derruba onboarding da empresa).

## 5. Onde a comissão nasce

- Arquivo: `supabase/functions/_shared/payment-finalization.ts`
- Função: `finalizeConfirmedPayment`
- Regra aplicada:
  - após confirmação de pagamento e consistência mínima de tickets, chama RPC `upsert_representative_commission_for_sale`;
  - a RPC é idempotente por `sale_id` e não gera comissão em duplicidade.

## 6. Como a comissão foi calculada

- Base = `sales.gross_amount` (fallback para `unit_price * quantity` quando necessário).
- Percentual = `representatives.commission_percent` com default Fase 1 = **2%**.
- Valor = `ROUND(base_amount * (commission_percent / 100), 2)`.

## 7. Como foi tratada a prevenção de duplicidade

- Constraint única em `representative_commissions.sale_id`.
- Função `upsert_representative_commission_for_sale` usa `ON CONFLICT (sale_id) DO NOTHING`.
- Resultado: chamadas repetidas de webhook/verify/reconcile não duplicam comissão.

## 8. Como foi tratada a ausência de wallet

- Na criação da comissão, a wallet do representante é checada pelo ambiente da venda.
- Se wallet ausente:
  - comissão é criada com status `bloqueada` e `blocked_reason='representative_wallet_missing'`.
- Se wallet presente:
  - comissão nasce como `pendente`.
- Em ambos os casos, pagamento/checkout não é quebrado.

## 9. Impactos no checkout atual

- Não foi alterada a composição de split nem a criação da cobrança Asaas nesta fase.
- O checkout segue o fluxo atual.
- O snapshot de representante na venda foi implementado por trigger backend (`BEFORE INSERT` em `sales`), sem dependência de lógica de frontend.

## 10. Riscos residuais

- Ainda não existe inclusão do representante no split do checkout.
- Ainda não existe painel do representante.
- Ainda não existe fluxo administrativo para ajuste controlado de vínculo bloqueado (`locked=true`).
- Ainda falta definir política oficial para possíveis colisões semânticas entre códigos de indicação de empresa e códigos de representante.

## 11. Próximo passo recomendado

Fase 2: centralizar resolvedor de recebedores de split (plataforma/sócio/representante) e integrar representante no split de forma segura por ambiente, sem duplicação de lógica entre create/verify/webhook.
