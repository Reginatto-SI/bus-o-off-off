# Relatório — Etapa 2: Origem do Ambiente (Sandbox vs Produção)

## 1. Resumo executivo

A Etapa 2 removeu o uso primário de host encaminhado até a Edge Function como fonte de decisão do `payment_environment` no fluxo Asaas.

Agora, o ambiente nasce de forma explícita no próprio checkout público, é persistido já na criação da venda e o `create-asaas-payment` só aceita seguir quando recebe esse ambiente explícito ou quando a venda já está travada por uma cobrança Asaas existente.

Com isso:

- o ambiente deixa de nascer na Edge Function a partir de headers frágeis;
- o `payment_environment` passa a ser definido no fluxo antes da cobrança;
- a venda passa a carregar o ambiente desde o nascimento do fluxo público;
- `create-asaas-payment`, `verify-payment-status` e `asaas-webhook` passam a convergir no mesmo valor persistido.

## 2. Problemas identificados na origem do ambiente

1. `create-asaas-payment` dependia de host/origin/referer para o primeiro create.
2. `sales.payment_environment` só era reutilizado quando já existia `asaas_payment_id`.
3. O default `sandbox` no banco podia mascarar a ausência de decisão real.
4. O sistema conseguia “seguir corretamente um ambiente nascido errado”.

## 3. O que foi alterado

### 3.1 Checkout público passa a explicitar o ambiente

O checkout agora resolve o ambiente pelo origin real carregado no browser — com prioridade para `VITE_PAYMENT_ENVIRONMENT`, quando existir — e grava esse valor explicitamente em `sales.payment_environment` antes da cobrança.

### 3.2 `create-asaas-payment` deixa de decidir por host na primeira cobrança

A Edge Function agora recebe `payment_environment` explícito no payload e usa esse valor como fonte oficial do primeiro create.

### 3.3 Venda travada continua sendo fonte de verdade

Se a venda já tiver `asaas_payment_id`, o ambiente persistido nela continua prevalecendo. Se o request trouxer ambiente diferente, o fluxo falha explicitamente com mismatch.

### 3.4 Resolver central passa a aceitar ambiente explícito

O `payment-context-resolver` agora distingue origem por `sale`, `request` e `host`, priorizando `sale`, depois `request`, e deixando `host` apenas como fallback opt-in/legado.

## 4. Nova lógica de decisão do ambiente

Ordem atual:

1. **Venda já vinculada ao Asaas (`sale.payment_environment` + `asaas_payment_id`)** → usar `sale`.
2. **Primeira criação de cobrança** → usar `payment_environment` explícito vindo do fluxo.
3. **Host** → não é mais fonte primária do fluxo de cobrança; permanece apenas como compatibilidade/fallback opt-in em utilitários legados.

## 5. Como o ambiente nasce agora (fluxo completo)

1. Usuário abre o checkout público.
2. O frontend resolve o ambiente pelo `window.location.origin` ou por `VITE_PAYMENT_ENVIRONMENT`.
3. A venda já é inserida em `sales` com `payment_environment` explícito.
4. O frontend chama `create-asaas-payment` enviando também `payment_environment`.
5. O backend usa esse valor explícito na primeira cobrança e persiste/normaliza o nascimento oficial do ambiente.
6. Após criar a cobrança, a venda segue com `asaas_payment_id` + `payment_environment` como vínculo travado.
7. `verify-payment-status` e `asaas-webhook` continuam lendo somente a venda.

## 6. Como o ambiente é reutilizado

- `create-asaas-payment`: reutiliza o ambiente da venda quando ela já está vinculada ao Asaas.
- `verify-payment-status`: continua usando apenas `sales.payment_environment`.
- `asaas-webhook`: continua resolvendo apenas pelo `payment_environment` da venda.

## 7. Impacto das mudanças

- Menos ambiguidade no nascimento do ambiente.
- Menor dependência de headers frágeis na Edge Function.
- Persistência mais confiável do `payment_environment` desde o início do checkout.
- Maior simetria entre create, verify e webhook.

## 8. Arquivos alterados

- `src/hooks/use-runtime-payment-environment.ts`
- `src/pages/public/Checkout.tsx`
- `supabase/functions/_shared/runtime-env.ts`
- `supabase/functions/_shared/payment-context-resolver.ts`
- `supabase/functions/create-asaas-payment/index.ts`

## 9. Decisões de implementação

1. **Não remover o default do banco nesta etapa**
   - o default `sandbox` foi mantido por compatibilidade com outros fluxos legados/admin;
   - porém o fluxo Asaas público deixou de depender dele como decisão oficial.

2. **Não confiar no host do backend para o primeiro create**
   - o ambiente agora precisa vir explicitamente do fluxo.

3. **Não permitir divergência silenciosa**
   - se uma venda já travada no Asaas receber request com ambiente diferente, o create falha explicitamente.

4. **Preservar o resolvedor central**
   - a mudança foi feita dentro do padrão já existente, sem criar nova arquitetura de pagamentos.

## 10. Riscos remanescentes

1. O browser ainda usa a origem carregada no app para resolver o ambiente quando `VITE_PAYMENT_ENVIRONMENT` não existe.
2. O default `sandbox` continua existindo no banco para compatibilidade, embora o fluxo Asaas não deva mais depender dele.
3. Utilitários legados que ainda consultem host continuam existindo fora do caminho principal da cobrança.

## 11. Pontos recomendados para Etapa 3

1. ampliar auditoria para diferenciar claramente “ambiente explícito do fluxo” vs “ambiente legado por host”;
2. registrar de forma mais visível o `request_payment_environment` e o estado de travamento da venda em painéis/diagnósticos;
3. revisar se vale adicionar metadado persistente de “fonte do ambiente” na venda para auditoria histórica.

## 12. Checklist final

- [x] O ambiente deixou de depender primariamente de host no create
- [x] O ambiente nasce explicitamente no checkout público
- [x] O valor persistido na venda passou a ser confiável para o fluxo Asaas
- [x] `create-asaas-payment`, `verify-payment-status` e `asaas-webhook` permanecem convergindo no mesmo ambiente
- [x] Nenhuma nova arquitetura foi criada
- [x] A mudança foi mínima e localizada
