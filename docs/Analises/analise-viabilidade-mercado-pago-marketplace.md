# Auditoria de viabilidade técnica — Mercado Pago Marketplace no SmartBus BR

**Data da auditoria:** 4 de agosto de 2026
**Escopo:** investigação estática do repositório; nenhuma integração, migration, policy, secret ou tela foi alterada
**Status:** documento para decisão; não autoriza implementação

**Navegação do projeto futuro:** [índice Mercado Pago](../PRDs/MercadoPago/00-mercado-pago-indice-geral.md) · [PRD principal](../PRDs/MercadoPago/02-mercado-pago-prd-principal-implementacao.md) · [gates progressivos](../PRDs/MercadoPago/25-mercado-pago-validacoes-pre-implementacao.md)

## 1. Resumo executivo

O SmartBus já possui bons blocos de domínio reutilizáveis: motor oficial de taxa por item, distribuição em centavos, resolução de recebedores, ambiente congelado na venda, finalização idempotente compartilhada, logs e reconciliação. Entretanto, o contrato persistido, as credenciais, os estados externos, o webhook, o diagnóstico e boa parte da interface ainda dizem **Asaas** explicitamente.

A inclusão de outro provedor é tecnicamente possível sem reescrever o ciclo da venda, mas não é apenas uma troca de endpoint. São necessárias uma identidade de provedor congelada na venda, uma configuração/credencial isolada por `company_id` e ambiente, adaptadores com capacidades explícitas e um envelope neutro de evento/status. O motor em `_shared/platform-fee-engine.ts` deve continuar sendo a única autoridade monetária; nenhum adaptador Mercado Pago deve recalcular a taxa.

O Mercado Pago público 1:1 consegue, sob as premissas desta análise, cobrar na conta OAuth da empresa e enviar **uma** comissão total ao marketplace. Isso não entrega diretamente as parcelas do sócio e do representante. Logo, ele só reproduz nativamente o cenário D (100% da taxa para SmartBus). Nos cenários A, B e C, preserva-se o cálculo, mas o destino completo exigiria 1:N formalmente aprovado ou repasse posterior. Este último é um plano alternativo de alto risco, não uma recomendação padrão.

**Recomendação:** **GO condicionado** apenas para arquitetura e prova de conceito 1:1 fechada; **NO-GO para produção com equivalência financeira completa** até confirmação comercial/técnica do 1:N ou aprovação jurídica, contábil e financeira de um ledger de repasses.

## 2. Conclusão preliminar de viabilidade

| Decisão | Veredito | Motivo |
|---|---|---|
| Manter somente Asaas agora | Viável e menor risco | Fluxo existente permanece funcional e é o único que materializa split direto multipartes. |
| Adicionar MP 1:1 como equivalente geral | **Não viável** | `application_fee`/`marketplace_fee` tem um único destino marketplace e não paga sócio/representante. |
| Fazer POC controlada MP 1:1 | **Viável, condicionada** | Valida OAuth, pagamento, webhook, idempotência e conciliação sem declarar equivalência financeira. |
| Adotar MP 1:N | **Indeterminado/bloqueado** | Depende de oferta, contrato e documentação formal específica do Mercado Pago. |
| Usar repasse interno | Tecnicamente possível, **alto risco** | Exige subledger, reservas, reversões, cobrança de dívida e aprovações externas. |

Não foi encontrada impossibilidade estrutural no ciclo de reserva/ticket. O bloqueio é financeiro/comercial e, secundariamente, de modelagem: `sales.asaas_payment_id`, `sales.asaas_payment_status` e `asaas_webhook_event_dedup` não podem representar com segurança dois provedores sem evolução de schema.

## 3. Arquivos investigados

### 3.1 Backend e helpers centrais

- `supabase/functions/create-asaas-payment/index.ts`
- `supabase/functions/asaas-webhook/index.ts`
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/reconcile-sale-payment/index.ts`
- `supabase/functions/create-platform-fee-checkout/index.ts`
- `supabase/functions/get-asaas-payment-link/index.ts`
- `supabase/functions/check-asaas-integration/index.ts`
- `supabase/functions/create-asaas-account/index.ts`
- `supabase/functions/get-runtime-payment-environment/index.ts`
- `supabase/functions/_shared/platform-fee-engine.ts`
- `supabase/functions/_shared/checkout-financial-integrity.ts`
- `supabase/functions/_shared/split-recipients-resolver.ts`
- `supabase/functions/_shared/asaas-split-continuity.ts`
- `supabase/functions/_shared/payment-context-resolver.ts`
- `supabase/functions/_shared/payment-finalization.ts`
- `supabase/functions/_shared/payment-observability.ts`
- `supabase/functions/_shared/runtime-env.ts`

### 3.2 Frontend

- `src/pages/public/Checkout.tsx`, `src/pages/public/Confirmation.tsx`
- `src/pages/admin/Company.tsx`, `src/pages/admin/Sales.tsx`, `src/pages/admin/SalesDiagnostic.tsx`
- `src/pages/admin/Events.tsx`, `src/pages/admin/ServiceSales.tsx`, `src/pages/admin/SalesReport.tsx`
- `src/pages/admin/Representative.tsx`, `src/pages/admin/SociosSplit.tsx`
- `src/pages/admin/CompanyActivationReport.tsx`
- `src/components/admin/NewSaleModal.tsx`
- `src/components/admin/AsaasOnboardingWizard.tsx`, `AsaasDiagnosticPanel.tsx`, `AsaasAddressModal.tsx`
- `src/hooks/use-runtime-payment-environment.ts`
- `src/lib/asaasIntegrationStatus.ts`, `asaasInvoiceUrl.ts`, `asaasError.ts`
- `src/lib/feeCalculator.ts`, `platformFeeCheckout.ts`, `financialSocioSplitConfig.ts`
- `src/integrations/supabase/types.ts`

### 3.3 Banco, testes e documentação consultada

- migrations de criação/evolução de `companies`, `sales`, `sale_passengers`, `tickets`, `sale_logs`, `sale_integration_logs`, `asaas_webhook_event_dedup`, `socios_split`, `representatives`, `representative_company_links` e `representative_commissions`;
- em especial: `20260305000000_add_company_id_trips_sales_event_boarding_locations.sql`, `20260317000601_caa381c3-87bf-4b5a-879e-8348a25a6ee7.sql`, `20260424120000_add_sales_split_snapshot_asaas.sql`, `20260701090000_create_sale_integration_logs.sql`, `20260728120617_1badd92c-e385-4eef-a46c-629fcb195b54.sql`, `20260815090000_add_asaas_environment_configuration.sql`, `20261001120000_harden_payment_environment_and_logs.sql`, `20261017090000_stage3_payment_observability_dedup.sql`, `20261024110000_final_asaas_alignment.sql` e `20261106090000_create_representatives_phase1_base.sql`;
- todos os caminhos acima foram reconfirmados em `supabase/migrations/` durante o refinamento de 2026-08-04. Os prefixos `202608`, `202610` e `202611` fazem parte dos nomes versionados presentes no repositório analisado, embora sejam posteriores à data desta auditoria; sua citação comprova presença no código versionado, não aplicação no banco remoto nem passagem cronológica do ambiente;
- testes `feeCalculator.test.ts`, `checkoutFinancialIntegrity.test.ts`, `platformFeeDistributionContract.test.ts`, `asaasSplitContinuity.test.ts`, `asaasIntegrationStatus.test.ts` e `manualPlatformFeeSplitContract.test.ts`;
- `docs/PRDs/MercadoPago/*`, `docs/PRD/Asaas/*` e análises Asaas correlatas.

Esta é uma auditoria do código versionado, não uma inspeção do banco remoto, logs reais, secrets implantados ou contrato comercial do Mercado Pago.

## 4. Arquitetura atual de pagamentos

```text
Checkout/Admin
  -> cria sales (company_id + payment_environment + status)
  -> cria sale_passengers / reservas
  -> create-asaas-payment
       -> contexto da empresa/ambiente
       -> integridade + motor de taxa
       -> elegibilidade de sócio/representante
       -> payload Asaas + externalReference=sale.id
       -> persiste asaas_payment_id/status + snapshot
  -> Asaas
       -> asaas-webhook (prioritário) ┐
       -> verify-payment-status       ├-> finalizeConfirmedPayment
       -> reconcile-sale-payment      ┘     -> pago + tickets + locks + logs + comissão
```

O `company_id` da venda é a âncora tenant. `payment_environment` é `sandbox` ou `production`, nasce no checkout/venda manual e é validado antes da chamada. `resolvePaymentContext` seleciona credenciais/endpoints Asaas e a política de split. A finalização compartilhada reduz duplicidade entre webhook, consulta e reconciliação, mas seus tipos/campos ainda são Asaas.

## 5. Mapa de acoplamento ao Asaas

| Arquivo / função ou componente | Categoria e responsabilidade | Acoplamento | Impacto / reutilização | Risco |
|---|---|---:|---|---:|
| `_shared/platform-fee-engine.ts` / `computeProgressiveFeeForPassengers`, `distributePlatformFee` | Regra financeira SmartBus | Baixo | Reutilizar integralmente antes do adaptador | Alto se alterado |
| `_shared/checkout-financial-integrity.ts` | Confere preço, desconto e total do checkout | Baixo | Reutilizável pelo domínio | Alto |
| `_shared/split-recipients-resolver.ts` / `resolveAsaasSplitRecipients` | Elegibilidade + wallets Asaas | Alto | Separar resolução de identidade da resolução de conta por provedor | Alto |
| `_shared/asaas-split-continuity.ts` | Converte decisão em `fixedValue`/`totalFixedValue`; fallback sem split | Exclusivo | Somente adaptador Asaas | Alto |
| `_shared/payment-context-resolver.ts` | Ambiente, credencial, owner, webhook; provider type fixo `asaas` | Alto | Conceito reutilizável; implementação precisa chave provider | Alto |
| `_shared/runtime-env.ts` | Ambiente comum, mas endpoints/secrets Asaas | Médio | `PaymentEnvironment` reutilizável; getters não | Médio |
| `create-asaas-payment` | Orquestra domínio e API Asaas no mesmo arquivo | Muito alto | Extrair somente fronteira mínima; preservar validações | Crítico |
| `asaas-webhook` | Assinatura/token, eventos, dedup, reversões e finalização | Muito alto | Finalização é reutilizável; parsing/dedup Asaas não | Crítico |
| `verify-payment-status` | Consulta e normaliza status Asaas | Alto | Padrão de fallback reutilizável via provider congelado | Alto |
| `reconcile-sale-payment` | Inspeção/finalização, porém lê campos/status Asaas | Médio/alto | Boa base após neutralizar envelope | Alto |
| `_shared/payment-finalization.ts` | Uma rotina para venda/tickets/locks/comissão | Médio | Principal ativo reutilizável; renomear parâmetros/campos futuramente | Crítico |
| `_shared/payment-observability.ts` | Logs comuns com `asaas_event_id` | Médio | Estrutura reutilizável; evento deve ganhar provider/event id genérico | Médio |
| `create-platform-fee-checkout` | Cobrança Asaas separada de venda manual e split | Muito alto | Não reutilizar como MP 1:1; é fluxo distinto | Alto |
| `companies` | Credenciais e readiness Asaas em colunas | Alto (DB) | Não acomodar tokens MP nas mesmas colunas | Crítico |
| `sales` | IDs/status externos nomeados Asaas | Alto (DB) | Vendas legadas permanecem; novos campos/entidade são prováveis | Crítico |
| `sale_integration_logs` | Quase genérica, mas contém `asaas_event_id` | Médio (DB) | Reutilizável com provider e evento neutro | Médio |
| `asaas_webhook_event_dedup` | Dedup exclusivo | Total (webhook) | Preservar e criar dedup neutro/MP separado | Alto |
| `Checkout.tsx` | Invoca diretamente `create-asaas-payment`, abre invoice Asaas | Alto (UI) | Criação/reserva reutilizável; dispatch deve usar provider da venda | Crítico |
| `Confirmation.tsx` | Polling, reabrir fatura e textos Asaas | Alto (UI) | Estado/tickets reutilizáveis; ações dependem de capability | Alto |
| `Company` + wizard/diagnóstico | Onboarding por API key/subconta Asaas | Total (UI) | Padrão visual reutilizável, fluxo OAuth é distinto | Médio |
| `Events.tsx` | Gate de publicação exige Asaas | Alto (UI/regra) | Deve exigir “provider ativo saudável”, não Asaas | Alto |
| `SalesDiagnostic.tsx` | Busca/exibe IDs, wallet, eventos e payload Asaas | Alto | Layout reutilizável; conteúdo por adaptador/permissão | Médio |
| `Representative.tsx`, `SociosSplit.tsx` | Wallets e textos Asaas | Alto | Identidade reutilizável; conta externa é provider+ambiente | Alto |
| `SalesReport.tsx` | Exporta somente `asaas_payment_id` | Alto | Precisa identificador neutro preservando legado | Médio |

**Separação recomendada:** regra financeira e ciclo de venda ficam no núcleo; transporte, autenticação, payload, status bruto, assinatura, tarifa e capacidades ficam nos adaptadores; telas renderizam o estado/capabilities, não secrets.

## 6. Motor financeiro e fonte única da regra

### 6.1 Autoridade atual

`_shared/platform-fee-engine.ts` implementa as faixas 6/5/4/3%, teto de R$ 25 **por item**, soma e depois aplica mínimo total de R$ 5. Arredonda em centavos. `distributePlatformFee` divide só depois e atribui eventual centavo residual ao SmartBus. Isso corresponde aos quatro cenários oficiais.

Para o sócio global, a elegibilidade financeira depende **somente** de conta ou wallet válida no provedor e no ambiente da venda: ele não pertence a empresa cliente, nunca recebe filtro por `company_id` e seu status administrativo não define participação financeira. Produção e sandbox não completam dados entre si. O representante, diferentemente, precisa estar capturado na venda, possuir vínculo com o `company_id` vendedor e conta válida no ambiente. Ausência de conta válida de qualquer recebedor interno não bloqueia a venda; a parcela é redirecionada pela tabela oficial. Snapshot, payload, diagnóstico, logs e ledger devem refletir a mesma decisão. `buildAsaasSplitPayload` traduz os valores absolutos decididos para o contrato Asaas.

### 6.2 Duplicidades e legado

- `src/lib/feeCalculator.ts` e valores percentuais históricos em `companies.platform_fee_percent` são superfícies legadas/UI; não devem originar o novo payload.
- `checkout-financial-integrity.ts` possui seu próprio `roundCurrency`, mas valida composição do checkout; não substitui o motor da taxa.
- `create-platform-fee-checkout` contém cálculo/orquestração da cobrança manual e precisa continuar convergindo ao motor oficial, não ser copiado.
- snapshot é montado na criação e também há `upsertFinancialSnapshot` no webhook; qualquer recomposição posterior deve consumir a decisão congelada, não recalcular elegibilidade atual.
- `representative_commissions` é ledger de comissão, enquanto o split direto e o snapshot da venda são evidências relacionadas; deve-se verificar, em implementação futura, que todos usem exatamente os valores decididos no momento da cobrança.

**Conclusão:** há uma fonte central correta para taxa e distribuição, mas não uma única função transacional que produza e persista, de uma vez, snapshot + payload + ledger + log. O futuro deve introduzir um `FinancialDecision` imutável proveniente do motor, consumido por todos; jamais copiar fórmulas no adaptador MP.

## 7. Fluxo atual de checkout

1. `Checkout.tsx` resolve ambiente em `use-runtime-payment-environment`.
2. Cria a venda com `company_id`, status, totais, método e `payment_environment`.
3. Cria `sale_passengers` como staging e mantém reservas/locks.
4. Invoca `create-asaas-payment` com `sale_id`, método, ambiente e aceite de termos.
5. A edge function relê venda/empresa, rejeita mismatch de ambiente, valida integração e integridade financeira.
6. Calcula taxa por passageiros/itens, resolve recebedores e monta split.
7. Usa `externalReference = sale.id`; em resultado ambíguo consulta por essa referência antes de qualquer novo POST.
8. Persiste `asaas_payment_id`, status, ambiente e snapshot; retorna invoice/checkout.
9. O frontend abre o pagamento e navega para confirmação.

Pontos a proteger: não apagar uma venda cuja chamada externa tenha resultado ambíguo; não despachar por configuração atual da empresa depois que a venda já congelou provider; impedir uma segunda tentativa em outro gateway; não confiar em provider/ambiente enviados isoladamente pelo browser.

## 8. Fluxo atual de webhook e confirmação

`asaas-webhook` valida o token oficial, extrai evento/pagamento/referência, correlaciona a venda, confirma contexto/ambiente, registra dedup por `event.id` e trata eventos. Confirmações chamam `finalizeConfirmedPayment`. `Confirmation.tsx` faz polling local e invoca `verify-payment-status` como fallback; `reconcile-sale-payment` repara “paga sem tickets”.

### Reutilizável

- `inspectSaleConsistency`, criação idempotente de tickets e `finalizeConfirmedPayment`;
- correlação por UUID da venda, confirmação de `company_id`, ambiente e valor;
- locks, passageiros, logs operacionais e RPC de comissão;
- princípio webhook prioritário + consulta/reconciliação secundárias.

### Específico do Asaas

- header/token, nomes de eventos/status, formato do payload;
- `asaas_event_id`, `asaas_payment_id/status`, URLs e consulta;
- regras de `PAYMENT_*`, chargeback/reversão e cobrança de taxa separada;
- dedup table/RPC e diagnóstico de wallet.

Para MP, o handler deve autenticar e normalizar o evento para um envelope interno, carregar a venda pelo par `(provider, external_reference/external_payment_id)`, validar tenant, ambiente, valor/moeda e então chamar a **mesma** finalização. Nunca criar `finalizeMercadoPagoSale`.

## 9. Fluxo atual de split e ledger

1. O motor calcula a taxa total oficial por item.
2. `resolveAsaasSplitRecipients` determina contas válidas no ambiente.
3. `distributePlatformFee` decide valores SmartBus/sócio/representante em centavos.
4. `buildAsaasSplitPayload` inclui apenas recebedores possíveis e registra degradação.
5. A criação persiste campos `split_snapshot_*` e razões.
6. A finalização aciona `upsert_representative_commission_for_sale`; `representative_commissions` guarda venda, empresa, representante, ambiente, base, percentual, valor e status.

Há dois conceitos que não podem ser confundidos: (a) split liquidado pelo gateway e (b) obrigação registrada no ledger. No Asaas atual eles devem convergir. Em MP 1:1, registrar obrigação sem mecanismo aprovado de liquidação cria passivo do SmartBus. Snapshots precisam guardar elegibilidade, valores, IDs de contas mascarados/referenciados, versão do motor/adaptador e modo de liquidação.

## 10. Estrutura atual de configuração por empresa

`companies` guarda pares sandbox/produção de API key, wallet, account id/e-mail, onboarding e readiness Pix Asaas. O runtime escolhe o par pelo ambiente. O sócio é global em `socios_split`; representantes são globais com vínculo explícito à empresa e wallets por ambiente.

Para seleção segura, a configuração mínima conceitual é `(company_id, provider, environment)` com estado, external account/user id, escopos, expiração, versão e referência a segredo. `companies.payment_provider` poderia indicar o padrão, mas **não basta**: a venda deve copiar `payment_provider` e `provider_adapter_version` no nascimento da tentativa. Tokens OAuth não devem residir em colunas frontend-readable nem ser devolvidos por RLS.

Campos existentes reutilizáveis: `company_id`, `payment_environment`, `payment_method`, totais, `external_reference` em logs e snapshots financeiros. Campos Asaas não devem receber IDs MP. São prováveis novos campos/entidades para provider, external payment id/status, idempotency key, adapter version e integração por ambiente.

## 11. Impacto no banco e RLS

### Estruturas reutilizáveis

- `sales.company_id`, `payment_environment`, status/timestamps e snapshots;
- `sale_passengers`, `tickets`, locks e `sale_logs`;
- `sale_integration_logs` como base de observabilidade;
- identidade global de `socios_split` sem vínculo empresarial, e identidade/vínculo de `representatives` com `representative_company_links`;
- `representative_commissions`, após declarar claramente liquidação/provider.

### Estruturas excessivamente Asaas

- credenciais/readiness em `companies.asaas_*`;
- `sales.asaas_payment_id`, `asaas_payment_status`, `asaas_transfer_id`;
- `asaas_webhook_event_dedup` e RPC correspondente;
- wallets Asaas em sócio/representante;
- `sale_integration_logs.asaas_event_id`.

### Evolução futura provável (sem SQL nesta auditoria)

- tabela privada de integrações por empresa/provider/ambiente e tabela/cofre de credenciais OAuth;
- tabela de tentativas/pagamentos com unique `(provider, environment, external_payment_id)` e idempotency key;
- provider/adapter version congelados em `sales` ou relação imutável com a tentativa;
- dedup genérico com unique `(provider, environment, external_event_id)`;
- contas de recebimento por beneficiário/provider/ambiente;
- se aprovado repasse interno: subledger de dupla entrada, reservas, lotes, itens, liquidações e reversões.

### Riscos de segurança

- policy pública histórica de criação de vendas precisa validar tenant por dados server-side; nunca aceitar `company_id` arbitrário para integração OAuth.
- service-role ignora RLS: cada query de webhook/adaptador deve predicar `company_id`, provider e ambiente.
- misturar token sandbox/produção, reutilizar external id sem namespace ou escolher a integração “mais recente” pode cobrar conta errada.
- refresh/access token, client secret e webhook secret nunca podem aparecer em selects do frontend, logs ou payload diagnóstico.
- RLS do sócio global é restrita a developer; divisão confidencial e ledger devem manter autorização equivalente.

## 12. Impacto nas telas

| Tela | Impacto futuro mínimo |
|---|---|
| Empresa / Pagamentos | Exibir provider ativo por ambiente, conectar/testar/revogar/reconectar; nunca mostrar token. |
| Wizard | Manter wizard Asaas; adicionar jornada OAuth MP somente quando habilitada, reutilizando modal/feedback existentes. |
| Diagnóstico | Filtro provider, saúde, IDs externos, ambiente, webhook/consulta; payload financeiro só a perfis autorizados. |
| Checkout | Despachar pelo provider congelado; bloquear antes da reserva definitiva se integração escolhida não estiver saudável. |
| Confirmação | Polling neutro e ações por capability (reabrir, consultar); texto/URL específicos sem assumir Asaas. |
| Venda manual | Congelar provider/ambiente e distinguir baixa manual de cobrança externa. |
| Painel do representante | Conta de recebimento por provider/ambiente, status validado, sem revelar split global. |
| Relatórios | Provider, external id/status e modo de liquidação; preservar leitura de vendas Asaas legadas. |
| Eventos/publicação | Gate por integração ativa saudável do provider escolhido, não por `hasAsaas`. |
| Relatório de ativação | Estado de pagamentos genérico e detalhe por provider. |

## 13. Proposta de camada mínima de provedores

Não é recomendada uma arquitetura paralela ampla. A fronteira mínima seria um registro server-side:

```ts
PaymentProviderAdapter {
  id; version; capabilities;
  validateIntegration(context);
  createPayment(command, financialDecision);
  getPayment(query);
  reopenPayment?(query);
  refund(command);
  parseAndVerifyWebhook(request);
  reconcile(query);
  normalizeStatus(providerPayload);
  identifyProviderFees(providerPayload);
}
```

O retorno deve ser explícito (`approved|pending|refused|cancelled|refunded|charged_back|unknown`) e sempre carregar status bruto, IDs, timestamps e evidence. Operação não suportada retorna `unsupported`, nunca simula equivalência.

Capabilities mínimas: `nativeSplitTwoParty`, `nativeSplitMultiParty`, `postSettlementTransfers`, `partialRefund`, `chargebackEvents`, `testEnvironment`, `hostedCheckout`, `transparentCheckout`, `reopenPayment`, meios aceitos e política de tarifa. Asaas mantém seu comportamento; MP 1:1 declara multi-party falso. O orquestrador seleciona pelo provider **da venda**, fornece uma decisão financeira pronta e chama finalização comum após validação.

## 14. Modelo OAuth por empresa

1. Admin autenticado inicia autorização para `company_id` ao qual tem permissão e ambiente explícito.
2. Backend cria transação OAuth curta com nonce/state de uso único, PKCE se suportado/aplicável, redirect URI exata, expiração e vínculo a usuário/empresa/ambiente.
3. Browser recebe apenas URL/state opaco; nenhum token.
4. Callback server-side valida state, expiração, uso único, usuário/tenant e code verifier antes da troca do code.
5. Backend valida na API a identidade da conta conectada, impede associação acidental/indevida e persiste tokens criptografados/cofre, external user id, scopes e expiração.
6. Refresh ocorre somente server-side, com lock/rotação para impedir corrida. Falha marca `refresh_required`/`revoked` e gera auditoria.
7. Revogação remove capacidade de novas cobranças, mas preserva metadados/auditoria e consulta de vendas antigas conforme permitido.
8. Reconexão cria nova versão da integração; tentativas antigas continuam apontando para a identidade usada.

Estados sugeridos: `pending_authorization`, `connected`, `degraded`, `refresh_required`, `revoked`, `disconnected`. Checkout bloqueia **nova** cobrança MP se não `connected/healthy`, sem fazer fallback Asaas. Sandbox e produção têm autorizações e callback/configurações independentes.

## 15. Análise do Mercado Pago 1:1

Sob as premissas fornecidas, a cobrança é criada com token OAuth da empresa vendedora. O valor principal líquido da comissão permanece com a vendedora; `application_fee` (checkout transparente) ou `marketplace_fee` (hospedado) direciona uma única taxa à conta marketplace SmartBus.

Exemplo conceitual: taxa oficial total R$ 12,00. O adaptador recebe `FinancialDecision.totalFee = 12,00` e envia esse valor como comissão, sem recalculá-lo. Porém o gateway só enxerga “vendedor + marketplace”. Se a decisão interna for R$ 4,00 SmartBus, R$ 4,00 sócio e R$ 4,00 representante, os R$ 12,00 chegam ao SmartBus; isso **não** é o split oficial liquidado. A confidencialidade pode ser preservada no checkout, mas a obrigação continua em aberto.

Assim, cenários A, B e C não são reproduzíveis nativamente no 1:1. Cenário D é compatível, desde que tarifas, reembolsos e chargeback confirmem que a comissão se comporta como esperado. Cobranças separadas são excluídas.

## 16. Análise condicionada do Mercado Pago 1:N

Nada abaixo deve ser assumido disponível. Confirmação precisa ser escrita, aplicável ao Brasil, ao produto de checkout escolhido e aos ambientes.

| Informação a confirmar | Classe |
|---|---|
| Quantidade máxima de recebedores e limites por transação | **Bloqueante** |
| Vendedor, SmartBus, sócio global e representante na mesma transação | **Bloqueante** |
| Valores fixos em centavos e regra de arredondamento/resíduo | **Bloqueante** |
| Recebedor opcional sem invalidar a cobrança | **Bloqueante** |
| Sócio global participar de vendas de empresas distintas | **Bloqueante** |
| OAuth exigido para vendedor e para cada recebedor | **Bloqueante** |
| KYC/status necessários de cada participante e fail-open permitido | **Bloqueante** |
| Meios de pagamento e checkouts compatíveis | **Bloqueante** |
| Responsável por tarifas e ordem tarifa versus split | **Bloqueante** |
| Reembolso total e reversão proporcional de cada parcela | **Bloqueante** |
| Reembolso parcial e alocação/arredondamento | **Bloqueante** |
| Chargeback, responsável financeiro e recuperação por participante | **Bloqueante** |
| Participante sem saldo no estorno/chargeback | **Bloqueante** |
| Ambiente de testes com múltiplos recebedores e contas controladas | **Bloqueante** |
| Webhooks, assinatura, IDs, ordenação e retries | Importante |
| Relatórios por recebedor e exportação | Importante |
| API/arquivos de conciliação e detalhamento de tarifas | Importante |
| Volume mínimo/elegibilidade comercial | **Bloqueante** |
| Contrato, países/entidades e responsabilidade regulatória | **Bloqueante** |
| SLA de pagamentos, suporte e incidentes | Importante |
| Custos de integração, processamento, saque e estorno | Importante |
| Rate limits, retenção e paginação | Complementar |
| Versionamento/depreciação e janela de migração | Complementar |

## 17. Análise do plano alternativo de repasses internos

Fluxo conceitual: vendedor recebe principal; SmartBus recebe taxa total 1:1; decisão oficial cria créditos internos de sócio/representante; depois um processo aprovado liquida esses créditos.

Isso requer ledger imutável/de dupla entrada, saldo pendente/disponível/bloqueado/pago, janela de retenção compatível com chargeback, conciliação do recebimento antes da disponibilidade, lotes e itens de repasse idempotentes, comprovantes, reprocessamento e segregação por ambiente/moeda/provider. Reembolso ou chargeback cria reversão correlacionada; se já pago, gera saldo negativo/dívida, bloqueio e fluxo de cobrança, nunca edição destrutiva do lançamento original.

Conta inválida deve reter o crédito sem bloquear a venda da empresa. São necessários auditoria, segregação de funções, aprovação financeira em dois níveis, documentos fiscais/contábeis, tratamento tributário, termos contratuais, política de reservas e análise regulatória. A plataforma assume riscos de caixa e recuperação quando beneficiário não tem saldo.

**Classificação:** plano alternativo de **alto risco**, não recomendado como padrão e proibido sem aprovação formal jurídica, contábil e financeira.

## 18. Riscos de estorno e chargeback

O webhook reconhece estados/eventos Asaas de refund/chargeback/reversão e o verify identifica reversões financeiras, mas a finalização positiva é mais madura que o pós-pagamento. O schema de comissão tem estados pendente/disponível/bloqueada/paga, porém não evidencia um subledger completo de reversão e dívida.

Lacunas críticas com dois providers:

- cancelamento de venda não equivale automaticamente a refund externo;
- política de refund parcial e de itens/passagens não está abstraída;
- ticket emitido antes de evento tardio precisa ser invalidado/bloqueado de forma auditável;
- pagamento aprovado sem ticket é reconciliável, mas ticket após reversão deve ser impedido;
- comissão já registrada/liquidada exige lançamento reverso, não simples update/delete;
- chargeback fora de ordem, duplicado ou posterior a repasse exige reserva/dívida;
- tarifas não reembolsáveis e diferenças de datas/valores precisam de conciliação;
- cada provider tem status e responsabilidade distintos, que uma enumeração genérica não deve ocultar.

Antes do piloto com dinheiro real, deve existir matriz evento → estado da venda/ticket/comissão, incluindo reembolso total/parcial e chargeback.

## 19. Estratégia de conciliação

Conciliação deve ser por provider + ambiente + external payment id + external reference + company id, comparando valor, moeda, status, tarifa, comissão marketplace e participantes. Webhook converge primeiro; job/ação manual consulta o provider congelado e chama a mesma normalização/finalização.

Resultados: `matched`, `pending_provider`, `amount_mismatch`, `tenant_mismatch`, `environment_mismatch`, `missing_internal`, `missing_external`, `fee_mismatch`, `split_mismatch`, `reversal_pending`. Divergências financeiras são fail-closed para emissão/liquidação e geram log estruturado, sem trocar provider. Relatórios devem separar sandbox/produção e manter status bruto/evidência para auditoria.

## 20. Prevenção de duplicidade e timeouts

- Gerar/persistir `external_reference` e idempotency key antes do POST quando necessário.
- Unique lógico por venda + tentativa/provider/ambiente; proteger concorrência com claim/estado `creating`.
- Enviar header de idempotência suportado e registrar versão do adaptador.
- Em timeout, marcar resultado ambíguo e consultar MP por idempotency key/referência; não repetir POST cegamente.
- O comportamento Asaas atual de consultar `externalReference` após resposta ambígua é reutilizável como padrão, não como API.
- Se MP falhar/expirar, nunca invocar Asaas automaticamente. Nova tentativa só no mesmo provider ou por ação explícita que cancele/encerre a anterior e crie nova venda/tentativa segundo regra aprovada.
- Webhook dedup por evento e finalização idempotente são defesas independentes e ambas necessárias.

Pontos protegidos: submissão e cleanup em `Checkout.tsx`; bloco de cobrança existente/lookup em `create-asaas-payment`; dispatch futuro; polling de `Confirmation.tsx`; botões de convergência em `Sales.tsx`; handlers webhook e constraints de pagamentos/eventos.

## 21. Matriz dos quatro cenários financeiros

| Cenário | Decisão oficial da taxa | Asaas atual | MP público 1:1 | MP 1:N | Repasse interno após 1:1 |
|---|---|---|---|---|---|
| A: sócio+representante | 1/3, 1/3, 1/3 | **Suportado** por split de wallets, sujeito à saúde/configuração | **Não suportado nativamente**; só SmartBus recebe comissão total | Potencialmente, condicionado a 4 participantes/contas | Exigido para sócio e representante |
| B: sócio apenas | 1/2 SmartBus, 1/2 sócio | **Suportado** | **Não suportado nativamente** | Potencialmente, condicionado | Exigido para sócio |
| C: representante apenas | 2/3 SmartBus, 1/3 representante | **Suportado** | **Não suportado nativamente** | Potencialmente, condicionado | Exigido para representante |
| D: nenhum | 100% SmartBus | **Suportado** | **Suportado conceitualmente** pela comissão única | Potencialmente/supérfluo | Não exigido |

“Suportado Asaas” descreve a arquitetura/código atual e depende de credenciais/wallets e comportamento real do gateway. “Potencialmente 1:N” não é aprovação nem funcionalidade disponível.

## 22. Proposta de prova de conceito

### Escopo fechado

1. Aplicação MP de teste e uma empresa controlada por feature flag.
2. OAuth sandbox com state, expiração, PKCE quando aplicável, cofre server-side e reconexão.
3. Uma rota experimental isolada que recebe `FinancialDecision` do motor existente.
4. Criação 1:1 com `application_fee` ou `marketplace_fee`, external reference e idempotência.
5. Webhook assinado/deduplicado e consulta fallback, ambos normalizados sem duplicar finalização.
6. Casos aprovado, pendente e recusado; timeout antes/depois da criação.
7. Reembolso controlado e verificação de efeitos na comissão/tarifas.
8. Relatório de conciliação de valor, comissão, tarifa, empresa e ambiente.
9. Repetição de toda a matriz técnica em sandbox; produção permanece desabilitada.

### Critério de saída

Evidência reproduzível de OAuth, criação única, correlação, assinatura, status, refund e conciliação; zero ticket duplicado; zero cruzamento tenant/ambiente; confirmação documentada de que 1:1 não liquida A/B/C.

### Fora do escopo

Não substituir Asaas, não liberar geral, não mudar divisão, não pagar ledger interno, não fazer fallback entre gateways e não chamar a POC de pronta para produção.

## 23. Plano incremental de implantação

| Fase | Objetivo | Dependências | Risco | Aceite | Áreas prováveis |
|---|---|---|---|---|---|
| 1. Auditoria/arquitetura | Aprovar contratos e invariantes | Revisão deste documento | Baixo | decisão assinada e gaps aceitos | docs, financeiro, pagamentos |
| 2. Confirmação MP 1:N | Resolver bloqueios comerciais | MP/contrato/documentação | Crítico | respostas formais da seção 16 | jurídico/financeiro/arquitetura |
| 3. Abstração mínima | Separar núcleo/adaptador sem mudar Asaas | testes de caracterização | Alto | suíte Asaas sem regressão; capabilities explícitas | `_shared`, edge payments |
| 4. Configuração por empresa | Provider/ambiente e freeze | schema/RLS aprovados | Crítico | isolamento tenant/ambiente comprovado | migrations futuras, Company |
| 5. OAuth | Conectar conta MP com segurança | app MP, cofre, callbacks | Crítico | state/rotação/revogação/sem token no cliente | novas edges privadas, wizard |
| 6. POC 1:1 | Validar API ponta a ponta | fases 3–5, feature flag | Alto | critérios da seção 22 | adapter MP, checkout piloto |
| 7. Webhook/conciliação | Convergência operacional | assinatura e contas teste | Crítico | retries/dedup/mismatch/reembolso aprovados | webhook, logs, diagnóstico |
| 8. Decisão 1:N/ledger | Escolher liquidação A/B/C | comercial ou aprovações internas | Crítico | decisão formal e controles financiados | financeiro/jurídico/DB |
| 9. Piloto flag | Uma empresa controlada | runbook, suporte, rollback | Alto | métricas/SLA/zero mistura | feature flags, UI e relatórios |
| 10. Expansão por empresa | Opt-in gradual | piloto estável | Alto | checklist por tenant/ambiente | onboarding/operação |

## 24. Riscos classificados por criticidade

### Críticos

- liberar 1:1 como equivalente aos quatro splits;
- escolher provider pela configuração atual em vez da venda congelada;
- exposição/mistura de tokens OAuth ou sandbox/produção;
- dois POSTs após timeout ou fallback automático MP → Asaas;
- finalizar por evento sem validar tenant, ambiente, valor e assinatura;
- pagar comissão/repasse e depois não conseguir recuperar refund/chargeback;
- recalcular snapshot com elegibilidade atual em vez da decisão histórica.

### Altos

- campos `asaas_*` receberem dados MP;
- duplicar motor financeiro no adaptador;
- ledger registrar obrigação sem processo de liquidação/reserva;
- status genérico esconder diferenças de reembolso/chargeback;
- UI expor divisão confidencial ou identificadores sensíveis;
- remover cleanup/tentativa ambígua antes de correlacionar cobrança externa.

### Médios/baixos

- relatórios e textos permanecerem Asaas;
- falta de capabilities causar botões inválidos;
- métricas sem dimensão provider/version;
- documentação operacional e treinamento incompletos.

## 25. Dúvidas bloqueantes

1. O Mercado Pago Brasil oferecerá 1:N contratualmente ao SmartBus e com quais checkouts?
2. O 1:N aceita os quatro participantes e beneficiários opcionais sem bloquear a venda?
3. Como refunds, chargebacks, tarifas e saldo insuficiente revertem cada parcela?
4. A regra oficial exige liquidação direta a sócio/representante para todas as empresas, ou cenário D pode ser habilitado isoladamente?
5. Existe autorização jurídica/contábil para SmartBus custodiar obrigações e fazer repasses? Hoje deve-se assumir **não**.
6. Qual fonte externa comprova taxa/comissão/tarifa para conciliação e qual SLA?
7. Qual política de cancelamento/reembolso parcial por passagem deve comandar tickets e ledger?
8. Tokens serão mantidos em Vault/serviço de secrets com rotação e auditoria compatíveis?

## 26. Informações a obter com o Mercado Pago

Obter respostas formais para toda a seção 16 e, adicionalmente: documentação/API exata por checkout; headers de idempotência e janela de retenção; busca por external reference/idempotency key; formato/algoritmo de assinatura; política de retries/ordem; escopos OAuth, refresh, rotação, revogação e PKCE; separação de credenciais teste/produção; rate limits; estados finais/intermediários; moeda; disponibilidade da comissão em cada método; relatórios de tarifa/comissão; retenção de dados; suporte a múltiplas aplicações/redirect URIs; certificação/homologação e contato de incidente.

## 27. Recomendação final

**GO condicionado** para as fases 1–7 e somente POC 1:1 controlada. **NO-GO para rollout de produção com promessa de equivalência financeira** enquanto 1:N não estiver formalmente confirmado. Se 1:N for negado, a decisão deve ser entre: manter somente Asaas; permitir MP apenas onde o cenário D seja comprovadamente aplicável; ou iniciar projeto separado de repasse interno após aprovações jurídica, contábil e financeira. Não há base para fallback automático nem para cobranças independentes.

## 28. Lista exata de arquivos/áreas para uma futura implementação

Esta lista é o conjunto mínimo previsível no estado atual; nomes de novos arquivos dependem da arquitetura aprovada e **não são criados agora**.

### Arquivos existentes a alterar

- `supabase/functions/_shared/payment-context-resolver.ts`
- `supabase/functions/_shared/payment-finalization.ts`
- `supabase/functions/_shared/payment-observability.ts`
- `supabase/functions/_shared/runtime-env.ts`
- `supabase/functions/_shared/split-recipients-resolver.ts`
- `supabase/functions/create-asaas-payment/index.ts` (somente adaptação à fronteira, sem mudar comportamento)
- `supabase/functions/asaas-webhook/index.ts` (somente envelope/finalização comum)
- `supabase/functions/verify-payment-status/index.ts`
- `supabase/functions/reconcile-sale-payment/index.ts`
- `src/pages/public/Checkout.tsx`
- `src/pages/public/Confirmation.tsx`
- `src/pages/admin/Company.tsx`
- `src/pages/admin/Events.tsx`
- `src/pages/admin/Sales.tsx`
- `src/pages/admin/SalesDiagnostic.tsx`
- `src/pages/admin/SalesReport.tsx`
- `src/pages/admin/CompanyActivationReport.tsx`
- `src/pages/admin/Representative.tsx`
- `src/pages/admin/SociosSplit.tsx`
- `src/pages/admin/ServiceSales.tsx`
- `src/components/admin/NewSaleModal.tsx`
- `src/integrations/supabase/types.ts` (regenerado após schema aprovado)

### Novas áreas inevitáveis, nomes a aprovar

- contrato/registry de providers e adapters Asaas/MP em `supabase/functions/_shared/`;
- edges server-side para OAuth start/callback/refresh/revoke, criação/consulta/reembolso MP e webhook MP;
- UI OAuth/estado MP seguindo os componentes administrativos existentes;
- migrations futuras para integrações, tentativas/eventos e campos congelados; RLS/policies/constraints/índices correspondentes;
- testes unitários/contrato/integração dos adapters e isolamento.

`platform-fee-engine.ts` deve ser **reutilizado e protegido por testes**, não alterado salvo correção formal da regra. `create-platform-fee-checkout` não deve virar atalho MP.

## 29. Testes manuais recomendados

1. OAuth autorizado, state inválido/expirado/reutilizado, callback em tenant errado, revogação e reconexão.
2. Sandbox e produção com contas diferentes; tentativa cruzada deve falhar antes da API.
3. Duas empresas simultâneas; nenhum token, pagamento, webhook ou log cruza tenant.
4. Cobranças aprovado/pendente/recusado e retorno hospedado sem confiar na URL.
5. Timeout antes e depois da criação; retry reutiliza o mesmo pagamento e jamais chama Asaas.
6. Webhook válido, assinatura inválida, duplicado, atrasado, fora de ordem, ID desconhecido e valor divergente.
7. Consulta fallback com webhook ausente; webhook posterior permanece idempotente.
8. Venda paga sem ticket e reconciliação; reexecução não duplica tickets/comissão.
9. Reembolso total e parcial; chargeback antes/depois de ticket e comissão.
10. Cenários A–D, preços nos limites 100/300/600, mínimo R$ 5, teto R$ 25 e centavos residuais.
11. Sócio global sem conta no ambiente (sem qualquer filtro de vínculo/status), e representante sem conta, com vínculo de outra empresa ou conta revogada; a venda permanece possível conforme a regra de redirecionamento.
12. Diagnóstico por perfil: admin da empresa vê saúde, developer vê detalhe autorizado, comprador não vê split/token.
13. Vendas Asaas antigas continuam consultáveis/reabríveis/finalizáveis após ativar provider layer.

## 30. Testes automatizados recomendados

- unitários do motor para faixas, bordas, teto individual, mínimo total, arredondamento e A–D;
- teste de contrato garantindo que adapters recebem `FinancialDecision` e não importam/reimplementam fórmula;
- capabilities e `unsupported` para MP 1:1 multi-split/refund parcial conforme homologação;
- adapter Asaas golden tests para impedir regressão de payload/status;
- adapter MP golden tests de payload 1:1, idempotência, status bruto e tarifas;
- OAuth: state/nonce/PKCE, expiração, replay, tenant binding, refresh concorrente, rotação e revogação;
- RLS: matriz anon/admin/gerente/developer e tentativa de leitura/escrita cross-company/cross-environment;
- webhook: assinatura, dedup `(provider, env, event)`, ordem, replay e correlação/valor/company mismatch;
- concorrência: duas criações da mesma venda produzem um pagamento; timeout+retry não duplica;
- integração: webhook e verify chamam a mesma finalização e produzem snapshot/ledger equivalentes;
- reversões: refund/chargeback criam transições e lançamentos reversos idempotentes;
- reconciliação: todos os estados de divergência e separação provider/ambiente;
- regressão de UI: gate por provider saudável, confirmação, reabrir condicionado a capability e sigilo;
- compatibilidade de vendas Asaas legadas sem `payment_provider` explícito, mediante regra de backfill/leitura aprovada.

---

### Checklist de respeito ao escopo

- [x] Nenhuma implementação, migration, RLS, Edge Function, componente, secret ou fluxo existente foi alterado.
- [x] Asaas permanece o provider oficial e funcional.
- [x] O motor financeiro não foi duplicado nem reinterpretado.
- [x] MP 1:N foi tratado como hipótese condicionada, não disponibilidade.
- [x] MP 1:1 não foi apresentado como split multipartes.
- [x] Repasse interno foi classificado como alternativa de alto risco.
- [x] Isolamento por `company_id`, provider e ambiente foi tratado como invariante.
