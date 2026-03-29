## 1. Resumo executivo

A RPC `get_benefit_eligibility_matches` retornava `404 (Not Found)` no checkout público porque a função não estava disponível no ambiente efetivamente usado pelo frontend (sintoma operacional típico de migration não aplicada/divergência de ambiente).

Correção aplicada: foi adicionada uma migration de garantia (`create or replace`) para recriar/publicar a função em `public` com a assinatura esperada pelo frontend e com `GRANT EXECUTE` para `anon`, `authenticated` e `service_role`.

## 2. Evidência técnica

- **Nome da função**: `public.get_benefit_eligibility_matches`
- **Assinatura SQL**:
  - `p_company_id uuid`
  - `p_event_id uuid`
  - `p_cpf text`
  - `p_reference_date date default current_date`
- **Migration original auditada**: `supabase/migrations/20260329143000_add_secure_benefit_eligibility_rpc.sql`
- **Migration de correção/garantia**: `supabase/migrations/20260329170000_ensure_benefit_eligibility_rpc_available.sql`

Compatibilidade com frontend confirmada em `src/lib/benefitEligibility.ts`:
- chamada RPC: `supabase.rpc('get_benefit_eligibility_matches', ...)`
- parâmetros enviados: `p_company_id`, `p_event_id`, `p_cpf`, `p_reference_date`

Ou seja: **nome e assinatura estão alinhados 1:1 entre frontend e SQL**.

## 3. Causa raiz

Causa raiz mais provável com base na evidência do 404:
- a função não estava presente no banco/projeto Supabase ativo no runtime do checkout (migration ausente no ambiente, ou deploy em projeto diferente do esperado).

Não há evidência de incompatibilidade de assinatura no código versionado; o problema é de disponibilidade no ambiente.

## 4. Correção aplicada

Foi criada migration idempotente de garantia:
- `supabase/migrations/20260329170000_ensure_benefit_eligibility_rpc_available.sql`

Ela:
1. recria a função em `public` via `create or replace function`;
2. mantém assinatura esperada pelo frontend;
3. mantém `security definer` e `search_path = public`;
4. reaplica `comment on function`;
5. reaplica permissões de execução para `anon`, `authenticated`, `service_role`.

Objetivo: eliminar cenário de ambiente sem função e remover causa de 404 na rota `/rest/v1/rpc/get_benefit_eligibility_matches`.

## 5. Checklist de validação

- [ ] RPC responde sem 404: `POST /rest/v1/rpc/get_benefit_eligibility_matches`
- [ ] Checkout público deixa de registrar fallback por função ausente
- [ ] Fluxo de benefício volta a ter chance real de resolução (match x sem-match por regra)
- [ ] Ambiente preview/lovable e ambiente de produção apontam para o projeto Supabase esperado
- [ ] Histórico de migrations no projeto alvo inclui `20260329170000_ensure_benefit_eligibility_rpc_available.sql`

## Nota operacional importante

Se, após deploy desta migration, ainda houver 404, o problema remanescente é de configuração operacional de ambiente/projeto (URL/chave/projeto Supabase divergentes), não de assinatura de função no repositório.
