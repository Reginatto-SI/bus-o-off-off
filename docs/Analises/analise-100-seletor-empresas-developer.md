# Análise de viabilidade — seletor de empresas (perfil Developer)

## 1) Diagnóstico do funcionamento atual

### 1.1 Onde está o seletor atual
- O seletor do topo está no `AdminHeader`, usando `DropdownMenu` simples com lista linear de `userCompanies` e ação `switchCompany(company.id)`. Não existe busca, paginação, filtros nem metadados além do nome.  
- A UI exibe apenas `company.name` no item do dropdown e um check para a empresa ativa.

### 1.2 Origem dos dados do dropdown
- A origem é o `AuthContext`, que popula `userCompanies`, `activeCompany` e `activeCompanyId`.
- Para usuários com papel `developer`, o contexto busca empresas em `companies` com filtro explícito `is_active = true`.
- Depois da consulta, o contexto ainda filtra novamente em memória (`company.is_active === true`) antes de preencher `userCompanies`.
- Para perfis não developer, a seleção é por `company_id` em `user_roles`.

### 1.3 Regra de troca de empresa
- `switchCompany` só permite trocar para empresas existentes em `userCompanies`.
- Como `userCompanies` hoje contém somente empresas ativas, o seletor rápido já oculta empresas inativas no fluxo padrão.

### 1.4 Permissões relevantes
- Existe `is_developer()` no banco e policy explícita `Developer can manage all companies` (CRUD em `companies`).
- No frontend, `isDeveloper` herda capacidades de gerente para vários fluxos administrativos.

---

## 2) Arquivos/componentes envolvidos

### Frontend (núcleo do fluxo)
- `src/components/layout/AdminHeader.tsx`  
  Renderização do dropdown de troca de empresa no topo.
- `src/contexts/AuthContext.tsx`  
  Fonte de verdade para lista de empresas visíveis, empresa ativa e troca de contexto multiempresa.

### Tipos e contrato de dados
- `src/types/database.ts`  
  Interface `Company` e tipo `UserRole` usados no app.
- `src/integrations/supabase/types.ts`  
  Contrato gerado com colunas reais de `public.companies`.

### Banco / RLS / histórico estrutural
- `supabase/migrations/20260202171332_8acbfe56-85f4-44c7-b190-94da97960f46.sql`  
  Criação de `companies`, multiempresa e policies iniciais.
- `supabase/migrations/20260308000000_add_companies_is_active.sql`  
  Introdução do `is_active` e reforço de bloqueio operacional via `user_belongs_to_company`.
- `supabase/migrations/20260214220504_640ac2c6-73ce-426e-8ce4-6eeb995e3979.sql`  
  Funções/policies específicas de developer.
- `supabase/migrations/20260404000000_add_company_legal_type_document_number.sql`  
  Estrutura PF/PJ e documento unificado.

---

## 3) Estrutura atual da tabela de empresas

Pelos tipos gerados e migrações, `companies` possui hoje (resumo dos campos relevantes para o problema):

- Identificação:
  - `id`
  - `name` (nome de exibição principal)
  - `trade_name`
  - `legal_name`
- Documento fiscal:
  - `cnpj` (legado/compat)
  - `document` (legado/compat)
  - `document_number` (campo unificado CPF/CNPJ para PF/PJ)
  - `legal_type` (`PF`/`PJ`)
- Contato:
  - `phone`
  - `email`
  - `whatsapp`
- Endereço e demais metadados
- Estado operacional:
  - `is_active` (boolean, `NOT NULL`, default `true`)

**Observação importante:** não há coluna `status` textual na tabela `companies`; o controle ativo/inativo é pelo booleano `is_active`.

---

## 4) Campos disponíveis para status ativo/inativo

### Campo confiável existente
- Sim: `companies.is_active` já existe e é utilizado ativamente.

### Evidências de uso atual
- `AuthContext` já restringe lista de empresas do developer para `is_active = true`.
- Policy pública de companies para vitrine também usa `is_active = true` (junto com evento público).
- A função `user_belongs_to_company` foi redefinida para considerar empresa ativa na validação de pertencimento.

### Conclusão
- **Não é necessário criar novo conceito de status de empresa**.
- O menor ajuste seguro, caso precise ampliar governança, é usar e padronizar `is_active` em todos os fluxos administrativos dessa feature.

---

## 5) Riscos identificados

1. **Risco de impacto operacional amplo ao inativar empresa**  
   Como `user_belongs_to_company` considera empresa ativa, inativar pode bloquear acesso operacional em tabelas multiempresa (events, sales, drivers, sellers etc.) para usuários não-developer.

2. **Risco de inconsistência de experiência para developer**  
   Há migração antiga onde `user_belongs_to_company` tinha bypass para developer, mas redefinição posterior removeu esse bypass. Isso precisa validação no ambiente real para garantir se o developer consegue (ou não) operar dados de empresa sem vínculo direto em `user_roles`.

3. **Risco em sessões ativas**  
   Se a empresa selecionada for inativada durante a sessão, a próxima resolução de contexto tende a removê-la da lista ativa. Sem tratamento UX explícito, usuário pode “cair” para outra empresa ativa ou ficar sem empresa ativa.

4. **Risco de governança sem trilha**  
   Inativar/reativar empresa sem confirmação forte e sem auditoria de motivo pode gerar incidentes de suporte.

---

## 6) Impactos em multiempresa

### O que já existe
- Troca de empresa centralizada no `AuthContext`.
- Escopo por `company_id` em praticamente todos os módulos administrativos.
- RLS aplicada por pertencimento de empresa e papel.

### Impacto ao ocultar inativas no seletor principal
- **Baixo no frontend**, pois isso já ocorre naturalmente no fluxo atual (`userCompanies` ativas).
- **Médio no operacional** se passar a inativar com mais frequência, porque a inativação impacta autorização e gravação em entidades operacionais.

### Recomendação
- Manter ocultação no seletor rápido.
- Tratar inativas apenas no gerenciador avançado (modal), com contexto explícito de risco e confirmação.

---

## 7) Proposta recomendada (funcional)

### 7.1 Arquitetura de UX (sem quebrar padrão)
- No `AdminHeader`, substituir o dropdown simples por:
  - Botão com empresa ativa (mantendo visual já existente de botão ghost + ícone).
  - Clique abre **modal/dialog** (reutilizar `Dialog`/`Table`/`Input` existentes).

### 7.2 Conteúdo do modal “Gerenciar empresas”
- Campo de busca único (nome + documento):
  - Busca em `name`, `trade_name`, `legal_name`, `document_number`, `cnpj`, `document`.
- Filtro de status:
  - `Todos | Ativas | Inativas` (baseado em `is_active`).
- Grid/tabela compacta com colunas:
  - Nome da empresa (`name` + apoio de `trade_name/legal_name`)
  - Documento (prioridade: `document_number`, fallback `cnpj/document`)
  - Telefone/contato (`phone`; se necessário fallback `whatsapp/email`)
  - Status (`Ativa/Inativa` via badge)
  - Ações:
    - “Selecionar” (somente se ativa)
    - Toggle “Ativar/Inativar” (apenas developer/admin autorizado)

### 7.3 Regras de segurança recomendadas
- Restrição de acesso ao modal de gerenciamento: `isDeveloper` (ou role administrativo explicitamente autorizado).
- Confirm dialog obrigatório para inativação.
- Impedir inativação quando:
  - empresa é a ativa da sessão atual (ou exigir troca prévia), e/ou
  - houver operação crítica em andamento (regra a validar na etapa seguinte).

### 7.4 Comportamento do seletor rápido
- Continuar exibindo somente empresas ativas.
- Empresas inativas só aparecem no modal quando filtro permitir.

---

## 8) Melhor abordagem de UX

- **Padrão recomendado:** botão no topo + modal full-width compacto (não dropdown).
- Motivos:
  - Escala melhor para grande volume.
  - Permite busca e filtros sem poluir header.
  - Mantém consistência com padrões já existentes de tabela e filtros no admin.
- Microinterações sugeridas:
  - foco automático no campo de busca ao abrir modal;
  - tecla Enter para selecionar primeira empresa ativa filtrada;
  - feedback visual claro ao tentar selecionar empresa inativa;
  - badge “Atual” na empresa ativa.

---

## 9) Pode implementar com mudança mínima?

**Sim, com baixo risco para UI e risco moderado para regra de inativação.**

### Mudança mínima segura (fase 1)
1. Trocar dropdown por modal com busca/filtro/lista.
2. Não alterar ainda regras profundas de RLS.
3. Expor inativas apenas no modal avançado.
4. Manter `switchCompany` como está (sem mudar contrato principal).

### Mudança que exige validação prévia (fase 2)
- Ação de ativar/inativar empresa no modal, porque pode bloquear operação de usuários vinculados.

---

## 10) Checklist para próxima etapa (implementação)

- [ ] Criar componente de modal reaproveitando `Dialog`, `Table`, `Input`, `Badge`, `Switch` já existentes.
- [ ] Integrar listagem com fonte atual (`AuthContext`) ou endpoint dedicado para developer (sem fluxo paralelo).
- [ ] Implementar busca por nome e documento.
- [ ] Implementar filtro `Todos/Ativas/Inativas` por `is_active`.
- [ ] Exibir contato básico (`phone`/fallback).
- [ ] Manter seletor rápido mostrando somente ativas.
- [ ] Adicionar confirmação forte para inativar.
- [ ] Definir regra para empresa atualmente ativa (bloquear inativação ou exigir troca prévia).
- [ ] Validar impacto em vendas/eventos/pagamentos/usuários e registrar regra final.
- [ ] Garantir que não afeta usuários comuns (feature flag por role).
- [ ] Adicionar logs/auditoria de mudança de status da empresa.

---

## Validação dos pontos críticos solicitados

1. **Existe campo `status`/`active`/`is_active`?**  
   Sim, existe `is_active` e ele já é usado.

2. **Se não existir, menor ajuste seguro?**  
   Não se aplica. O campo já existe e é suficiente.

3. **Empresas inativas devem bloquear login de usuários vinculados?**  
   **Dúvida em aberto (decisão de produto).** Hoje o login (auth) não depende diretamente de `is_active`; o bloqueio ocorre no acesso operacional por empresa.

4. **Empresas inativas devem apenas sumir do seletor Developer?**  
   Hoje já somem do seletor rápido. Recomenda-se manter isso e exibir no gerenciador avançado apenas com filtro.

5. **Empresas inativas preservam histórico de vendas/eventos?**  
   Sim, não há indicação de deleção; a proposta deve manter apenas bloqueio operacional/reversível.

6. **O que acontece se a empresa selecionada for inativada?**  
   Tendência de perda de contexto na próxima resolução do `AuthContext` (empresa sai da lista ativa). Requer regra UX explícita.

7. **Deve impedir inativação da empresa atual?**  
   Recomendado: **sim**, ou exigir troca para outra ativa antes de concluir.

8. **Deve impedir inativação com venda/evento em andamento?**  
   **Dúvida em aberto (regra de negócio crítica).** Recomendado validar com produto/operação antes de implementar toggle.

---

## Conclusão objetiva

A evolução para um gerenciador em modal é viável e alinhada ao padrão do projeto, com reaproveitamento de componentes existentes e sem criar novo conceito de empresa. O campo correto para controle ativo/inativo já existe (`is_active`).

A parte sensível não é a UI de seleção, e sim a **regra de inativação**, que pode impactar permissões multiempresa e operação diária. Portanto, a implementação deve ser faseada: primeiro UX de seleção/consulta; depois ativar/inativar com regras explícitas de segurança e validação de impacto operacional.
