# Análise de viabilidade — inativação e reativação de empresas

## 1) Escopo desta análise

Documento de diagnóstico técnico/funcional para suportar o PRD de inativação/reativação de empresas, **sem implementação** nesta etapa.

Objetivos avaliados no código atual:
- `AuthContext`
- `AdminHeader`
- RLS/função `user_belongs_to_company`
- tabela `companies` e campos de status
- existência de trilha de auditoria reaproveitável
- existência de fluxo de solicitação/suporte reaproveitável
- existência de tela admin adequada para pendências

---

## 2) Diagnóstico do funcionamento atual

### 2.1 Seletor de empresa no topo
- O seletor atual está no `AdminHeader` e usa dropdown simples sobre `userCompanies` com `switchCompany`.
- Não há busca/filtro/status na UI do header.

### 2.2 Origem das empresas exibidas
- `AuthContext` resolve `userCompanies` e `activeCompany`.
- Para developer, a consulta de empresas aplica `eq('is_active', true)`.
- Em seguida, há novo filtro em memória para manter apenas `company.is_active === true`.
- Resultado prático: empresas inativas já não aparecem no seletor rápido atual.

### 2.3 Estado ativo/inativo no banco
- A coluna oficial é `companies.is_active` (`boolean not null default true`).
- Não existe `status` textual em `companies` para esse controle.

### 2.4 RLS e bloqueio operacional
- A migration de `is_active` redefine `user_belongs_to_company` com join em `companies` exigindo `c.is_active = true`.
- Policies de gerenciamento em entidades operacionais (`vehicles`, `drivers`, `boarding_locations`, `sellers`, `events`) usam essa função no `USING/WITH CHECK`.
- Efeito esperado: com empresa inativa, usuário autenticado pode existir, mas tende a perder capacidade operacional sobre dados da empresa.

---

## 3) Evidências de permissões (Developer)

- Existe `is_developer(_user_id)` no banco.
- Existe policy `Developer can manage all companies` na tabela `companies`.
- No frontend, role `developer` recebe capacidades administrativas ampliadas em `AuthContext`.

**Ponto de atenção técnico:** há redefinições históricas da função `user_belongs_to_company` em migrations diferentes (com e sem bypass explícito para developer). Isso exige validação de estado final do banco em ambiente alvo antes de implementação do toggle de inativação.

---

## 4) Campos atuais relevantes em `companies`

Campos úteis para PRD e fluxo futuro:
- Identidade: `id`, `name`, `trade_name`, `legal_name`
- Documento: `document_number` (unificado), `cnpj`, `document`, `legal_type`
- Contato: `phone`, `email`, `whatsapp`
- Estado: `is_active`
- Auditoria genérica de registro: `created_at`, `updated_at`

**Gap atual:** não existem (na tabela `companies`) campos explícitos para:
- motivo da inativação
- motivo da reativação
- `inactivated_at`, `inactivated_by`, `reactivated_at`, `reactivated_by`

---

## 5) Existe trilha de auditoria reaproveitável?

### O que existe
- `admin_notifications`: notificações operacionais por empresa (header), com tipos fechados e foco em eventos/vendas/capacidade/pagamento.
- `sale_logs`, `sale_integration_logs`, `email_send_log`: logs focados em vendas, integração e envio de e-mail.

### Conclusão
- Não há hoje uma tabela explícita para auditoria de ciclo de vida de empresa (inativação/reativação).
- `admin_notifications` pode apoiar **visualização operacional** (alertas), mas não substitui trilha formal de auditoria/motivo.

---

## 6) Existe fluxo de solicitação/suporte reaproveitável?

### O que existe
- Edge function `admin-user-auth-support` trata suporte de autenticação/links de acesso para usuário.

### Conclusão
- Não há fluxo dedicado de “solicitação de reativação de empresa”.
- A função de suporte existente não cobre governança de estado de `companies`.

---

## 7) Existe tela admin adequada para solicitações pendentes?

### O que existe
- Sino/stack de notificações no header (via `admin_notifications`).
- Não foi localizada, no escopo analisado, uma tela administrativa específica para fila de reativação de empresas pendentes.

### Conclusão
- Para Opção B (solicitação com aprovação), será necessário definir um ponto oficial de triagem (p.ex. módulo admin existente ou seção dedicada em tela já existente), evitando criar fluxo paralelo sem padrão.

---

## 8) Impactos mapeados por domínio

1. **Login/autenticação**
   - O login de auth não depende diretamente de `companies.is_active` no frontend atual.
   - O bloqueio ocorre no avanço operacional por contexto/empresa e RLS.

2. **Operação admin (CRUDs por company_id)**
   - Inativar empresa tende a bloquear leitura/escrita operacional para usuários não autorizados via função central de pertencimento.

3. **Vendas/eventos/pagamentos**
   - Como políticas operacionais dependem de pertencimento da empresa ativa, inativação pode interromper fluxo diário de gestão.

4. **Vitrine pública**
   - Existe policy pública de companies com requisito `is_active = true` e eventos públicos.
   - Inativação impacta exposição pública da empresa.

5. **Histórico**
   - Não há indicação de deleção automática por inativação; histórico é preservável desde que regra continue lógica (desativar, não excluir).

---

## 9) Avaliação das opções de decisão

### Opção A — Reativação automática por clique do usuário
- Vantagem: recuperação rápida.
- Risco: quebra de governança administrativa (inadimplência, testes, bloqueio por decisão interna etc.).
- Risco alto de reativação sem rastreio/motivo.

### Opção B — Solicitação de reativação (pendente de análise)
- Vantagem: mantém controle, rastreabilidade e alinhamento com multiempresa.
- Permite exigir motivo e registrar decisão administrativa.
- Melhor aderência ao contexto encontrado no projeto.

**Recomendação técnica/funcional desta análise:** seguir **Opção B**.

---

## 10) Dúvidas obrigatórias registradas (sem inferir regra)

1. Quem aprova reativação: somente developer ou também gerente interno de suporte?
2. Qual SLA e canal padrão da solicitação (in-app, WhatsApp, e-mail, fila interna)?
3. Quais critérios objetivos bloqueiam reativação (inadimplência, fraude, documentação)?
4. O que fazer com sessão já aberta no momento da inativação?
5. Se empresa ativa atual for inativada pelo próprio developer, bloquear ação ou exigir troca prévia?

---

## 11) Conclusão de viabilidade

- O sistema já tem base estrutural para distinguir empresa ativa/inativa (`is_active`) e já tende a ocultar inativas no seletor rápido.
- A diretriz “não bloquear login, mas bloquear avanço operacional” é **compatível** com o comportamento técnico atual observado.
- Para suportar política oficial de reativação por solicitação (Opção B), faltam definições de produto e trilha formal de auditoria/pêndencias no domínio de empresas.
- Próxima etapa deve ser PRD formal (este diagnóstico sustenta o documento), sem alterar RLS/login neste momento.
