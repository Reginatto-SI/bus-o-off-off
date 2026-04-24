# 05 — PRD Asaas: Configuração da Empresa e Validação

## 1. Objetivo
Documentar como cada empresa configura e valida a integração Asaas no ambiente correto (sandbox/produção), sem mistura entre tenants.

## 2. Contexto
A configuração ocorre principalmente em `/admin/empresa` com suporte de wizard e painel diagnóstico. O status operacional depende do ambiente ativo.

## 3. Classificação
- **Criticidade:** Alta / Configuração
- **Público principal:** Suporte, Produto, Desenvolvimento, Operação
- **Telas impactadas:** `/admin/empresa` (pagamentos), wizard Asaas, painel diagnóstico
- **Risco se quebrar:** empresa não vende online, erro recorrente no checkout, ambiente incorreto
- **Origem da regra:** `Company.tsx`, `AsaasOnboardingWizard.tsx`, `AsaasDiagnosticPanel.tsx`, `check-asaas-integration`, `create-asaas-account`

## 4. Regra de ouro
**Cada empresa deve possuir configuração Asaas própria, isolada por ambiente, sem mistura entre sandbox e produção.**

## 5. Telas envolvidas
- `/admin/empresa` (status, conexão, validação, desconexão)
- Wizard de onboarding Asaas (criar/vincular conta)
- Painel diagnóstico Asaas (dev/admin)

## 6. Fluxo atual
1. Frontend resolve ambiente operacional (build -> edge -> fallback hostname).
2. Snapshot de integração do ambiente atual define status visual (`connected`, `inconsistent`, etc.).
3. Ações de admin:
   - criar subconta;
   - vincular conta existente via API key;
   - verificar integração;
   - garantir webhook.
4. Diagnóstico cruza metadados locais e retorno do gateway (wallet/account/pix readiness).

## 7. Regras confirmadas pelo código
- Configuração é avaliada por ambiente atual, sem completar com outro ambiente.
- API key e wallet do ambiente ativo são essenciais para operação.
- Split com sócio acima de zero exige sócio ativo e wallet válida.
- Verificação de integração exige autorização e validação de contexto administrativo.

## 8. O que este PRD NÃO cobre
- Não define estratégia comercial de onboarding de empresas.
- Não define política de cobrança/precificação de uso da plataforma.
- Não substitui runbook de deploy de edge functions.
- Não define gestão de segredos fora do escopo da aplicação.

## 9. Cenários de falha e ação esperada
| Cenário | Sintoma | Risco | Onde validar | Ação esperada |
|---|---|---|---|---|
| API key ausente | Erro ao criar/consultar cobrança | Empresa sem venda online | `companies.asaas_api_key_*`, diagnóstico | Preencher API key correta no ambiente ativo |
| Wallet ausente | Status inconsistente/split inválido | Falha de split e diagnóstico parcial | `companies.asaas_wallet_id_*` | Corrigir wallet do ambiente ativo |
| Account ID divergente | Diagnóstico inconsistente | Conexão inválida no tenant | resposta de check integração | Revalidar vínculo e corrigir metadado |
| Pix não pronto | Bloqueio de Pix no checkout | Perda de conversão | `asaas_pix_ready_*`, erro de readiness | Ajustar chave Pix/conta e revalidar |
| Onboarding incompleto | Status parcial/inconsistente | Fluxo instável | `asaas_onboarding_complete_*` + diagnóstico | Completar onboarding no Asaas |
| Ambiente ativo diferente do preenchido | Falha mesmo com dados “existentes” | Mistura sandbox/produção | hook ambiente + campos por ambiente | Ajustar configuração no ambiente correto |
| Diagnóstico válido, checkout falha | Contradição operacional | Incidente oculto | logs de criação de cobrança | Revisar edge logs e escalar dev |
| Usuário tenta vender sem integração completa | Erro recorrente de pagamento | Operação interrompida | admin empresa + checkout | Concluir integração antes de venda online |

## 10. Riscos identificados
- Confusão entre ambiente visual e configuração persistida.
- Operação pode assumir “integrado” sem validar todos os pré-requisitos do ambiente ativo.

## 11. Dúvidas pendentes
### Produto
- Política de bloqueio preventivo de publicação/venda sem integração completa: **não identificado no código atual**.

### Financeira
- Critério formal para liberar Pix por empresa em produção: **não identificado no código atual**.

### Técnica
- Estratégia formal de rotação de API key por tenant: **não identificado no código atual**.

### Operacional
- Procedimento padronizado para “diagnóstico válido, checkout falha”: **não identificado no código atual**.

## 12. Melhorias futuras (sem implementação nesta tarefa)
### Documentação
- Checklist único de onboarding por ambiente.

### Produto
- Feedback orientado por causa raiz no admin empresa.

### Suporte
- Roteiro de triagem rápida por tipo de erro de integração.

### Segurança
- Processo formal de rotação/revogação de credenciais por empresa.

### Operação
- Monitoramento de empresas com status inconsistente recorrente.

### Código
- Reforçar padronização de mensagens/erros entre check e create payment.
