# Step 3 de 5 — Saneamento do modelo de dados e configuração por ambiente (Asaas)

## 1. Resumo executivo

Neste Step 3, o foco foi estrutural: preparar o contrato de dados para configuração Asaas por ambiente, sem ativar ainda o sandbox espelho.

### O que foi saneado
- Modelo de configuração da empresa evoluído para suportar **sandbox e produção** de forma explícita.
- `partners` preparado para wallet por ambiente (futuro split espelho).
- Onboarding Asaas preparado para receber ambiente-alvo sem quebrar fluxo atual.
- Resolvedor do Step 2 adaptado para ler configuração por ambiente com fallback legado.

### O que foi criado/alterado
- Migração SQL adicionando campos por ambiente em `companies` e `partners`.
- Ajustes no `create-asaas-account` para gravar/revalidar por ambiente.
- Ajustes no resolvedor central para leitura por ambiente com compatibilidade.
- Ajustes em `create-asaas-payment` / `verify-payment-status` / `asaas-webhook` para consumir o novo contrato sem mudar regra financeira atual.
- Ajuste mínimo na UI do wizard Asaas para selecionar ambiente-alvo (opcional, padrão automático por host).

### O que ficou preparado
- Credenciais, wallet/account e onboarding por ambiente.
- Parceiro com wallet por ambiente para futura política de split por ambiente.
- Base pronta para Step 4 ativar sandbox espelho sem espalhar regra.

### O que ainda não foi ativado
- Sandbox espelho da produção.
- Owner da cobrança em sandbox = company.
- Split ativo em sandbox.
- Remoção de fallback legado.

---

## 2. Diagnóstico do modelo antigo

Principais ambiguidades do modelo anterior:
1. `companies` possuía campos Asaas únicos (genéricos), sem distinção forte por ambiente.
2. Onboarding e revalidação atualizavam um conjunto único de dados, dificultando separar estado sandbox vs produção.
3. `partners` não tinha wallet explícita por ambiente, limitando evolução para split espelhado.
4. Resolvedor central já existia (Step 2), mas ainda dependia de contrato de dados parcialmente legado.

Conclusão: o modelo era funcional para regra atual, mas insuficiente para o Step 4 com previsibilidade.

---

## 3. Modelo-alvo adotado neste step

### Abordagem escolhida: **Opção A (expandir `companies`)**

Foi escolhida expansão de `companies` (ao invés de tabela filha) por quatro razões pragmáticas:
1. Menor risco de regressão no momento (sem troca estrutural de joins em funções críticas).
2. Migração incremental com fallback legado simples.
3. Menor custo de ajuste no admin atual.
4. Compatibilidade direta com resolvedor central já implementado no Step 2.

---

## 4. Estrutura nova por ambiente

## 4.1 `companies` (novos campos)
- Produção:
  - `asaas_api_key_production`
  - `asaas_wallet_id_production`
  - `asaas_account_id_production`
  - `asaas_account_email_production`
  - `asaas_onboarding_complete_production`
- Sandbox:
  - `asaas_api_key_sandbox`
  - `asaas_wallet_id_sandbox`
  - `asaas_account_id_sandbox`
  - `asaas_account_email_sandbox`
  - `asaas_onboarding_complete_sandbox`

### Backfill aplicado
- Os campos legados atuais foram copiados para os campos de produção quando presentes, para manter continuidade operacional.

## 4.2 `partners` (preparo para split futuro)
- `asaas_wallet_id_production`
- `asaas_wallet_id_sandbox`

### Backfill aplicado
- `asaas_wallet_id` legado foi copiado para `asaas_wallet_id_production` quando existente.

---

## 5. Impacto no resolvedor do Step 2

O resolvedor central foi ajustado para:
- ler configuração por ambiente em `companies`;
- usar fallback legado quando campo novo estiver ausente;
- expor no contexto:
  - `companyApiKeyByEnvironment`
  - `companyWalletByEnvironment`
  - `companyAccountIdByEnvironment`
  - `companyAccountEmailByEnvironment`
  - `companyOnboardingCompleteByEnvironment`

Compatibilidade foi mantida:
- verify continua com fallback legado de credencial em produção;
- regras de owner/split atuais permanecem idênticas.

---

## 6. Ajustes em `partners`

### O que foi encontrado
- Modelo preparado para wallet legado único.
- Necessidade de preparar destino de split por ambiente para o Step 4.

### O que foi corrigido/preparado
- Inclusão de wallets por ambiente em `partners`.
- Helpers adicionados para resolver wallet do parceiro por ambiente com fallback legado.
- Sem alterar regra atual de split (sandbox continua sem split).

---

## 7. Ajustes em onboarding/admin

## 7.1 Backend onboarding (`create-asaas-account`)
- Suporte a `target_environment` opcional.
- Quando informado: grava/revalida configuração no ambiente-alvo.
- Quando não informado: mantém comportamento atual por host.
- Sempre mantém campos legados para compatibilidade neste momento.

## 7.2 UI/admin (ajuste mínimo)
- Wizard de onboarding Asaas recebeu seletor opcional de ambiente-alvo:
  - automático por host (padrão)
  - sandbox
  - produção

Sem redesign amplo, apenas ajuste mínimo para tornar o novo contrato operável.

---

## 8. Comportamentos legados mantidos propositalmente

1. Verify em produção com fallback legado de credencial.
2. Sandbox ainda com comportamento financeiro atual (owner/split não alterados).
3. Split segue ativo apenas em produção.
4. Webhook dual-token fallback permanece quando ambiente é desconhecido.

---

## 9. Ponte para o Step 4

Com este Step 3, já está pronto para ativação segura do sandbox espelho:
- estrutura de credenciais/wallet/account/onboarding por ambiente pronta;
- resolvedor central já lê os campos novos;
- parceiro já suporta wallet por ambiente;
- UI/admin já consegue apontar onboarding para ambiente-alvo.

O que ainda faltará no Step 4:
- virar comportamento do sandbox para owner company (espelho);
- ativar split em sandbox com destinos corretos;
- endurecer validações de configuração por ambiente no checkout.

Riscos já reduzidos neste step:
- mistura de estados sandbox/produção em um único conjunto de campos;
- necessidade de “malabarismo” por fallback estrutural;
- acoplamento implícito entre onboarding e execução financeira futura.
