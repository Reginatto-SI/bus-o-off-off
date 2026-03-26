# Análise 41 — Identificação operacional “Auxiliar de Embarque” reaproveitando role `motorista`

## 1) Diagnóstico do estado atual

### Onde a role `motorista` era usada
- **Cadastro/Edição de usuários (admin):** a tela `src/pages/admin/Users.tsx` persistia apenas `role`, `driver_id` e `seller_id` em `user_roles`, sem campo para distinção operacional entre tipos de usuário com role motorista.
- **Exibição de perfil (admin):** badges e filtros usavam somente `role` (ex.: “Motorista”), sem diferenciação visual adicional.
- **Permissões/guardas:** acessos no app operacional continuam baseados em `userRole === 'motorista'` (ou perfis administrativos), sem fluxo paralelo.
- **Leitura/validação QR e embarque:** fluxo operacional (home/embarque/validação) usa as permissões existentes da role técnica e consulta `driver_id` para contexto de viagem, sem exigir nova role.
- **Vínculo com motorista:** em `user_roles.driver_id`, obrigatório na tela de usuários quando `role = motorista`.

### Como o sistema diferenciava antes
- **Role técnica:** coluna `user_roles.role`.
- **Perfil exibido:** mapeamento visual local (badge/label) na UI administrativa.
- **Vínculo operacional:** `user_roles.driver_id` ligado ao cadastro em `drivers`.

### Menor mudança segura identificada
A menor mudança para atender o objetivo sem quebrar RLS/guardas/permissões foi:
1. **Adicionar um campo complementar em `user_roles`** (`operational_role`) apenas para identificação operacional visual/cadastral.
2. **Manter `role = motorista` como fonte única de autorização**.
3. **Fallback retrocompatível**: onde não houver `operational_role`, tratar como `motorista`.

## 2) Pontos alterados

### Banco de dados
- Criada migration `supabase/migrations/20260327010000_add_user_roles_operational_role.sql`:
  - adiciona coluna `operational_role` em `user_roles`;
  - adiciona `CHECK` com valores permitidos (`motorista` ou `auxiliar_embarque`);
  - backfill de compatibilidade para registros antigos de role motorista (`operational_role = 'motorista'`).

### Tipagem
- Atualizado `src/integrations/supabase/types.ts` para refletir a nova coluna em `user_roles`.
- Atualizado `src/types/database.ts` (`UserRoleRecord` e `UserWithRole`) com `operational_role`.

### Tela administrativa de usuários
- Atualizado `src/pages/admin/Users.tsx` para:
  - ler/salvar `operational_role` em criação e edição;
  - exibir seletor “Identificação operacional” quando role técnica for `motorista`;
  - deixar explícito no texto da UI que permissões continuam pela role técnica;
  - exibir badge de perfil com “Motorista” ou “Auxiliar de Embarque” (somente visual/cadastral);
  - aplicar fallback seguro para legado (`null` => “Motorista”).

### Edge Function de criação de usuário
- Atualizado `supabase/functions/create-user/index.ts` para aceitar e persistir `operational_role` quando `role = motorista`.
- Mantido fallback seguro: se não for enviado valor explícito para motorista, assume `motorista`.

### App operacional
- Atualizado `src/pages/driver/DriverHome.tsx` para exibir o “Perfil operacional” resolvido do usuário (Motorista/Auxiliar de Embarque), sem alterar guardas/permissões.

## 3) Decisão adotada

Foi adotada **diferenciação operacional por campo complementar (`operational_role`) na própria `user_roles`**, sem nova role técnica e sem alterar RBAC.

Motivo:
- evita duplicação de lógica;
- preserva fluxos atuais de autenticação/autorização;
- mantém rastreabilidade por empresa no mesmo vínculo já existente;
- entrega mudança mínima e reversível.

## 4) Impacto em dados existentes

- Usuários antigos com `role = motorista` passam a ter `operational_role = 'motorista'` após migration (backfill).
- Usuários de outras roles ficam com `operational_role = null`.
- Não há alteração de role técnica existente, nem em RLS, nem em guards.

## 5) Risco residual

- **Risco funcional baixo:** como as permissões continuam em `role`, o novo campo influencia apenas identificação visual/cadastral.
- **Atenção operacional:** caso alguma integração externa leia apenas rótulos visuais da UI (e não `role`), pode observar nova nomenclatura “Auxiliar de Embarque”; não há impacto de autorização.
- **Mitigação aplicada:** comentários no código e textos de UI deixam explícito que a role base continua sendo `motorista`.
