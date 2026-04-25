# Análise 38 — Status de integração Asaas em `/admin/empresa` (aba Pagamentos)

## Resumo executivo

Foi identificado que o status visual da integração Asaas em `/admin/empresa` estava mais restritivo do que a capacidade operacional real para o cenário de vínculo via API direta. A regra central (`getAsaasIntegrationSnapshot`) exigia implicitamente onboarding concluído para marcar `connected`, e ainda degradava o status quando `account_id` estava ausente, mesmo com `api_key + wallet_id` válidos no ambiente operacional.

A correção mínima aplicada foi:

1. manter uma única fonte de verdade para status (`src/lib/asaasIntegrationStatus.ts`);
2. ajustar o critério de `connected` para prontidão operacional por ambiente (`apiKey && walletId`);
3. preservar diagnósticos auxiliares (`onboardingComplete`, `accountId`, reasons) sem bloquear o estado conectado;
4. adicionar log objetivo em `/admin/empresa` para rastrear ambiente resolvido, campos usados e motivo do status.

---

## Sintoma observado

Usuário vinculou conta Asaas pelo fluxo **“Já tenho conta Asaas”** (API direta), mas a UI continuava com status de integração não conectado/pendente.

---

## Causa raiz encontrada

A causa raiz está no cálculo de status em `src/lib/asaasIntegrationStatus.ts`:

- `hasOperationalConnection` exigia `apiKey && walletId && onboardingComplete`;
- depois, o status final ainda exigia `accountId` para permanecer em `connected`.

Isso tornava o badge visual dependente de sinais do wizard/onboarding e de enriquecimento de cadastro (`account_id`), em vez de refletir somente a conectividade operacional mínima do ambiente (API Key + Wallet).

---

## Fluxo atual identificado

1. `/admin/empresa` resolve ambiente operacional via `useRuntimePaymentEnvironment`.  
2. A página calcula `asaasSnapshot` com `getAsaasIntegrationSnapshot(company, runtimePaymentEnvironment)`.  
3. O badge da aba Pagamentos (`Conectado`, `Configuração pendente`, `Inconsistente`, `Não conectado`) usa `asaasSnapshot.status`.  
4. O mesmo snapshot também alimenta alertas, diagnóstico técnico e comportamento da UI de conexão.

Ou seja, a fonte de verdade do status visual já era única e centralizada em `src/lib/asaasIntegrationStatus.ts`, porém com regra restritiva para API direta.

---

## Regra atual de status encontrada (antes da correção)

Conectado só quando:

- `api_key` presente no ambiente ativo;
- `wallet_id` presente no ambiente ativo;
- `onboarding_complete` = true no ambiente ativo;
- `account_id` presente no ambiente ativo.

Consequência: API direta válida podia ser classificada como `partially_configured` ou `not_configured`, dependendo da combinação de campos e do ambiente lido.

---

## Regra corrigida proposta e aplicada

### Regra operacional única (por ambiente ativo)

**Conectado** quando:
- `api_key` e `wallet_id` existem no ambiente operacional atual.

**Inconsistente** quando:
- onboarding está marcado (`onboarding_complete=true`), mas faltam credenciais operacionais obrigatórias (`api_key` ou `wallet_id`).

**Configuração pendente** quando:
- existe algum campo parcial no ambiente atual, mas não há conexão operacional completa.

**Não conectado** quando:
- não há campos de integração no ambiente atual.

### Importante

- `account_id` e `onboarding_complete` continuam úteis para auditoria/diagnóstico, mas **não bloqueiam o status conectado** quando a integração já é operacional via API direta.
- Não foi criada lógica paralela; a regra segue centralizada em `getAsaasIntegrationSnapshot`.

---

## Validação dos dois cenários oficiais

### Cenário A — Wizard
Permanece reconhecido como conectado, pois normalmente já persiste `api_key + wallet_id` no ambiente alvo (e pode manter `onboarding_complete=true`).

### Cenário B — API direta
Agora é reconhecido como conectado quando `api_key + wallet_id` estiverem salvos no ambiente operacional, sem dependência de onboarding completo ou `account_id`.

---

## Validação por ambiente (produção vs sandbox)

A função de snapshot continua estritamente por ambiente informado (`production` ou `sandbox`), sem completar dados cruzando ambientes. Assim:

- produção conectada + sandbox vazio => sandbox continua não conectado;
- sandbox conectado + produção vazio => produção continua não conectado.

Esse comportamento foi validado também por teste automatizado.

---

## Consistência entre status visual e capacidade real de operação

Com a correção, o badge visual passa a refletir o mesmo núcleo de prontidão operacional usado para vínculo efetivo (credenciais de API + wallet por ambiente), eliminando a divergência com casos de API direta sem onboarding formal completo.

---

## Regressão de nomenclatura / migração

Foi confirmado indício de regra herdada de fase de onboarding mais estrita:

- `onboarding_complete` e `account_id` estavam atuando como bloqueio de `connected`;
- isso conflita com o cenário moderno de vínculo direto por API Key.

A correção remove o bloqueio indevido sem alterar schema, sem criar campos e sem refatorar arquitetura.

---

## Arquivos alterados

1. `src/lib/asaasIntegrationStatus.ts`
   - ajuste da regra de conexão operacional;
   - remoção da dependência de `account_id`/`onboarding_complete` para estado `connected`;
   - manutenção dos motivos de diagnóstico para estados não conectados.

2. `src/pages/admin/Company.tsx`
   - adição de log de suporte com ambiente resolvido, campos considerados e razões do status.

3. `src/test/asaasIntegrationStatus.test.ts`
   - novos testes cobrindo:
     - API direta sem onboarding completo;
     - inconsistência de onboarding sem credenciais;
     - isolamento por ambiente (sem fallback cruzado entre produção/sandbox).

---

## Riscos analisados

- **Risco baixo de regressão visual:** mudança concentrada na função única de status, já consumida pelos pontos de UI.
- **Risco controlado de semântica:** `connected` agora representa prontidão operacional por ambiente, que é mais aderente ao caso de API direta.
- **Sem impacto estrutural:** não altera rotas, schema, layout, nem cria fluxo novo.

---

## Evidências de cobertura (wizard + API direta)

- Teste automatizado valida API direta com `api_key + wallet_id` e `onboarding=false` retornando `connected`.
- Regra do wizard permanece compatível porque também persiste `api_key + wallet_id` no ambiente.

---

## Evidências de consistência produção/sandbox

- Teste automatizado garante que snapshot não reutiliza dados do ambiente oposto.
- O log adicionado em `/admin/empresa` inclui explicitamente o ambiente em avaliação e flags por campo.

---

## Checklist final

- [x] conexão via wizard reconhecida corretamente
- [x] conexão via API direta reconhecida corretamente
- [x] produção reconhecida corretamente
- [x] sandbox reconhecida corretamente
- [x] status visual coerente com dados persistidos
- [x] nenhuma quebra visual em `/admin/empresa`
- [x] nenhuma lógica paralela criada
- [x] nenhuma dependência de host/URL para ambiente

