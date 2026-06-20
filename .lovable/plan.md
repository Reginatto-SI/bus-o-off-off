## Diagnóstico

Investiguei diretamente o banco e o frontend:

- `public.companies` tem **33 registros**. ✅
- A função `public.get_company_activation_report()` **existe** e está com o corpo correto (LEFT JOINs em `events`, `sales`, `vehicles`, `drivers`, agregados com `COALESCE(..,0)`, retorno apenas de campos seguros — nenhuma `asaas_api_key_*`). ✅
- Todas as colunas usadas (`legal_name`, `trade_name`, `cnpj`, `document`, `whatsapp`, `asaas_*`, etc.) existem em `companies`. ✅
- Existe **1 usuário developer** real em `user_roles` (`27add21e-ade9-436a-9ec2-185a3d7819cc`), então o guard `is_developer(auth.uid())` não é o problema. ✅
- A tela `src/pages/admin/CompanyActivationReport.tsx` já chama a RPC corretamente, mapeia os campos e tem `Navigate` para não-developer. ✅

**Causa real (encontrada via `information_schema.routine_privileges`):**

```
   grantee    | privilege_type
--------------+----------------
 sandbox_exec | EXECUTE
```

A função **não tem `GRANT EXECUTE` para `authenticated`**. Quando o frontend chama `supabase.rpc('get_company_activation_report')`, PostgREST executa como `authenticated` e recebe `42501 permission denied for function get_company_activation_report`. O `try/catch` da página captura, mostra o toast "Não foi possível carregar…" e `rows` permanece `[]` — exatamente o sintoma relatado (zeros + empty state).

A migration que recriou a RPC (`CREATE OR REPLACE`) preservou o owner, mas como o `CREATE OR REPLACE` não reaplicou GRANTs e nenhuma migration concedeu execute a `authenticated`, a função ficou inacessível pelo Data API.

## Correção (mínima)

Uma única migration, sem tocar em RPC, frontend, RLS ou regra de negócio:

```sql
-- A proteção real continua dentro da função (is_developer(auth.uid())).
-- Sem este GRANT, PostgREST devolve 42501 antes mesmo de executar o corpo.
GRANT EXECUTE ON FUNCTION public.get_company_activation_report() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_company_activation_report() FROM anon, public;
```

Justificativa de segurança (atende todas as restrições do pedido):
- `anon`/`public` permanecem **sem** execute → endpoint não é exposto a anônimos.
- `authenticated` ganha execute, mas o **primeiro statement da função** é `IF NOT public.is_developer(auth.uid()) THEN RAISE EXCEPTION ... USING ERRCODE = '42501'`, ou seja, qualquer usuário autenticado que não seja developer continua bloqueado pelo próprio banco.
- Nenhuma `asaas_api_key_*` é retornada (a função já não seleciona essas colunas).
- Item de menu / `Navigate` no frontend continuam exclusivos para developer.

## Pequeno reforço de diagnóstico no frontend (opcional, escopo mínimo)

O `catch` em `CompanyActivationReport.tsx` já loga `message/code/details/hint`. Vou manter como está — nada a mudar. Se em algum suporte futuro a RPC voltar a falhar, o `code` 42501 fica visível no console e o toast amigável segue para o usuário.

## Validação

1. Aplicar a migration.
2. Conferir `routine_privileges` mostrando `authenticated | EXECUTE`.
3. Acessar `/admin/relatorios/empresas-ativacao` como developer → 33 empresas listadas, cards com números reais, empresas sem eventos/Asaas/frota/motoristas aparecem com contador 0 e status Asaas "Não cadastrado"/"Parcial".
4. Acessar como não-developer → `Navigate` redireciona; mesmo que chame a RPC manualmente, recebe `42501` do guard interno.

## Fora de escopo (não será tocado)

- Checkout, vendas, webhook Asaas, fluxo financeiro.
- Lógica da RPC, lógica da tela, layout, tipagem.
- Outras migrations / outras RPCs.
