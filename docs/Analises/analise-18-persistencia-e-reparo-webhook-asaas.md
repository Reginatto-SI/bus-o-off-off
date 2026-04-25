# Análise 18 — Persistência e reparo de webhook Asaas

## Objetivo

Consolidar a correção de webhook Asaas por empresa sem alterar a arquitetura principal de pagamento, fechando duas lacunas:

1. deixar a auto-configuração do webhook com trilha técnica persistida e auditável;
2. oferecer um caminho manual e seguro para reparar empresas antigas já vinculadas antes da automação.

## Lacunas fechadas

- **Persistência diagnóstica:** cada tentativa de `ensureAsaasWebhook(...)` agora gera trilha técnica persistida com:
  - `company_id`;
  - `payment_environment`;
  - tipo de fluxo (`link_existing`, `link_existing_partial`, `create_subaccount`, `manual_repair`);
  - ação final (`created`, `updated`, `unchanged`, `skipped`, `failed`);
  - `webhook_url`;
  - `webhook_id`, quando existente;
  - motivo de skip/falha;
  - mensagem objetiva.
- **Reparo retroativo:** foi adicionado um caminho manual explícito no admin para reexecutar a mesma rotina de `ensureAsaasWebhook(...)` em empresas já conectadas.

## Decisão sobre persistência diagnóstica

### Estrutura existente avaliada

No estado atual do projeto, **não existe uma tabela dedicada de log técnico de integração por empresa**.

A estrutura técnica reutilizável já existente é `sale_integration_logs`, que hoje já comporta inserção com `sale_id = null` no contrato tipado atual e mantém:

- `company_id`;
- ambiente;
- provider;
- direction;
- status;
- códigos de incidente/aviso;
- payload/response JSON.

### Decisão adotada

Para aplicar a **menor correção segura**, a persistência da configuração de webhook da empresa passou a reutilizar `sale_integration_logs` com:

- `sale_id = null`;
- `provider = 'asaas'`;
- `direction = 'outgoing_request'`;
- `event_type = 'company_webhook_configuration'`.

Isso evita criar tabela paralela só para esta correção e mantém a trilha auditável no mesmo padrão técnico já usado pelo projeto.

## Arquivos alterados

- `supabase/functions/create-asaas-account/index.ts`
- `src/components/admin/AsaasDiagnosticPanel.tsx`
- `analise-18-persistencia-e-reparo-webhook-asaas.md`

## Como ficou a persistência diagnóstica

Foi criado um wrapper local para persistir a tentativa de configuração do webhook:

- helper principal reutilizado: `ensureAsaasWebhook(...)`;
- helper de auditoria: `persistAsaasWebhookAttempt(...)`.

O wrapper grava um log técnico por tentativa com:

- fluxo de origem;
- ação final;
- motivo;
- `webhook_url`;
- `webhook_id`;
- payload e response mínimos;
- classificação de sucesso, warning ou erro.

### Garantias preservadas

- se o log falhar, o onboarding **não quebra**;
- se a escrita de log falhar, a vinculação **não é revertida**;
- a separação entre `sandbox` e `production` continua vindo do mesmo `target_environment`/runtime já existente.

## Como ficou o reparo retroativo

### Formato escolhido

Foi adotada uma **ação administrativa/manual clara no painel de diagnóstico Asaas**, porque isso entrega:

- execução explícita pelo operador;
- previsibilidade;
- mesma regra de ambiente já usada pelo admin;
- trilha auditável da tentativa;
- reaproveitamento do mesmo helper `ensureAsaasWebhook(...)`.

### Implementação

- novo modo backend: `mode = 'ensure_webhook'` na edge function `create-asaas-account`;
- nova ação no painel `AsaasDiagnosticPanel`: **Reconfigurar webhook**.

Esse fluxo:

1. resolve a empresa e o ambiente atual;
2. usa a API key persistida da empresa **do mesmo ambiente**;
3. chama o mesmo `ensureAsaasWebhook(...)`;
4. persiste a tentativa em log técnico;
5. retorna resultado objetivo para UI.

## Riscos residuais

- se a empresa não tiver API key persistida no ambiente selecionado, o reparo manual não consegue atuar e retorna erro orientativo;
- se faltar `SUPABASE_URL` ou o secret de token do webhook no runtime, a tentativa é registrada como `skipped`, mas não aplicada remotamente;
- a trilha fica em `sale_integration_logs`, que continua sendo uma tabela originalmente concebida para integrações técnicas de pagamento; isso é aceitável como solução mínima, mas uma tabela específica por empresa poderia ser considerada no futuro se o volume/escopo crescer.

## Checklist validado

- [x] A auto-configuração de webhook passa a deixar trilha persistida e auditável.
- [x] O vínculo da empresa não quebra se a persistência do log falhar.
- [x] Existe um caminho seguro para reparar empresas antigas já vinculadas.
- [x] O reparo reutiliza o mesmo helper `ensureAsaasWebhook(...)`.
- [x] Sandbox e produção continuam separados com rigor.
- [x] Não há duplicação de lógica.
- [x] Build/typescript foram verificados com checks direcionados aos arquivos alterados.
- [x] Arquivo Markdown sequencial criado.
