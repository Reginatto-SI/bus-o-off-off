# Relatório de investigação — botão "Verificar integração" (Asaas)

## 1. Resumo executivo
- Foi investigado o fluxo completo do botão **"Verificar integração"** na tela `/admin/empresa`, do front-end até a edge function `create-asaas-account`.
- A causa real identificada foi: **a validação dependia exclusivamente de `companies.asaas_api_key` para chamar `/myAccount`**, e quando a empresa tinha integração funcional por `wallet_id/account_id` (sem chave persistida localmente), a validação falhava com erro genérico de API key.
- Foi aplicada uma correção mínima e segura:
  1. no backend, a revalidação agora aceita dois modos (API key da empresa **ou** fallback por `asaas_account_id` com token da plataforma);
  2. no front-end, a mensagem do toast passou a exibir a causa real retornada pela edge function, em vez de sempre acusar API key inválida.

## 2. Fluxo atual mapeado
1. **Botão no front**: em `src/pages/admin/Company.tsx`, o botão "Verificar integração" chama `handleRevalidateAsaasIntegration`.
2. **Função chamada**: `handleRevalidateAsaasIntegration` invoca `supabase.functions.invoke('create-asaas-account', { mode: 'revalidate' })`.
3. **Edge function/endpoint**: em `supabase/functions/create-asaas-account/index.ts`, o bloco `if (mode === 'revalidate')` executa a verificação.
4. **Chamada ao Asaas**:
   - antes: somente `GET /myAccount` com `companies.asaas_api_key`;
   - depois da correção: `GET /myAccount` (quando existe `asaas_api_key`) **ou** `GET /accounts/{asaas_account_id}` com token da plataforma (quando não existe `asaas_api_key`, mas existe `asaas_account_id`).
5. **Retorno e tratamento de erro**:
   - antes: front mostrava sempre mensagem genérica de API key inválida;
   - depois: front exibe a mensagem específica retornada pela edge function (com HTTP status quando disponível).

## 3. Evidências técnicas
- Arquivos investigados:
  - `src/pages/admin/Company.tsx` (handler do botão e tratamento de erro).
  - `supabase/functions/create-asaas-account/index.ts` (modo `revalidate` e integração Asaas).
  - `supabase/functions/create-asaas-payment/index.ts` (referência de uso operacional atual da integração por `asaas_api_key`/wallet).
- Funções envolvidas:
  - `handleRevalidateAsaasIntegration`.
  - bloco `mode === "revalidate"` na edge function.
- Campos usados na validação:
  - `asaas_api_key`, `asaas_wallet_id`, `asaas_account_id`, `asaas_onboarding_complete`.
- Endpoint(s) Asaas:
  - `/myAccount` e `/accounts/{id}`.
- Resposta/erro observados no código:
  - qualquer falha de revalidação tendia a virar mensagem genérica de API key inválida, mascarando erro real (auth, conta não encontrada, ausência de credencial adequada etc.).

## 4. Causa raiz
A revalidação implementava uma regra única: **sem `asaas_api_key` local, falha imediata**. Isso criava falso negativo para empresas com integração considerada conectada por outros identificadores persistidos (`asaas_wallet_id`/`asaas_account_id`) e/ou cenários em que a integração permanece operacional mas a API key não está disponível no formato esperado pelo botão.

Além disso, o front-end suprimia detalhes do erro e mostrava sempre: "Verifique se a API Key cadastrada ainda é válida", reforçando diagnóstico incorreto para o usuário.

## 5. Correção aplicada
### Arquivos alterados
- `supabase/functions/create-asaas-account/index.ts`
- `src/pages/admin/Company.tsx`

### Ajustes realizados
1. **Backend (revalidate) com fallback seguro e mínimo**
   - adicionada leitura de `asaas_account_id` no select da empresa;
   - adicionada decisão de modo de validação:
     - modo A: `asaas_api_key` -> `GET /myAccount`;
     - modo B: sem `asaas_api_key` e com `asaas_account_id` -> `GET /accounts/{id}` com API key da plataforma;
   - normalização de `walletId` (`accountData.walletId ?? accountData.wallet?.id`);
   - mensagens de erro mais fiéis por status (`401/403`, `404`, demais);
   - logs objetivos de diagnóstico com mascaramento de dados sensíveis (`[ASAAS][VERIFY] ...`).

2. **Front-end (toast) com causa real**
   - `handleRevalidateAsaasIntegration` passou a usar `extractAsaasErrorMessage` também na revalidação;
   - toast agora exibe mensagem específica da edge function, evitando falso diagnóstico de API key inválida.

## 6. Resultado esperado
- **Integração válida**:
  - botão confirma com sucesso (`Integração verificada com sucesso`), atualizando campos de espelho da conta.
- **Integração inválida real**:
  - mensagem informa causa mais precisa (ex.: autenticação falhou, conta não encontrada).
- **Erro operacional temporário**:
  - mensagem indica indisponibilidade momentânea para nova tentativa, sem acusar API key inválida indevidamente.

## 7. Ambiguidades registradas
- Não foi executada chamada real à API do Asaas neste ambiente para reproduzir respostas externas em runtime; a conclusão foi feita por análise de fluxo/contrato do código atual.
- Caso exista variação específica de payload de `/accounts/{id}` por tipo de conta, o fallback já prevê extração `wallet.id` além de `walletId`, minimizando risco sem alterar arquitetura.
