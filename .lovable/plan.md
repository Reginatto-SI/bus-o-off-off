
## Validação prévia (já executada em leitura no banco)

- **Representante 7 FEST**: encontrado com código `REP8AD8856` (id `f6deb040-083e-4e4d-b399-0f7f04ba67c4`, status `ativo`, CNPJ 25.029.744/0001-60).
- **JD Turismos e Viagens** (JD Viagens excursões, CNPJ 46.195.166/0001-01): encontrada (id `c75a342f-9eca-437a-a785-e5920c0fe616`, ativa). Sem vínculo atual em `representative_company_links`.
- **Jefferson Rodrigo de Oliveira Santos** (JG Excursões e Turismo, CNPJ 67.661.882/0001-07): encontrada (id `b371d5a9-f181-438a-9a8a-669504c68201`, ativa). Sem vínculo atual em `representative_company_links`.
- Nenhum conflito com outro representante.

## Ação

Inserir dois registros em `representative_company_links` seguindo exatamente o mesmo padrão da edge function `register-company` (fluxo atual da Fase 1):

```sql
INSERT INTO public.representative_company_links
  (company_id, representative_id, link_source, source_code, source_context, linked_at, locked)
VALUES
  ('c75a342f-9eca-437a-a785-e5920c0fe616',
   'f6deb040-083e-4e4d-b399-0f7f04ba67c4',
   'url_ref', 'REP8AD8856',
   jsonb_build_object('reason','backfill_manual','note','Vínculo retroativo anterior ao fix do fluxo de representantes'),
   now(), true),
  ('b371d5a9-f181-438a-9a8a-669504c68201',
   'f6deb040-083e-4e4d-b399-0f7f04ba67c4',
   'url_ref', 'REP8AD8856',
   jsonb_build_object('reason','backfill_manual','note','Vínculo retroativo anterior ao fix do fluxo de representantes'),
   now(), true);
```

## Garantias

- Apenas duas linhas novas em `representative_company_links`.
- **Nada** em `sales`, `representative_commissions`, wallets, splits ou percentuais é tocado — sem comissão retroativa.
- Sem alteração de schema, RLS, código de frontend, edge functions ou dados cadastrais das empresas.
- Sem duplicidade: as duas empresas não possuem vínculo hoje.

## Resultado esperado em `/admin/representante` (7 FEST)

- 2 empresas indicadas.
- Empresas ativas = 2 (ambas estão `is_active = true`).
- Listagem mostrando JD Viagens excursões e JG Excursões e Turismo.
- Ledger de comissões inalterado.
