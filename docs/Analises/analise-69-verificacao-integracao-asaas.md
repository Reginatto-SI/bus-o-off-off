# Análise — Verificação de integração Asaas

## 1. Objetivo da análise
Investigar, com base no código atual, como funciona a verificação de integração Asaas na tela `/admin/empresa` (aba **Pagamentos**), qual endpoint é chamado de fato, como ambiente/credencial são resolvidos, e por que a mensagem de erro de conta não encontrada pode aparecer repetidamente.

## 2. Arquivos e pontos inspecionados
- `src/pages/admin/Company.tsx`
  - Aba `pagamentos` e botão **Verificar integração**.
  - Handler `handleRevalidateAsaasIntegration`.
  - Origem de `editingId` (empresa atual no formulário) e `runtimePaymentEnvironment`.
- `src/components/admin/AsaasDiagnosticPanel.tsx`
  - Handler `handleTestConnection` (developer) também chama a mesma verificação.
- `src/hooks/use-runtime-payment-environment.ts`
  - Estratégia de resolução de ambiente no frontend (build -> edge -> fallback hostname).
- `supabase/functions/check-asaas-integration/index.ts`
  - Edge function usada para verificação.
  - Endpoints Asaas de leitura chamados na prática.
  - Tratamento de status HTTP e mensagens de retorno.
- `supabase/functions/_shared/runtime-env.ts`
  - Função `getAsaasBaseUrl` com URLs reais usadas por ambiente.
- `src/lib/asaasIntegrationStatus.ts`
  - Snapshot local de status (configurado/conectado/inconsistente), por ambiente.
- `src/types/database.ts`
  - Campos de configuração Asaas por ambiente na tipagem `Company`.
- `supabase/migrations/20260815090000_add_asaas_environment_configuration.sql`
  - Evidência de modelagem de credenciais Asaas por ambiente (produção/sandbox).

## 3. Fluxo atual identificado
1. Usuário acessa `/admin/empresa`, aba **Pagamentos**, e clica em **Verificar integração**.
2. O botão chama `handleRevalidateAsaasIntegration` em `Company.tsx`.
3. O frontend valida se há:
   - `editingId` (empresa atual carregada no formulário),
   - `runtimePaymentEnvironment` (ambiente operacional resolvido no frontend).
4. O frontend chama `supabase.functions.invoke('check-asaas-integration')`, enviando:
   - `company_id: editingId`
   - `target_environment: runtimePaymentEnvironment`
5. A edge function `check-asaas-integration` valida auth/admin/permissão na empresa (`user_belongs_to_company`).
6. A edge lê da tabela `companies` **somente colunas do ambiente recebido** (`production` ou `sandbox`), incluindo API key/wallet/account/onboarding/pix.
7. Se faltarem credenciais mínimas (`api_key` e/ou `wallet_id`), retorna `integration_status = incomplete` sem chamar Asaas.
8. Se credenciais existirem, chama Asaas para health check principal em `GET /myAccount` com header `access_token`.
9. Depois, no caminho de diagnóstico operacional, chama também:
   - `GET /myAccount/status/`
   - `GET /wallets/`
   - `GET /pix/addressKeys?status=ACTIVE`
   - `GET /pix/addressKeys`
10. A função consolida resposta e devolve `status`/`integration_status`/`message`; o frontend mostra `toast.success`, `toast.warning` ou `toast.error` com base no payload.

## 4. Endpoint e estratégia usados hoje
- **Endpoint principal de verificação de conta:** `GET {baseUrl}/myAccount`
- **Método:** `GET`
- **Header:** `access_token: <api_key_da_empresa_no_ambiente>`
- **Base URL atual:**
  - produção: `https://api.asaas.com/v3`
  - sandbox: `https://sandbox.asaas.com/api/v3`
- **Como o ambiente é resolvido (fluxo atual):**
  - não vem de coluna `payment_environment` da empresa;
  - vem de `useRuntimePaymentEnvironment` (prioridade: `VITE_PAYMENT_ENVIRONMENT` -> edge `get-runtime-payment-environment` -> fallback por hostname).
- **Como a chave é resolvida:**
  - após receber `target_environment`, a edge escolhe colunas da empresa daquele ambiente (`asaas_api_key_production` ou `asaas_api_key_sandbox`).

## 5. Compatibilidade com a validação correta esperada
Referência esperada na tarefa:
- `GET /v3/myAccount/accountNumber`
- `GET /v3/myAccount/status`
- com `access_token` e base URL de ambiente correta.

Situação atual observada:
- O sistema **já faz validação real no gateway**, não é mock: chama `GET /myAccount` e complementa com `GET /myAccount/status/`.
- Portanto, há **compatibilidade parcial** com a referência (usa `status`, mas não usa `accountNumber`).
- Há divergência de URL sandbox em relação à referência informada na tarefa:
  - atual: `https://sandbox.asaas.com/api/v3`
  - referência esperada: `https://api-sandbox.asaas.com/v3`
- A decisão de ambiente da verificação manual não está vinculada diretamente a um campo da empresa; ela depende do ambiente operacional de runtime do app no frontend.

## 6. Diagnóstico principal
- **A validação existe e é real** (consulta Asaas de fato).
- **Está parcialmente correta**:
  - acerta em usar chamada real + `access_token` + credencial por ambiente;
  - mas usa endpoint principal `/myAccount` (não `/myAccount/accountNumber`) e URL de sandbox diferente da referência informada;
  - e o ambiente da verificação manual depende de resolução de runtime (build/host), não de uma configuração explícita da empresa.
- **Risco estrutural identificado:** possível desalinhamento de ambiente (empresa com credenciais preenchidas em um ambiente, UI verificando no outro).

## 7. Causa provável da mensagem de erro repetida
Mensagem-alvo: “Conta Asaas não encontrada durante a verificação da integração”.

No código atual, ela pode surgir por pelo menos dois caminhos:
1. **HTTP 404 no `GET /myAccount`** (gateway retornou not found).
2. `GET /myAccount` respondeu 200, mas o parser não conseguiu extrair `account_id` (`asaas_account_found = false`), gerando a mesma família de erro “conta não encontrada”.

Causa mais provável para repetição no uso diário:
- **ambiente/credencial divergentes do esperado para a empresa na tela** (ex.: consulta feita em sandbox com chave/conta esperada em produção, ou vice-versa), somado ao fato de o botão poder ser executado repetidas vezes sem mudança de contexto.

Observação adicional:
- Também existe caminho de erro repetitivo quando há incompatibilidade de payload/parsing de conta no `/myAccount`.
- Não há evidência de disparo automático em loop no frontend; a repetição tende a ser por reexecução manual da ação (botão principal ou card developer).

## 8. Riscos encontrados
- Resolução de ambiente da verificação manual depende de runtime/frontend (build/host/fallback), e não de uma configuração explícita de ambiente por empresa para este fluxo.
- Divergência entre URL sandbox usada no código e URL sandbox de referência da tarefa.
- Erro “conta não encontrada” agrega cenários diferentes (404 real vs falha de extração/parsing), o que pode reduzir precisão operacional do diagnóstico para suporte.
- Se empresa estiver sem configuração mínima no ambiente consultado, a UX pode parecer “erro recorrente” mesmo com dados corretos no outro ambiente.

## 9. Correção mínima sugerida
Sem refatorar arquitetura, a menor correção segura sugerida (após validação com equipe) é:
1. **Padronizar a checagem de conta para endpoint de referência** (preferencialmente incluir `GET /myAccount/accountNumber` como validação primária de existência da conta, mantendo `GET /myAccount/status` para estado operacional).
2. **Reduzir ambiguidade de erro**: distinguir explicitamente no payload/mensagem quando for:
   - `404` do gateway,
   - falha de parsing do payload `/myAccount`.
3. **Explicitar contexto de ambiente no retorno** (já existe parcialmente) e reforçar no toast para evitar leitura equivocada de produção vs sandbox.

## 10. Conclusão executiva
- O Smartbus BR **já possui** verificação real de integração Asaas na tela `/admin/empresa` -> **Pagamentos**.
- O endpoint principal atual é `GET /myAccount` (com `access_token`), complementado por `/myAccount/status/`, `/wallets/` e consultas Pix.
- A implementação está **funcional, porém parcialmente aderente** ao critério de referência (`accountNumber/status`) e com risco de ambiguidade de ambiente.
- A mensagem repetida de “conta não encontrada” é coerente com o código atual e tende a indicar, principalmente, **desalinhamento de ambiente/credencial** ou **falha de extração de conta no payload**.
- A menor melhoria segura é ajustar a checagem primária para o endpoint de referência e separar melhor as mensagens por causa técnica.
