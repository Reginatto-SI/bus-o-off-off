# Ambiente de pagamento Asaas: causa raiz e correção

## Causa raiz (confirmada)

O ambiente **não vem da empresa** — vem do **hostname**.

- `supabase/functions/_shared/runtime-env.ts` tem uma allowlist com apenas dois hosts de produção: `smartbusbr.com.br` e `www.smartbusbr.com.br`. Qualquer outro host cai em `sandbox`.
- O domínio oficial em uso, `smartbus.com.br` / `www.smartbus.com.br`, **não está na lista** → tudo que passa por ele é resolvido como Sandbox.
- O badge do header (`AdminHeader.tsx` → `useRuntimePaymentEnvironment`) e a aba Pagamentos (`src/pages/admin/Company.tsx`) usam exatamente essa mesma resolução por host (via edge `get-runtime-payment-environment`).

Não é apenas visual. Verificações no banco:

- Todas as empresas reais (7 FEST, Andréia, BUSÃO OFF OFF, JD Viagens, etc.) têm credenciais **somente de produção**; nenhuma tem chave/wallet de sandbox. Apenas "Empresa Padrão (Teste)" é sandbox.
- Nos últimos 30 dias há **2 vendas gravadas como `sandbox`** (a mais recente em 04/08/2026), contra 82 em produção — ou seja, o checkout pelo domínio `smartbus.com.br` está criando cobranças no ambiente errado.
- Não existe hoje nenhuma coluna de ambiente em `companies`: não há fonte de verdade por empresa.

## Correção proposta

Criar a fonte única de verdade que hoje não existe: o ambiente passa a ser **atributo da empresa**, e o host deixa de decidir.

### 1. Banco (migration mínima)
- Adicionar `companies.payment_environment text not null default 'production'` com `check (payment_environment in ('production','sandbox'))`.
- Backfill determinístico pelos dados atuais: empresa com credencial de sandbox e sem credencial de produção → `sandbox`; todas as demais → `production`. Nenhuma empresa configurada muda de ambiente na prática.

### 2. Frontend
- `useRuntimePaymentEnvironment` passa a ler o ambiente da **empresa ativa** (contexto de empresa), sem chamada ao edge por host e sem fallback por hostname.
- Ao trocar de empresa, o hook reemite o ambiente da nova empresa (chave de query por `company_id`), sem estado residual.
- Enquanto não resolvido: estado "carregando"; se ausente/inválido: erro claro ("ambiente de pagamento não configurado para esta empresa"), sem assumir sandbox.
- Badge do header, badge/campos/status/ações da aba Pagamentos e o checkout público (que resolve pela empresa do evento) passam a consumir esse mesmo valor.

### 3. Backend (edge functions)
- `payment-context-resolver`: ordem passa a ser `sale.payment_environment` → `company.payment_environment` → ambiente explícito da requisição; **remover o fallback por host**. Sem nenhuma dessas fontes → erro `payment_environment_unresolved` (comportamento de erro já existente).
- `check-asaas-integration` e `create-asaas-account`: usar o ambiente da empresa em vez de `resolveEnvironmentFromHost`.
- `get-runtime-payment-environment` deixa de ser usada pelo frontend (mantida ou removida conforme uso residual).
- `resolveEnvironmentFromHost` fica sem consumidores no caminho de pagamento.

Credenciais continuam lidas só no backend; logs continuam registrando `company_id` + ambiente, nunca chaves.

## Fora de escopo
Split, comissões, webhook, confirmação de pagamento e demais telas permanecem inalterados. As 2 vendas sandbox já criadas não serão reprocessadas (posso avaliar depois, se quiser).

## Validação
- Empresa de produção (7 FEST) em `smartbus.com.br`: badge "Produção", verificação de integração batendo em `api.asaas.com`.
- "Empresa Padrão (Teste)": badge "Sandbox", chamadas em `sandbox.asaas.com`.
- Troca de empresa nos dois sentidos: badge, status e dados atualizam imediatamente.
- Empresa sem credencial no ambiente configurado: mensagem clara de configuração pendente, sem trocar de ambiente silenciosamente.
