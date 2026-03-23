### 1. Resumo da correção aplicada

Foi aplicada uma correção mínima e cirúrgica em quatro pontos do fluxo de usuários para reforçar o isolamento multiempresa sem refatorar a arquitetura existente:

1. o runtime da edge function `create-user` passou a expor `runtime_version` no payload para facilitar auditoria de deploy e divergência entre repositório e ambiente publicado;
2. o fluxo de criação deixou de escrever `profiles.company_id`, mantendo `user_roles` como fonte oficial do vínculo por empresa;
3. o `AuthContext` deixou de priorizar `profiles.company_id` para resolver a empresa ativa, usando apenas `localStorage` válido e vínculos reais em `user_roles`;
4. uma nova migration substitui as policies amplas de `user_roles` por rules com escopo por `company_id` e redefine o trigger `handle_new_user` para criar apenas o profile mínimo, sem empresa padrão.

### 2. Problemas corrigidos

- **Contaminação por empresa padrão no signup:** o trigger de `profiles` não força mais `company_id` default no nascimento do usuário.
- **Fonte indevida de empresa ativa:** o frontend não usa mais `profiles.company_id` como prioridade para definir contexto de empresa.
- **RLS ampla demais em `user_roles`:** gerente deixa de ter acesso global implícito; agora o escopo passa a ser a(s) empresa(s) do próprio gerente.
- **Divergência difícil de auditar entre código e runtime:** `create-user` agora devolve `runtime_version`, e `/admin/usuarios` alerta quando essa assinatura não vier do backend.
- **Legado no cadastro de empresa:** `register-company` deixou de atualizar `profiles.company_id` e mantém apenas uma limpeza defensiva do vínculo legado na empresa padrão, se ele existir.

### 3. Arquivos alterados

- `supabase/functions/create-user/index.ts`
- `src/pages/admin/Users.tsx`
- `src/contexts/AuthContext.tsx`
- `supabase/functions/register-company/index.ts`
- `supabase/migrations/20260323170000_fix_user_roles_rls_and_profile_company_trigger.sql`

### 4. Ajustes de RLS realizados

A nova migration remove as policies amplas anteriores de `user_roles` e cria três policies explícitas:

1. `Users can view own user_roles`
   - permite ao usuário autenticado ler apenas os próprios vínculos;
2. `Gerentes and developers can view company user_roles`
   - permite leitura apenas quando `user_belongs_to_company(auth.uid(), company_id)` for verdadeiro;
3. `Gerentes and developers can manage company user_roles`
   - permite insert/update/delete apenas para gerente/developer dentro do mesmo escopo de `company_id`.

Resultado esperado:
- gerente não consegue mais enxergar/manipular vínculos de empresa alheia apenas por ser `is_admin()`;
- developer continua com bypass global somente porque `user_belongs_to_company` já prevê essa exceção oficialmente no projeto.

### 5. Ajustes no fluxo de criação de usuário

No `create-user`:

- o cadastro novo continua criando Auth + enriquecendo `profiles` + fazendo `upsert` explícito em `user_roles`;
- a atualização de `profiles` deixou de gravar `company_id` para não misturar dado cadastral com vínculo multiempresa;
- a resposta da function agora inclui `runtime_version`, tanto no caminho `created` quanto `linked_existing`;
- a tela `/admin/usuarios` registra warning quando o backend não devolve `runtime_version`, o que sinaliza runtime antigo/deploy divergente.

### 6. Ajustes no trigger/legado

No banco:
- `handle_new_user` foi redefinido para criar apenas `profiles` com `company_id = NULL`.

No `register-company`:
- a atualização do profile mantém apenas dados cadastrais (`name` e `phone`);
- a remoção de vínculo na empresa padrão foi preservada apenas como limpeza defensiva de legado histórico, com comentário explicando o motivo.

### 7. Estratégia de saneamento dos dados antigos

Como não houve acesso administrativo ao banco remoto nesta execução, o saneamento histórico foi mantido como plano operacional auditável, não como mutação automática arriscada.

#### Critério seguro proposto

1. localizar usuários com vínculo na empresa padrão `a0000000-0000-0000-0000-000000000001`;
2. separar três grupos:
   - usuários legítimos da empresa padrão;
   - usuários com vínculo também em outra empresa e sem uso real da empresa padrão;
   - usuários com apenas vínculo na empresa padrão, mas criados por fluxo que deveria mirar outra empresa;
3. revisar evidências de criação (`created_at`, e-mail, empresa de origem, histórico operacional);
4. corrigir apenas registros com evidência objetiva de contaminação;
5. executar limpeza em lote só após revisão manual e com backup/export prévio.

#### Consulta-base sugerida para auditoria

```sql
select
  ur.user_id,
  p.email,
  p.name,
  ur.company_id,
  ur.role,
  ur.created_at,
  array_agg(distinct ur2.company_id) as all_company_ids
from public.user_roles ur
join public.profiles p on p.id = ur.user_id
left join public.user_roles ur2 on ur2.user_id = ur.user_id
where ur.company_id = 'a0000000-0000-0000-0000-000000000001'
group by ur.user_id, p.email, p.name, ur.company_id, ur.role, ur.created_at
order by ur.created_at desc;
```

#### Regra de execução

- não remover automaticamente todo vínculo da empresa padrão;
- remover apenas vínculo classificado como contaminado após conferência operacional.

### 8. Riscos e cuidados

- se existir ambiente remoto ainda sem a migration/edge function nova, o warning de `runtime_version` vai aparecer e o deploy precisará ser concluído;
- remover `profiles.company_id` do fluxo oficial evita novas contaminações, mas pode expor dependências antigas que ainda presumam esse campo;
- o saneamento de dados históricos não deve ser automatizado sem revisão manual, para não excluir vínculos legítimos da empresa padrão;
- as novas policies de `user_roles` precisam ser aplicadas no banco para que a blindagem multiempresa fique efetiva em runtime.

### 9. Checklist de validação executado

#### Validações executadas nesta entrega

- [x] Build do frontend concluído com sucesso (`npm run build`).
- [x] Verificação de diff sem whitespace/broken patch (`git diff --check`).
- [x] Revisão manual do fluxo de criação em `create-user` para confirmar que o vínculo oficial continua em `user_roles`.
- [x] Revisão manual do `AuthContext` para confirmar remoção da prioridade de `profiles.company_id`.
- [x] Revisão manual da migration nova para confirmar escopo de `company_id` nas policies de `user_roles`.
- [x] Revisão manual do trigger `handle_new_user` para confirmar remoção da empresa padrão automática.

#### Validações bloqueadas por limitação do ambiente desta execução

- [ ] criar gerente novo em empresa não padrão no runtime remoto;
- [ ] criar vendedor novo em empresa não padrão no runtime remoto;
- [ ] criar motorista novo em empresa não padrão no runtime remoto;
- [ ] validar que cada um aparece apenas na empresa correta em ambiente publicado;
- [ ] validar que não aparece na empresa padrão sem motivo em ambiente publicado;
- [ ] validar via runtime remoto que vendedor exige `seller_id`;
- [ ] validar via runtime remoto que motorista exige `driver_id`;
- [ ] validar via runtime remoto que gerente não acessa vínculos de outra empresa;
- [ ] validar visualmente a tela `/admin/usuarios` publicada;
- [ ] validar visualmente a troca de empresa publicada;
- [ ] validar via payload remoto que o runtime publicado devolve `runtime_version`.

**Motivo do bloqueio:** tentativa de autenticação/requisição remota ao Supabase retornou `ENETUNREACH`/`fetch failed` neste ambiente, impedindo homologação online nesta execução.

### 10. Pendências, se houver

- publicar no Supabase a edge function `create-user` atualizada e a migration `20260323170000_fix_user_roles_rls_and_profile_company_trigger.sql`;
- repetir a homologação remota dos cenários de gerente, vendedor e motorista após deploy;
- executar o saneamento controlado dos vínculos históricos contaminados na empresa padrão após extração/auditoria dos registros;
- confirmar em ambiente publicado que o warning de `runtime_version` desaparece após o deploy correto.
