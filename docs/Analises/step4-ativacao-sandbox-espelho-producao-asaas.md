# Step 4 — Ativação do sandbox em espelho de produção (Asaas)

## Objetivo
Ativar no fluxo principal de vendas o mesmo contrato operacional de owner/split em **sandbox** e **produção**, mantendo exceções legadas só onde explicitamente permitido.

## O que foi ativado
- `payment-context-resolver` passou a definir owner `company` para fluxo principal (`create`, `verify`, `webhook`) em ambos os ambientes.
- `splitPolicy` do fluxo principal foi habilitada em ambos os ambientes (`platform_and_partner`).
- `verify-payment-status` mantém fallback legado de credencial somente para verificação retrocompatível.
- `asaas-webhook` preserva modo dual-token quando o ambiente não pode ser determinado pela venda.
- `create-asaas-payment` passou a montar split no sandbox seguindo a mesma política da produção.
- `AsaasOnboardingWizard` mantém seleção explícita de ambiente e corrige import dos componentes `Select`.

## Critérios de prontidão por ambiente
Para o fluxo principal funcionar sem fallback implícito, cada empresa precisa de configuração por ambiente:
- API key de empresa no ambiente (`asaas_api_key_sandbox`/`asaas_api_key_production`, com suporte legado aos campos antigos).
- Wallet e onboarding completo no ambiente correspondente.

## Validação sugerida
1. Criar venda sandbox e confirmar criação da cobrança com owner da empresa.
2. Verificar split para plataforma e parceiro em sandbox.
3. Confirmar webhook sandbox com token do ambiente.
4. Repetir o ciclo em produção e comparar paridade de comportamento.
