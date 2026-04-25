# Step 2 de 5 — Fonte única de contexto de pagamento (resolvedor central)

## 1. Resumo do que foi feito

Neste Step 2 foi criada uma fonte única de contexto de pagamento para o fluxo Asaas, sem alterar o comportamento financeiro vigente.

### Centralizações realizadas
- Novo helper compartilhado: `supabase/functions/_shared/payment-context-resolver.ts`.
- Centralização das decisões de:
  - ambiente (`sale` > `host` > fallback);
  - owner da cobrança (`platform` / `company`);
  - credencial efetiva (incluindo fallback legado do verify);
  - base URL;
  - política de split;
  - token/candidatos de token para webhook.

### Funções ajustadas para usar o resolvedor
- `create-asaas-payment`
- `verify-payment-status`
- `asaas-webhook`
- `create-platform-fee-checkout`

---

## 2. Estrutura do resolvedor

## 2.1 Interface principal
O resolvedor expõe:
- `resolvePaymentContext(params)`
- `isWebhookTokenValidForContext(req, context)`

### Entradas relevantes (`resolvePaymentContext`)
- `mode`: `create | verify | webhook | platform_fee`
- `sale` (opcional)
- `company` (opcional)
- `request` (opcional)
- `allowLegacyVerifyFallback` (opcional, usado no verify)
- `isPlatformFeeFlow` (opcional)

### Saída consolidada
```ts
{
  environment,
  ownerType,
  baseUrl,
  apiKeySource,
  apiKey,
  webhookToken,
  webhookTokenCandidates,
  splitPolicy,
  decisionTrace,
  platformWalletSecretName
}
```

## 2.2 Responsabilidades e decisões
- **Ambiente**: usa `sale.payment_environment` quando disponível; sem `sale`, usa host; sem ambos, fallback.
- **Owner**: mantém regra atual (`production -> company`, `sandbox -> platform`, e `platform_fee -> platform`).
- **Credencial**:
  - sandbox: plataforma;
  - produção: empresa;
  - verify em produção: mantém fallback legado empresa -> plataforma.
- **Split**:
  - produção: habilitado (como hoje);
  - sandbox: desabilitado (como hoje);
  - platform_fee: sem split.
- **Webhook token**:
  - ambiente conhecido: token único do ambiente;
  - ambiente desconhecido: candidatos de ambos ambientes (fallback atual).

---

## 3. Antes vs Depois (arquitetura)

## Antes
- Decisões espalhadas em múltiplas funções.
- Regras duplicadas para ambiente, credencial e base URL.
- Token de webhook e fallback avaliados localmente em cada função.

## Depois
- Decisão centralizada em `payment-context-resolver.ts`.
- Funções passam a consumir `paymentContext` para ambiente, owner, credencial, base URL e split.
- Validação de token do webhook passa a usar contexto centralizado (`isWebhookTokenValidForContext`).

---

## 4. Pontos legados (mantidos propositalmente)

1. **Fallback de credencial no verify (produção)**
- Mantido por compatibilidade (`allowLegacyVerifyFallback: true`).

2. **Sandbox diferente de produção no owner/split**
- Mantido sem alteração de comportamento financeiro.

3. **Webhook dual-token quando ambiente não é conhecido**
- Mantido via `webhookTokenCandidates` no resolvedor.

---

## 5. Ganhos obtidos

- Redução de ambiguidade operacional (uma única origem de decisão).
- Redução de duplicação de regras críticas.
- Logs mais coerentes: todas as funções passam a logar `decisionTrace` e campos do `paymentContext`.
- Menor risco de drift comportamental entre funções.

---

## 6. Preparação para o Step 3

Com o resolvedor central pronto, o Step 3 fica simplificado para:
- evoluir credenciais por ambiente sem espalhar alterações nas funções;
- preparar sandbox espelho alterando regras em um único ponto;
- remover fallback legado de verify de forma controlada e segura.

Em resumo: Step 2 centralizou decisão sem quebrar compatibilidade e sem antecipar mudanças de regra de negócio.
