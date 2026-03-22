# Objetivo

Implementar a correção mínima e segura do fluxo `link_existing` do Asaas para persistir corretamente o `account_id` no ambiente operacional ativo, sem alterar a semântica atual de status (`connected` continua exigindo `account_id`).

# Causa raiz confirmada

- O vínculo por API Key já persistia corretamente `api_key`, `wallet_id` e `onboarding_complete`.
- O `account_id` ficava nulo porque a edge function aceitava apenas `accountData.id` como fonte desse identificador.
- No cenário real analisado, o payload válido do Asaas podia entregar o identificador em estrutura equivalente já disponível no fluxo atual, mas não no caminho rígido anteriormente usado.

# Arquivos alterados

- `supabase/functions/create-asaas-account/index.ts`
- `src/components/admin/AsaasDiagnosticPanel.tsx`
- `analise-3-correcao-account-id-asaas.md`

# Estratégia usada para resolver o `account_id`

1. Criado um extrator tolerante e conservador para `account_id`.
2. Ordem aplicada:
   - primeiro `id`/aliases do payload principal de `/myAccount`;
   - depois estruturas semânticas já retornadas no mesmo payload (`account`, `owner`, `data`, `items`);
   - por último, se necessário, reutilização do item já consultado em `/accounts` dentro do fallback existente do fluxo.
3. O código também registra a **fonte usada** para resolver o `account_id`, tanto no log sanitizado quanto na resposta técnica do vínculo/revalidate.

# Origem final do `accountId` persistido

O `account_id` persistido passa a vir de uma destas fontes já existentes no fluxo atual:

- `payload.id` de `/myAccount`;
- `payload.account.id` ou `payload.owner.id` de `/myAccount`;
- `payload.data.accountId` / `payload.items[0].accountId` quando presentes;
- fallback `platform_accounts_fallback:*` a partir do primeiro item retornado por `/accounts`, endpoint que o fluxo já chamava para complementar a identificação da conta.

# Testes executados

- `git diff --check`
- `npm run build`

# Resultado observado

- O backend agora devolve `account_id` e `account_id_source` no vínculo e na revalidação quando conseguir resolver esse identificador.
- Com `account_id` persistido no ambiente correto, o snapshot local pode naturalmente deixar de cair em `partially_configured` e passar a `connected`, sem maquiar a UI.
- O painel developer continua sanitizado e agora mostra também o `Account ID` no snapshot e a origem usada na resposta técnica.

# Riscos remanescentes

- Se o Asaas não devolver nenhum identificador de conta nem em `/myAccount` nem no item já obtido por `/accounts`, o `account_id` continuará ausente.
- O build local valida tipagem/integração do frontend, mas não substitui uma validação manual real com API Key sandbox no ambiente publicado.
