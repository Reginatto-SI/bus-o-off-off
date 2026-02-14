

# Correcao: Acesso ao Painel Stripe para Contas de Teste

## Problema Identificado

A edge function `create-connect-account` verifica na API do Stripe se `account.details_submitted && account.charges_enabled` para decidir se retorna o link do painel ou o link de onboarding. Em contas de teste Express, o Stripe frequentemente nao ativa `charges_enabled`, entao o sistema sempre retorna o link de onboarding -- mesmo com `stripe_onboarding_complete: true` no banco.

## Solucao

Ajustar a logica da edge function para considerar tambem o flag do banco de dados (`stripe_onboarding_complete`) ao decidir se deve gerar o link do painel. Alem disso, tratar o caso em que `createLoginLink` pode falhar (contas Express de teste nem sempre suportam login links) e fornecer um fallback adequado.

## Alteracoes

### 1. Edge Function `create-connect-account/index.ts`

Alterar a condicao que decide entre painel e onboarding:

**Logica atual:**
```text
if (account.details_submitted && account.charges_enabled) -> dashboard
else -> onboarding
```

**Nova logica:**
```text
if (account.details_submitted || company.stripe_onboarding_complete) {
  tentar gerar loginLink
  se falhar -> gerar accountLink de onboarding como fallback
} else {
  gerar accountLink de onboarding
}
```

Isso garante que:
- Contas de teste com onboarding completo consigam acessar o painel
- Se o `createLoginLink` falhar (comum em test mode), o sistema nao quebra e oferece um fallback
- O flag `stripe_onboarding_complete` no banco tambem e atualizado caso o Stripe confirme que `details_submitted` e `charges_enabled` estao ambos true

### 2. Nenhuma alteracao no frontend

O frontend ja trata corretamente os dois cenarios (`already_complete` com `dashboard_url` vs `onboarding_url`), entao nenhuma mudanca e necessaria na tela de Empresa.

## Resumo dos Arquivos

| Arquivo | Acao |
|---------|------|
| `supabase/functions/create-connect-account/index.ts` | Editar |

