# Diagnóstico técnico — separação Sandbox x Produção (Asaas)

## 1) Diagnóstico atual

### 1.1 Onde a lógica de ambiente está hoje

A integração com Asaas **não usa hostname do frontend** (`window.location`, `lovable.dev`, domínio oficial) para escolher ambiente. A decisão ocorre **somente dentro das Edge Functions**, através da variável de ambiente `ASAAS_ENV`:

```ts
const IS_SANDBOX = Deno.env.get("ASAAS_ENV") !== "production";
```

Esse padrão está repetido nas funções:
- `create-asaas-payment`
- `create-asaas-account`
- `verify-payment-status`
- `create-platform-fee-checkout`
- `asaas-webhook` (mesma regra, com `isSandbox` local)

Com isso, o sistema escolhe endpoint e secrets de forma global por deployment da função (não por URL do usuário).

### 1.2 Como o frontend identifica ambiente hoje

No frontend, não há helper central de ambiente para pagamento/Asaas. A configuração do cliente Supabase usa apenas:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Não foi encontrada regra explícita tipo:
- `lovable.dev => sandbox`
- `www.smartbusbr.com.br => produção`

Ou seja, o frontend chama sempre as mesmas Edge Functions do projeto Supabase configurado no build atual.

### 1.3 Como as Edge Functions identificam ambiente hoje

A identificação atual é por variável de ambiente do runtime da função:
- `ASAAS_ENV !== "production"` => sandbox
- `ASAAS_ENV === "production"` => produção

Endpoints usados:
- Sandbox: `https://sandbox.asaas.com/api/v3`
- Produção: `https://api.asaas.com/v3`

Secrets selecionados por ambiente (quando implementado):
- Plataforma: `ASAAS_API_KEY_SANDBOX` ou `ASAAS_API_KEY`
- Wallet da plataforma: `ASAAS_WALLET_ID_SANDBOX` ou `ASAAS_WALLET_ID`
- Webhook token: `ASAAS_WEBHOOK_TOKEN_SANDBOX` ou `ASAAS_WEBHOOK_TOKEN`

### 1.4 Como credenciais são escolhidas

#### Fluxo principal de cobrança (`create-asaas-payment`)
- A função escolhe ambiente via `ASAAS_ENV`.
- Ela exige `company.asaas_api_key` para criar cobrança da passagem (token da conta da empresa).
- Mesmo assim, usa chave da plataforma (`ASAAS_API_KEY*`) para descobrir wallet da plataforma quando necessário em split.

#### Fluxo de verificação (`verify-payment-status`)
- Primeiro tenta `company.asaas_api_key`.
- Se ausente, faz fallback para chave global da plataforma (`ASAAS_API_KEY*`).
- Esse fallback é explícito no código e logado como warning.

#### Fluxo webhook (`asaas-webhook`)
- Valida token por ambiente (`ASAAS_WEBHOOK_TOKEN*`) com base em `ASAAS_ENV`.

### 1.5 Relação atual entre URL/host e ambiente

Hoje, no código analisado:
- **Não existe** regra de roteamento de ambiente por hostname para Asaas.
- `localhost`, `lovable.dev`, preview e domínio oficial **não participam** da decisão de sandbox/produção.
- A escolha é 100% determinada pelo valor de `ASAAS_ENV` no deployment das Edge Functions.

---

## 2) Fluxo real encontrado (ponta a ponta)

### 2.1 Compra pública com Asaas (passagens)
1. Usuário finaliza checkout em `src/pages/public/Checkout.tsx`.
2. Frontend cria registro em `sales` com `status = 'pendente_pagamento'`.
3. Frontend chama `supabase.functions.invoke('create-asaas-payment', { sale_id, payment_method })`.
4. Edge function `create-asaas-payment`:
   - carrega venda + empresa
   - valida onboarding Asaas da empresa
   - escolhe ambiente por `ASAAS_ENV`
   - usa endpoint sandbox/prod correspondente
   - usa `company.asaas_api_key` para customer/payment
   - cria cobrança no Asaas (`/payments`)
   - salva `asaas_payment_id`/status na venda
   - retorna `invoiceUrl`
5. Frontend abre `invoiceUrl` em nova aba e redireciona para `/confirmacao/:saleId`.
6. Confirmação de pagamento ocorre via:
   - webhook `asaas-webhook` (principal)
   - e/ou polling on-demand `verify-payment-status`.

### 2.2 Verificação de status (`verify-payment-status`)
1. Frontend de confirmação/ticket lookup chama função com `sale_id`.
2. Função consulta venda/empresa.
3. Seleciona token (empresa ou fallback global da plataforma).
4. Consulta `/payments/:id` no Asaas do ambiente definido por `ASAAS_ENV`.
5. Se confirmado, atualiza `sales.status = 'pago'`, timestamps e gera tickets.

### 2.3 Taxa da plataforma (`create-platform-fee-checkout`)
1. Ação admin chama `create-platform-fee-checkout`.
2. Função escolhe ambiente por `ASAAS_ENV`.
3. Cria cobrança no Asaas usando chave global da plataforma do ambiente.

---

## 3) Problemas encontrados

### 3.1 Ausência de regra por domínio/hostname (lacuna principal)
Não existe mecanismo que faça:
- `lovable.dev/preview/localhost => sandbox`
- domínio oficial => produção

Portanto, se o deployment onde o app está apontando tiver `ASAAS_ENV=production`, **mesmo em URL de preview** haverá cobrança real.

### 3.2 Dependência única do ambiente do backend
A decisão é centralizada no backend (positivo), mas hoje está vinculada só ao secret `ASAAS_ENV` do projeto/deployment. Se preview e produção compartilham o mesmo backend/projeto Supabase, haverá mistura inevitável.

### 3.3 Fallback permissivo em `verify-payment-status`
Quando `company.asaas_api_key` não existe, a função tenta chave global da plataforma. Isso pode mascarar configuração incompleta e gerar comportamento inesperado entre contas/ambientes.

### 3.4 Falta de “fail-closed” para ambiente
A regra `ASAAS_ENV !== 'production'` implica sandbox por padrão (melhor que fallback para produção), mas ainda não há validação forte de valores válidos (`sandbox|production`) nem bloqueio explícito para configuração ambígua.

### 3.5 Possível divergência frontend x backend
Frontend não carrega conceito de ambiente de pagamento. Mesmo que UI esteja em `lovable.dev`, quem manda é o backend. Isso dificulta auditoria para o time e pode causar falsa percepção de “estou em dev, então está seguro”.

---

## 4) Proposta de correção mínima e segura

> Objetivo: menor mudança possível, centralizada e auditável, sem refatoração ampla.

### 4.1 Regra recomendada
- `localhost` + `*.lovable.dev` + hosts de preview homologados => **sandbox**
- domínio oficial de produção (`www.smartbusbr.com.br`, etc.) => **produção**
- host não mapeado => **bloquear operação financeira** (fail-closed), nunca assumir produção

### 4.2 Onde centralizar
Criar um helper compartilhado nas Edge Functions (ex.: `supabase/functions/_shared/runtime-env.ts`) com:
- parsing de `origin`/`referer` da request
- allowlist de hosts por ambiente via env vars (`PAYMENT_PROD_HOSTS`, `PAYMENT_SANDBOX_HOSTS`)
- função única `resolvePaymentEnvironment(req)` retornando `{ env, asaasBaseUrl, keyNames }`
- erro explícito para host desconhecido

### 4.3 Mudança mínima de código
Aplicar o helper apenas nas funções Asaas críticas:
- `create-asaas-payment`
- `verify-payment-status`
- `create-platform-fee-checkout`
- `create-asaas-account`
- `asaas-webhook` (neste caso, por token/URL dedicado por ambiente ou função separada)

### 4.4 Regras de segurança
- Remover fallback implícito para produção.
- Evitar fallback de credencial global em `verify-payment-status` (ou restringir com validação forte de contexto).
- Exigir variáveis de ambiente completas para ambos ambientes (sandbox/prod) e falhar com erro claro quando faltarem.

### 4.5 Observação arquitetural importante
A solução mais segura operacionalmente continua sendo **separar ambientes em projetos/deployments distintos** (Supabase + secrets independentes). Regra por hostname reduz risco, mas não substitui isolamento físico/lógico de ambientes.

---

## 5) Checklist de validação

1. **Validação de ambiente por host**
   - Acessar via `localhost` e `lovable.dev`.
   - Confirmar log estruturado nas funções indicando `env=sandbox`.
   - Verificar endpoint chamado: `sandbox.asaas.com`.

2. **Validação em domínio oficial**
   - Acessar via domínio oficial.
   - Confirmar `env=production`.
   - Verificar endpoint: `api.asaas.com`.

3. **Validação anti-mistura**
   - Em preview/dev, garantir que payment IDs e customers são criados apenas na conta sandbox.
   - Em produção, garantir ausência de tokens sandbox.

4. **Validação de falha segura**
   - Simular host não mapeado.
   - Esperado: função recusa cobrança (HTTP 4xx/5xx explícito), sem criar cobrança no Asaas.

5. **Webhook e verify coerentes**
   - Confirmar que webhook token e consulta de status usam o mesmo ambiente da cobrança criada.
   - Testar ciclo completo: criar cobrança, pagar, receber webhook, confirmar status e geração de ticket.

---

## 6) Conclusão objetiva

- **Hoje está correto?** Parcialmente. A seleção sandbox/produção existe, mas não está vinculada ao host da aplicação (lovable.dev vs domínio oficial).
- **Por que preview pode estar gerando cobrança real?** Porque a decisão atual depende de `ASAAS_ENV` no backend. Se esse runtime estiver em `production`, qualquer origem gera cobrança real.
- **Prioridade do ajuste:** **Alta** (risco financeiro direto).
- **Ajuste mínimo necessário:** centralizar resolução de ambiente por host permitido + fail-closed para host desconhecido + coerência entre todas as funções Asaas.
- **Risco atual para operação:** ambiente de teste/preview pode acionar credenciais/endpoints reais caso compartilhe backend configurado em produção.

---

## Respostas objetivas às 9 perguntas

1. **Como o sistema identifica hoje dev/prod?**
   - Pelo `ASAAS_ENV` nas Edge Functions.

2. **Existe regra explícita por hostname/URL?**
   - Não, para Asaas não existe.

3. **Existe separação real entre credenciais sandbox e produção?**
   - Sim, no código há nomes separados (`*_SANDBOX` e produção), mas o uso depende de `ASAAS_ENV` estar corretamente configurado no deployment.

4. **Qual credencial é usada no link Lovable?**
   - Não é definida pelo link. Será a credencial do ambiente resolvido por `ASAAS_ENV` da função ativa.

5. **Qual credencial é usada no domínio real?**
   - Mesma regra acima: depende de `ASAAS_ENV` do backend, não do domínio.

6. **Frontend e edge concordam sobre ambiente?**
   - Não existe contrato explícito compartilhado. Frontend não define ambiente de pagamento; edge decide sozinho.

7. **Existe fallback perigoso para produção?**
   - Não há fallback “na dúvida vai produção” na chave de ambiente; porém há fallback de credencial global em `verify-payment-status`, que é risco de comportamento inesperado.

8. **Hoje o comportamento está correto, incorreto ou incompleto?**
   - Incompleto e arriscado para o cenário solicitado (separar por URL de uso).

9. **Menor correção segura?**
   - Helper central de ambiente por host allowlist + fail-closed + aplicação uniforme nas funções Asaas.
