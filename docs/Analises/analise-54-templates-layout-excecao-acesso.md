# Análise 54 — templates-layout exceção de acesso

## Resumo executivo
A auditoria completa mostrou que o bloqueio residual não estava só em autorização de rota/UI. O acesso à tela já havia sido parcialmente liberado, e também existiam migrations para RLS com o `user_id` de exceção. O problema principal remanescente estava no **handler de salvamento de assentos no frontend**, que interpretava retorno vazio do `upsert` como falta de permissão e disparava o toast *“Sem permissão para salvar os assentos deste template.”* antes de concluir uma verificação de persistência. Esse fluxo gerava falso negativo para o usuário autorizado.

## Causa raiz real
1. **Camada de navegação/rota**: já existia exceção em `AuthContext` (`canAccessTemplatesLayout`) e na sidebar para expor `/admin/templates-layout` ao usuário específico. Não era a causa principal atual.
2. **Camada de persistência frontend (causa raiz)**:
   - Em `handleSave` de `TemplatesLayout.tsx`, havia uma condição que tratava `upsertedItems.length === 0` como erro de permissão imediatamente.
   - O próprio código tinha uma checagem de “probe” para validar persistência em retorno vazio, mas ela estava efetivamente neutralizada pelo `return` anterior.
   - Resultado: toast de permissão podia aparecer mesmo quando o backend/políticas permitiam o salvamento.
3. **Camada RLS/backend**:
   - Já havia políticas com exceção por `user_id` em migrations anteriores.
   - Como hardening final, foi centralizada a regra em função SQL dedicada para evitar divergência e manter auditabilidade.

## Camadas investigadas

### 1) Rota / navegação
- `src/App.tsx`: rota `/admin/templates-layout` existe.
- `src/contexts/AuthContext.tsx`: gate `canAccessTemplatesLayout` já contemplava o usuário de exceção.
- `src/components/layout/AdminSidebar.tsx`: item de menu tinha lógica específica para manter essa tela visível ao usuário autorizado.

### 2) Renderização da tela
- `src/pages/admin/TemplatesLayout.tsx`: bloqueio de render somente por `canAccessTemplatesLayout` (`Navigate` para `/admin/eventos` quando falso).
- Não havia bloqueio adicional explícito por `userRole` dentro dos botões de edição/salvamento.

### 3) Ações/handlers
- Função crítica: `handleSave` em `src/pages/admin/TemplatesLayout.tsx`.
- O toast citado nasce no **frontend** (mensagem hardcoded no handler), não como texto de erro direto do backend.
- Foi identificado fluxo com falso negativo no bloco de `upsert` de `template_layout_items`.

### 4) Serviços/hooks/client API
- A tela usa chamadas diretas do client Supabase (`from(...).upsert/update/insert/delete/select`), sem service layer separado para permissão.
- A checagem ficou parcialmente espalhada entre `AuthContext` (acesso de rota) e `TemplatesLayout` (interpretação de retorno de persistência).

### 5) Banco/RPC/RLS/policies
- Persistência usa tabelas diretas: `template_layouts`, `template_layout_items` e trigger para `template_layout_versions`.
- Não há RPC/edge function no salvamento dessa tela.
- Migrations anteriores já tentavam liberar o usuário de exceção no RLS.
- Ajuste adicional aplicado: função `public.is_templates_layout_exception_user(uuid)` e políticas passando a usar esse ponto central.

### 6) Auth/contexto de sessão
- Exceção foi padronizada em helper frontend por `user_id` (fonte de verdade), sem dependência de e-mail e sem alterar role.

### 7) Fluxo de assentos/layout items
- O salvamento envolve:
  1. update/insert em `template_layouts`
  2. `select` de itens existentes
  3. `upsert` em `template_layout_items`
  4. `delete` de itens removidos
- O erro relatado era especificamente na etapa (3), via toast local.

## Arquivos e funções afetados
- `src/pages/admin/TemplatesLayout.tsx`
  - Função `handleSave` (ajuste da lógica de erro no `upsert` de assentos).
- `src/contexts/AuthContext.tsx`
  - Uso de helper central para exceção da tela.
- `src/lib/templatesLayoutAccess.ts`
  - Novo ponto central frontend para regra por `user_id`.
- `supabase/migrations/20260329110000_templates_layout_exception_user_policy_function.sql`
  - Nova função SQL e atualização das policies para centralizar exceção no backend.

## Por que tentativas anteriores provavelmente não resolveram
- O histórico focou em liberar acesso/role guard e RLS.
- Mesmo com isso, o frontend ainda tinha condição que transformava retorno vazio do `upsert` em “sem permissão”, interrompendo o fluxo antes da validação de persistência planejada.

## Diferença entre acesso à tela e permissão real de salvar
- **Acesso à tela**: controlado por `canAccessTemplatesLayout` (AuthContext + menu/rota).
- **Permissão de salvar**: depende de RLS + interpretação de retorno das operações CRUD no handler.
- O bug residual estava no segundo ponto (interpretação do retorno), não no primeiro.

## Solução aplicada
1. **Correção mínima no handler de save**
   - Agora só trata erro quando `itemsUpsertError` existe.
   - Se o retorno vier vazio com mudanças detectadas, executa *probe* de persistência antes de concluir “sem permissão”.
   - Remove falso negativo que disparava o toast indevidamente.
2. **Centralização explícita da exceção no frontend**
   - Helper `canAccessTemplatesLayoutByUserId` com comentário de escopo e intenção.
3. **Centralização explícita da exceção no backend**
   - Função SQL `is_templates_layout_exception_user(auth.uid())` usada pelas policies das 3 tabelas do catálogo.

## Riscos avaliados
- **Baixo risco funcional**: alteração localizada no fluxo da tela solicitada.
- **Baixo risco de segurança**: exceção continua estrita ao `user_id` informado.
- **Sem alteração de role**: não altera `user_roles`.
- **Sem abertura global**: políticas continuam restringindo `FOR ALL` a developer ou usuário de exceção.

## Checklist final de validação
- [x] Exceção baseada em `user_id` (não e-mail).
- [x] Exceção explicitamente comentada no código.
- [x] Escopo restrito à tela/fluxo de templates-layout.
- [x] Sem mudança de role.
- [x] Sem refatoração arquitetural ampla.
- [x] Multiempresa preservado (tela global + políticas pontuais).

## Respostas obrigatórias
1. **A mensagem de erro nasce no frontend ou backend?**
   - No frontend (`toast.error(...)` no `handleSave`).
2. **A checagem de permissão está em um único ponto ou espalhada?**
   - Espalhada: AuthContext/rota/menu + handler de persistência + RLS.
3. **Salvamento do template e dos assentos usam a mesma regra?**
   - Não exatamente; template usa `template_layouts`, assentos usam `template_layout_items` (com validação de retorno específica).
4. **Existe conflito entre tela global e lógica multiempresa?**
   - Potencialmente sim no desenho geral, mas nesta correção o comportamento global foi mantido e sem quebra do padrão multiempresa.
5. **Tentativas anteriores liberaram visualização e esqueceram persistência?**
   - Parcialmente, sim: o gate de acesso estava liberado, mas persistência ainda sofria falso negativo no handler.
6. **Bloqueio restante estava em RLS, RPC, helper local ou combinação?**
   - Principalmente helper/local handler (frontend), com hardening adicional em RLS para centralização/auditabilidade.
