# Análise arquitetural — simplificação do fluxo Asaas + plano de evolução em 5 etapas

## 1. Resumo executivo

### Diagnóstico da situação atual
O projeto já possui os blocos essenciais de um fluxo financeiro robusto (criação de cobrança, webhook, verificação on-demand, persistência de ambiente por venda, geração de tickets e trilha de logs de integração). Isso é um ponto muito positivo.

Ao mesmo tempo, a arquitetura atual está **mais complexa que o necessário** em três eixos:

1. **Ambiente x credencial x dono da cobrança estão parcialmente acoplados**: em alguns pontos a regra é explícita (sale.payment_environment), em outros ainda há fallback/heurística (ex.: fallback de API key em produção no verify).
2. **Onboarding da empresa e cobrança estão mais acoplados do que deveriam**: hoje falta um “contrato operacional” explícito de qual conta/credencial usar por ambiente para cada empresa.
3. **Convergência de status distribuída em 3 canais** (webhook, verify, polling frontend) com boa redundância, mas com duplicação de responsabilidades de atualização financeira/tickets.

### A arquitetura está excessivamente complexa?
**Sim, moderadamente.** Não por excesso de funcionalidades, e sim por regras de decisão espalhadas e algumas ambiguidades de modelo (especialmente no split/sócio por empresa e fallback de credencial).

### O que pode ser simplificado sem perder robustez
- Tornar explícito e unificado: **(a) ambiente da venda**, **(b) owner da cobrança**, **(c) credencial efetiva**, **(d) split policy**.
- Reduzir fallback implícito e “adivinhações” para erros explícitos e estados operacionais claros.
- Consolidar a máquina de estado do pagamento (webhook + verify) em regras idempotentes únicas.

---

## 2. Mapa da arquitetura atual

## 2.1 Ambiente
- O ambiente é decidido no `create-asaas-payment` por host da requisição (`smartbusbr.com.br`/`www` => production; demais => sandbox). 
- A decisão é persistida em `sales.payment_environment` e as demais funções passam a ler essa coluna. 
- `verify-payment-status` e `create-platform-fee-checkout` obedecem a venda e não recalculam por host.
- `asaas-webhook` tenta descobrir o ambiente pela venda para validar token do webhook.

## 2.2 Credencial
- `create-asaas-payment`:
  - **Sandbox**: usa API key da plataforma sandbox.
  - **Produção**: usa API key da empresa (`companies.asaas_api_key`).
- `verify-payment-status`:
  - Sandbox: plataforma sandbox.
  - Produção: empresa; se ausente, fallback para plataforma (legado).
- `create-platform-fee-checkout`: usa API key da plataforma do ambiente da venda.
- `create-asaas-account`: resolve ambiente por host e usa API key da plataforma daquele ambiente para criação de subconta/consulta de account.

## 2.3 Owner da cobrança
- Venda pública (`create-asaas-payment`):
  - Produção: cobrança em nome da empresa (key da empresa).
  - Sandbox: cobrança em nome da plataforma (key da plataforma sandbox).
- Taxa de plataforma em venda manual (`create-platform-fee-checkout`): cobrança sempre com credencial da plataforma (externalReference `platform_fee_<sale_id>`).

## 2.4 Split
- Em `create-asaas-payment`, split só é montado em produção.
- Split usa `companies.platform_fee_percent` e potencial parceiro ativo.
- Em sandbox não aplica split (regra atual).

## 2.5 Webhook
- Validação de token:
  - Se consegue inferir venda: valida token do ambiente da venda.
  - Se não consegue: aceita qualquer token (prod ou sandbox).
- Processa eventos suportados (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`).
- Fluxo separado para `platform_fee_<sale_id>`.
- Persiste rastreabilidade em `sale_integration_logs`.

## 2.6 Polling + verify + frontend
- `Confirmation.tsx` possui:
  - Botão manual de atualização (`verify-payment-status`).
  - Polling a cada 3s no banco.
  - Chamada periódica de `verify-payment-status` (~30s) como fallback de webhook, especialmente útil em sandbox.
- Quando status vira `pago`, frontend recarrega tickets e encerra polling.

## 2.7 Ticket e persistência
- Ticket nasce a partir de `sale_passengers` em webhook/verify quando pagamento confirma.
- Há idempotência (não recriar tickets se já existem).
- `seat_locks` é limpo ao confirmar/cancelar.
- Trilha operacional:
  - `sale_logs` (eventos funcionais da venda).
  - `sale_integration_logs` (payloads/respostas de integração).

## 2.8 Criação/vinculação de conta Asaas da empresa
- `create-asaas-account` possui 3 modos:
  - `create`: cria subconta via `/accounts` com API key da plataforma do ambiente.
  - `link_existing`: valida API key da empresa via `/myAccount`.
  - `revalidate`: revalida integração existente (`/myAccount` ou `/accounts/{id}` conforme dados disponíveis).
- Grava em `companies`: `asaas_wallet_id`, `asaas_account_id`, `asaas_account_email`, `asaas_api_key`, `asaas_onboarding_complete`.

## 2.9 Tabelas e campos centrais
- `companies`: dados de onboarding Asaas + regras de taxa (`platform_fee_percent`, `partner_split_percent`).
- `sales`: estado da venda/pagamento (`status`, `payment_environment`, `asaas_payment_id`, `asaas_payment_status`, `payment_confirmed_at`, bloco de taxa da plataforma).
- `sale_logs`: trilha funcional.
- `sale_integration_logs`: auditoria técnica de integração.
- `sale_passengers` -> `tickets`: staging para emissão.
- `seat_locks`: reserva temporária/limpeza pós decisão.
- `partners`: carteira de sócio/split (com possível inconsistência entre modelo e uso por empresa no código).

---

## 3. Complexidades desnecessárias encontradas

1. **Dependência de host como ponto primário de ambiente no start do fluxo**
   - Hoje funciona, mas host é sinal frágil para cenários de preview, proxy, whitelabel e chamadas server-to-server.
   - O ideal é host ser apenas fallback/diagnóstico, não regra de negócio principal.

2. **Regra de credencial espalhada e assimétrica entre funções**
   - `create-asaas-payment` é rígido (produção exige key da empresa), mas `verify-payment-status` aceita fallback para key da plataforma em produção.
   - Isso aumenta incerteza operacional e dificulta auditoria.

3. **Split dependente de modelagem potencialmente inconsistente de parceiro**
   - Fluxos filtram `partners` por `company_id`, mas o modelo base de `partners` nasceu “sem company_id”.
   - Mesmo que já exista evolução local, esse ponto precisa ser saneado como contrato único.

4. **Sandbox com lógica diferente demais de produção no owner/split**
   - Em sandbox a cobrança é da plataforma e sem split; em produção é da empresa com split.
   - Isso reduz fidelidade do sandbox como espelho funcional.

5. **Convergência de status distribuída com duplicação de cálculo financeiro**
   - Webhook e verify repetem lógica de snapshot financeiro/tickets/locks.
   - Maior custo de manutenção e risco de drift comportamental.

6. **Fallbacks silenciosos que mascaram erro de configuração**
   - Alguns caminhos convertem configuração incompleta em comportamento degradado sem bloquear claramente a operação.
   - Em finanças, erro explícito costuma ser mais seguro que fallback implícito.

---

## 4. Complexidades que devem permanecer

1. **Persistir ambiente na venda (`sales.payment_environment`)**
   - Essencial para consistência temporal e rastreabilidade (uma venda não pode “trocar” de ambiente depois de criada).

2. **Webhook + verify on-demand + polling frontend**
   - Redundância é necessária em pagamentos reais (webhook pode atrasar/falhar; usuário precisa revalidação manual).

3. **Idempotência na geração de ticket e limpeza de lock**
   - Fundamental para evitar dupla emissão e corrida de concorrência.

4. **Logs funcionais e logs de integração separados**
   - Excelente para operação/suporte/auditoria; não deve ser simplificado removendo visibilidade.

5. **Validação forte de onboarding antes de operar**
   - Fluxo financeiro exige dados mínimos válidos (documento, wallet, credencial, estado de integração).

---

## 5. Avaliação da filosofia “sandbox espelho da produção”

### Faz sentido?
**Sim, faz total sentido arquitetural e operacional**, especialmente para reduzir surpresa de go-live.

### Viabilidade no projeto
**Viável**, mas exige explicitar a configuração por ambiente no nível da empresa e remover dependência de “empresa só tem credencial de produção”.

### Prós
- Testes mais realistas.
- Menor divergência de comportamento entre ambientes.
- Menor esforço mental de suporte (“mesma regra, dados diferentes”).
- Menor necessidade de fallback específico para sandbox.

### Contras / cuidados
- Aumenta volume de dados de configuração por empresa (wallet/account/api_key por ambiente).
- Exige UI/admin e validações mais explícitas para não misturar credenciais.
- Migração precisa ser cuidadosa para não quebrar empresas já onboarded.

### O que precisaria mudar (alto nível)
1. **Modelo de credenciais por ambiente da empresa**
   - Hoje `companies` guarda 1 conjunto principal. Para espelho real, separar por ambiente (ex.: `asaas_api_key_sandbox`, `asaas_wallet_id_sandbox`, `asaas_account_id_sandbox`, `asaas_onboarding_complete_sandbox`, idem produção; ou tabela filha `company_payment_accounts`).

2. **Owner da cobrança alinhado entre ambientes**
   - Sandbox também cobrar em nome da empresa sandbox (não da plataforma), quando empresa tiver conta sandbox.

3. **Split em sandbox**
   - Aplicar split com wallets sandbox (plataforma e parceiro sandbox), mantendo mesma regra lógica.

4. **Webhook token por ambiente já existe e deve continuar**
   - A diferença passa a ser só segredo/dado, não regra de fluxo.

### Isso deixa a arquitetura mais limpa ou mais pesada?
- **Mais limpa no domínio** (mesma regra em qualquer ambiente).
- **Levemente mais pesada em configuração** (mais campos/estado por empresa).
- Em longo prazo, custo total de manutenção tende a cair.

### Vale adotar agora?
**Sim, vale adotar agora** (momento de reorganização antes de escalar), desde que feito em migração progressiva e observável.

---

## 6. Arquitetura-alvo recomendada (simplificada e previsível)

## 6.1 Princípios
1. **Fonte única de verdade do ambiente da transação**: `sales.payment_environment`.
2. **Configuração explícita por ambiente** (empresa/plataforma/parceiro).
3. **Sem fallback implícito de owner/credencial em produção** (falha explícita + log de diagnóstico).
4. **Mesma máquina de estado para webhook e verify** (função compartilhada interna).

## 6.2 Regras recomendadas
- **Resolução de ambiente**:
  - Prioridade recomendada: `override manual de developer` (somente ambientes internos controlados) > contexto explícito da operação (se existir) > host como fallback técnico.
  - Em produção pública, host pode continuar como guardrail, mas com telemetria de divergência.

- **Separação clara de conceitos**:
  - Ambiente (sandbox/prod)
  - Dono da cobrança (company/platform)
  - Credencial efetiva (api key/token)
  - Destinos de split (wallets)

- **Webhook + verify obedecem a mesma regra**:
  - Buscar venda -> resolver ambiente da venda -> carregar credenciais do owner daquela venda -> aplicar mesma rotina de transição de status (idempotente).

- **Redução de malabarismo/fallback**:
  - Remover fallback produção->plataforma para casos novos.
  - Manter fallback apenas para legado com flag de compatibilidade e prazo para desativação.

## 6.3 Modelo lógico recomendado
- Introduzir um resolvedor único (ex.: `resolvePaymentContext(sale)`), retornando:
  - `environment`
  - `ownerType` (`company`/`platform`)
  - `apiKeyRef`
  - `baseUrl`
  - `splitTargets`
  - `webhookTokenRef`
- Todas as funções (`create`, `verify`, `webhook`, `platform_fee`) usam esse resolvedor.

---

## 7. Plano de evolução em 5 steps (progressivo e seguro)

## Step 1 — Diagnóstico contratual e observabilidade unificada
- **Objetivo**: mapear contrato real do fluxo atual e reduzir “zona cinzenta”.
- **Resolve**: inconsistência entre funções e dificuldade de suporte.
- **Analisar/alterar**:
  - Funções Asaas citadas + `_shared/runtime-env.ts`.
  - Estrutura/log de `sale_integration_logs` e `sale_logs`.
  - Dashboard/queries operacionais de rastreio por `sale_id`.
- **Risco**: baixo.
- **Dependências**: nenhuma.
- **Resultado esperado**: matriz oficial de decisão (ambiente, owner, credencial, split) e telemetria padronizada.

## Step 2 — Fonte única de contexto de pagamento (sem mudar regra de negócio ainda)
- **Objetivo**: centralizar resolução de contexto em helper compartilhado.
- **Resolve**: duplicação de lógica/fallback divergente.
- **Analisar/alterar**:
  - Criar/expandir helper compartilhado no `_shared`.
  - Ajustar `create-asaas-payment`, `verify-payment-status`, `asaas-webhook`, `create-platform-fee-checkout` para consumir o helper.
- **Risco**: médio (toca funções críticas).
- **Dependências**: Step 1.
- **Resultado esperado**: mesmas regras atuais, porém em um único ponto de decisão.

## Step 3 — Saneamento de dados e modelo de credencial por ambiente
- **Objetivo**: preparar banco para sandbox espelho.
- **Resolve**: limitação de “uma credencial por empresa” e ambiguidades de split/parceiro.
- **Analisar/alterar**:
  - `companies` (credenciais/account/wallet por ambiente) ou tabela filha de contas de pagamento.
  - `partners` (garantir modelagem coerente com uso por empresa/ambiente).
  - Rotinas de onboarding (`create-asaas-account`) e telas admin associadas.
- **Risco**: médio-alto (migração de dados e UI de operação).
- **Dependências**: Step 2.
- **Resultado esperado**: configuração explícita e validável por ambiente.

## Step 4 — Ativação do sandbox espelho (feature-flag)
- **Objetivo**: igualar fluxo sandbox ao de produção com segurança.
- **Resolve**: divergência lógica entre ambientes.
- **Analisar/alterar**:
  - `create-asaas-payment` (owner/split também em sandbox, usando credencial/wallet da empresa sandbox).
  - Webhook/verify para validar e consultar com mesmo contrato.
  - Regras de fallback legado controladas por flag.
- **Risco**: alto (mudança comportamental direta no checkout).
- **Dependências**: Step 3.
- **Resultado esperado**: sandbox operando como espelho funcional da produção.

## Step 5 — Hardening, desativação de legado e playbook operacional
- **Objetivo**: remover complexidade residual e congelar padrão alvo.
- **Resolve**: dívida técnica de compatibilidade e risco de regressão.
- **Analisar/alterar**:
  - Remover fallback legado vencido.
  - Atualizar documentação técnica/operacional.
  - Criar checklist de onboarding por ambiente e validação periódica.
- **Risco**: médio.
- **Dependências**: Step 4 estável em produção controlada.
- **Resultado esperado**: arquitetura previsível, auditável e simples de manter.

---

## 8. Conclusão final

- **Vale a pena seguir com a simplificação?** Sim.
- **Direção recomendada**: adotar arquitetura com contexto de pagamento centralizado + credenciais explícitas por ambiente + sandbox espelho de produção.
- **Por onde começar**: Step 1 imediatamente (contrato + observabilidade) e Step 2 em seguida (resolvedor único), antes de qualquer mudança de comportamento.

Em resumo: o projeto já tem base robusta. A simplificação correta não é “remover robustez”, e sim **remover ambiguidade**.
