# Diagnóstico técnico — separação Sandbox vs Produção (Asaas)

## 1) Diagnóstico atual

### Onde a lógica de ambiente está hoje
A decisão de ambiente para Asaas **não acontece no frontend por URL/hostname**. Ela acontece nas edge functions usando `ASAAS_ENV`.

- `create-asaas-payment`: `IS_SANDBOX = Deno.env.get("ASAAS_ENV") !== "production"`.【F:supabase/functions/create-asaas-payment/index.ts†L10-L13】
- `verify-payment-status`: mesma regra por `ASAAS_ENV`.【F:supabase/functions/verify-payment-status/index.ts†L10-L13】
- `create-asaas-account`: mesma regra por `ASAAS_ENV`.【F:supabase/functions/create-asaas-account/index.ts†L10-L13】
- `create-platform-fee-checkout`: mesma regra por `ASAAS_ENV`.【F:supabase/functions/create-platform-fee-checkout/index.ts†L10-L13】
- `asaas-webhook`: mesma regra por `ASAAS_ENV` para token de webhook (`..._SANDBOX` vs produção).【F:supabase/functions/asaas-webhook/index.ts†L95-L97】

### Como o frontend identifica ambiente hoje
Para a integração de pagamento, o frontend **não decide sandbox/prod**; ele apenas chama edge functions.

- Checkout chama `create-asaas-payment` sem enviar qualquer contexto de ambiente/host.【F:src/pages/public/Checkout.tsx†L732-L737】
- Confirmação chama `verify-payment-status` sem contexto de ambiente/host.【F:src/pages/public/Confirmation.tsx†L181-L190】

No frontend, existe apenas configuração do projeto Supabase via Vite (`VITE_SUPABASE_URL` e key pública), sem regra por domínio para Asaas.【F:src/integrations/supabase/client.ts†L5-L12】

### Como as credenciais Asaas são escolhidas hoje
- A escolha de credenciais de **plataforma** nas edge functions depende de `ASAAS_ENV`:
  - sandbox: `ASAAS_API_KEY_SANDBOX`
  - produção: `ASAAS_API_KEY`.
  (ex.: em `create-asaas-payment`).【F:supabase/functions/create-asaas-payment/index.ts†L147-L150】
- Porém, a criação da cobrança principal usa prioritariamente a chave da empresa (`companies.asaas_api_key`).【F:supabase/functions/create-asaas-payment/index.ts†L155-L163】【F:supabase/functions/create-asaas-payment/index.ts†L416-L423】
- O schema atual da empresa possui **um único campo** `asaas_api_key` (sem separação explícita `sandbox/live`).【F:src/integrations/supabase/types.ts†L233-L242】
- No onboarding, a chave informada é persistida nesse campo único `asaas_api_key`.【F:supabase/functions/create-asaas-account/index.ts†L263-L273】

### Relação URL/host vs ambiente
Não foi encontrada regra explícita do tipo `lovable.dev => sandbox` ou `smartbusbr.com.br => produção` na integração Asaas. A decisão é por variável de runtime da edge function (`ASAAS_ENV`), não por hostname do usuário final.

## 2) Fluxo real encontrado (ponta a ponta)

1. Usuário finaliza checkout público.
2. Front cria `sale` com status `pendente_pagamento` e `sale_passengers`.
3. Front chama edge `create-asaas-payment` com `{ sale_id, payment_method }`.
4. Edge `create-asaas-payment`:
   - lê `ASAAS_ENV` para escolher base URL Asaas (`sandbox`/`api`).【F:supabase/functions/create-asaas-payment/index.ts†L10-L13】
   - valida empresa e onboarding Asaas, busca chave de plataforma por ambiente.【F:supabase/functions/create-asaas-payment/index.ts†L132-L150】
   - usa `company.asaas_api_key` para criar cliente/cobrança da venda.【F:supabase/functions/create-asaas-payment/index.ts†L155-L163】【F:supabase/functions/create-asaas-payment/index.ts†L311-L314】【F:supabase/functions/create-asaas-payment/index.ts†L416-L423】
   - salva `asaas_payment_id` / status na venda e retorna `invoiceUrl`.
5. Front abre `invoiceUrl` e vai para `/confirmacao/:saleId`.
6. Confirmação consulta periodicamente a venda e também chama `verify-payment-status`.
7. `verify-payment-status` usa novamente `ASAAS_ENV` para endpoint e usa `company.asaas_api_key` com fallback para chave global da plataforma quando ausente.【F:supabase/functions/verify-payment-status/index.ts†L10-L13】【F:supabase/functions/verify-payment-status/index.ts†L112-L125】
8. Webhook `asaas-webhook` processa eventos de pagamento e valida token por `ASAAS_ENV` (`ASAAS_WEBHOOK_TOKEN_SANDBOX` vs produção).【F:supabase/functions/asaas-webhook/index.ts†L95-L100】

## 3) Problemas encontrados

1. **Sem regra por hostname/domínio para ambiente Asaas**
   - Não existe mapeamento explícito `localhost/lovable.dev -> sandbox` e `domínio oficial -> produção`.
   - Resultado: abrir a aplicação em `lovable.dev` **não muda automaticamente** o ambiente Asaas.

2. **Fonte de verdade de ambiente está só no backend (ASAAS_ENV)**
   - Se `ASAAS_ENV=production` no projeto Supabase usado por esse frontend, tanto `lovable.dev` quanto domínio real vão usar produção.

3. **Uma única `asaas_api_key` por empresa**
   - Sem separação clara entre chave sandbox e produção por empresa no banco.【F:src/integrations/supabase/types.ts†L239-L242】
   - Risco de chave live estar vinculada e ser usada em cenários de preview/dev.

4. **Fallback perigoso em `verify-payment-status`**
   - Se empresa não tiver chave, função usa chave global da plataforma (`company?.asaas_api_key || PLATFORM_API_KEY`).【F:supabase/functions/verify-payment-status/index.ts†L112-L125】
   - Em produção, isso pode consultar pagamento na conta errada e mascarar erro de configuração.

5. **Supabase único no frontend atual**
   - `.env` aponta um único projeto Supabase (`cdrcyjrvurrphnceromd`).【F:.env†L1-L3】
   - Sem separação de projeto por ambiente, preview e produção podem compartilhar mesmas edge functions/secrets.

6. **Superfície de invocação ampla nas functions**
   - `verify_jwt=false` para as functions relevantes; não define ambiente, mas amplia risco operacional se combinado com má configuração de secrets/domínio.【F:supabase/config.toml†L12-L31】

## 4) Proposta de correção mínima e segura

### Objetivo
Garantir regra central:
- `localhost`, `*.lovable.dev`, previews -> **sandbox**
- domínio oficial (ex.: `www.smartbusbr.com.br`) -> **produção**

### Menor solução segura (sem refatoração grande)

1. **Centralizar decisão de ambiente no backend (edge functions)**
   - Criar helper único (`supabase/functions/_shared/runtime-env.ts`) com:
     - `APP_RUNTIME_MODE` obrigatório: `sandbox` | `production` (sem default para produção).
     - `PRODUCTION_ALLOWED_HOSTS` (lista explícita de hosts permitidos para live).
     - função `resolvePaymentEnvironment(req)` que:
       - lê `origin`/`x-forwarded-host`;
       - se host está na allowlist de produção e `APP_RUNTIME_MODE=production` => produção;
       - caso contrário => sandbox;
       - se configuração ausente/inválida => **falha fechada** (erro 500), nunca “na dúvida produção”.

2. **Aplicar helper nas functions Asaas**
   - `create-asaas-payment`, `verify-payment-status`, `create-asaas-account`, `create-platform-fee-checkout`, `asaas-webhook`.
   - Remover lógica duplicada `Deno.env.get("ASAAS_ENV") !== "production"` espalhada.

3. **Separar credenciais por ambiente também no nível de empresa (mínimo viável)**
   - Curto prazo: bloquear cobrança live quando `host` não for produção (mesmo que `companies.asaas_api_key` exista).
   - Próximo passo mínimo: adicionar `companies.asaas_api_key_sandbox` e `companies.asaas_api_key_live` + seleção pelo helper central.

4. **Eliminar fallback arriscado para chave global em verificação**
   - Em `verify-payment-status`, trocar fallback silencioso por erro explícito/configuração pendente (ou somente aceitar fallback em sandbox, nunca em produção).

5. **Auditoria e rastreabilidade**
   - Registrar no log de integração: `resolved_env`, `request_host`, `selected_base_url`, `selected_key_source` (company/platform; sandbox/live).

## 5) Checklist de validação

1. **`localhost` deve usar sandbox**
   - Criar venda teste em localhost e validar logs da function (`resolved_env=sandbox`) + endpoint `sandbox.asaas.com`.

2. **`lovable.dev`/preview deve usar sandbox**
   - Repetir teste no link preview e verificar mesmo comportamento de sandbox.

3. **Domínio oficial deve usar produção**
   - Repetir no domínio oficial e verificar `resolved_env=production` + endpoint `api.asaas.com`.

4. **Sem cobrança real em teste**
   - Em preview, confirmar que IDs/links gerados pertencem ao ambiente sandbox do Asaas.

5. **Consistência webhook/verify**
   - Garantir que webhook e `verify-payment-status` resolvem o mesmo ambiente da cobrança criada para aquela venda.

6. **Teste negativo crítico**
   - Remover variável obrigatória e confirmar “fail-closed” (erro explícito), sem fallback para produção.

## 6) Conclusão objetiva

- **Hoje está correto?**
  - **Incompleto e arriscado** para o requisito “host define sandbox/prod”.

- **Por que o Lovable pode estar cobrando como real?**
  - Porque o código não usa hostname para decidir ambiente; usa `ASAAS_ENV` da edge function. Se esse runtime estiver em produção (ou apontando para o mesmo stack), preview/Lovable também opera como produção.

- **O que precisa ajustar agora (prioridade alta)?**
  1. Centralizar decisão de ambiente em helper backend com regra explícita por host + modo runtime obrigatório.
  2. Remover fallback implícito para produção e fallback de chave global em produção.
  3. Garantir segregação de credenciais por ambiente (plataforma e empresa).

- **Risco atual para operação**
  - **Alto**: possibilidade real de cobrança live em contexto de teste/preview e inconsistência operacional entre expectativa de sandbox e execução efetiva.
