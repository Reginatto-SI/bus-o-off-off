## 1. Resumo executivo
A causa raiz **confirmada** do erro `failed to parse select parameter` na carga de `/admin/programas-beneficio` é a presença de **comentário SQL literal (`-- ...`) dentro da string passada para `.select(...)`** do Supabase/PostgREST. O parser de `select` do PostgREST não aceita comentários nesse payload e falha antes de executar a query. Nível de confiança: **muito alto** (evidência direta no código).

Há também um ponto estrutural relevante: existem **múltiplas FKs possíveis** entre `benefit_program_event_links`/`benefit_program_eligible_cpf` e `benefit_programs` (FK simples e FK composta com `company_id`), então a desambiguação com `!foreign_key_name` faz sentido e está alinhada ao cenário real. Porém, no erro atual, o bloqueio principal ocorre antes disso, no parse da string.

## 2. Arquivo(s) e trecho(s) responsáveis
### Tela de listagem (`/admin/programas-beneficio`)
- **Arquivo:** `src/pages/admin/BenefitPrograms.tsx`
- **Função:** `fetchPrograms`
- **Trecho crítico:** chamada `supabase.from('benefit_programs').select(...)` contendo comentário `--` dentro da string multilinha.

### Trecho equivalente com mesmo risco (edição de programa)
- **Arquivo:** `src/pages/admin/BenefitProgramEditor.tsx`
- **Função:** `fetchProgram`
- **Trecho crítico:** também usa `.select(...)` com comentário `--` dentro da string.

> Observação: o erro reportado é da tela de listagem, mas o mesmo padrão inválido foi replicado na tela de edição e tende a falhar da mesma forma quando executado.

## 3. Query atual identificada
Na listagem (`fetchPrograms`), a consulta atual está nesse formato:

```ts
.select(`
  *,
  -- Comentário: desambiguação explícita dos FKs evita erro PGRST201 quando existem múltiplas relações possíveis.
  event_links:benefit_program_event_links!benefit_program_event_links_benefit_program_id_fkey(
    event_id,
    event:events!benefit_program_event_links_event_id_fkey(name)
  ),
  eligible_cpf:benefit_program_eligible_cpf!benefit_program_eligible_cpf_benefit_program_id_fkey(*)
`)
```

String efetivamente enviada no `select`: inclui o token `--` e texto livre em linha de comentário, que não pertence à gramática de `select` do PostgREST.

## 4. Diagnóstico técnico da falha
### Causa confirmada
1. O frontend monta um `select` textual multilinha.
2. A string contém `-- Comentário: ...`.
3. O PostgREST tenta parsear `select` como expressão relacional, **não como SQL completo**.
4. O token `--` é inválido nesse contexto e dispara `failed to parse select parameter`.

### Por que não é (neste momento) erro principal de ambiguidade
- A desambiguação `!benefit_program_event_links_benefit_program_id_fkey` e `!benefit_program_eligible_cpf_benefit_program_id_fkey` está sintaticamente no formato esperado para resolver múltiplas relações.
- O parser quebra antes de qualquer validação semântica de relacionamento.

### Hipótese secundária (não causa atual, mas risco real)
- Se os nomes das constraints usados após `!` divergirem do schema real em algum ambiente desatualizado, pode surgir erro posterior (ex.: relacionamento não encontrado/ambíguo). Na base tipada deste projeto, os nomes batem com as FKs existentes.

## 5. Estrutura relacional validada
Com base na migration e nos tipos gerados:

### Tabela `benefit_program_eligible_cpf`
Relações para `benefit_programs`:
- `benefit_program_eligible_cpf_benefit_program_id_fkey` (`benefit_program_id -> benefit_programs.id`)
- `benefit_program_eligible_cpf_company_match_fk` (`benefit_program_id, company_id -> benefit_programs.id, company_id`)

### Tabela `benefit_program_event_links`
Relações para `benefit_programs`:
- `benefit_program_event_links_benefit_program_id_fkey` (`benefit_program_id -> benefit_programs.id`)
- `benefit_program_event_links_company_match_fk` (`benefit_program_id, company_id -> benefit_programs.id, company_id`)

Relação para `events`:
- `benefit_program_event_links_event_id_fkey` (`event_id -> events.id`)

### Conclusão relacional
- Existe ambiguidade potencial de caminho para `benefit_programs` (FK simples + composta), então usar `!fk_name` é justificável.
- Os nomes de FK usados na query estão consistentes com migration/tipos.

## 6. Opções de ajuste
### Opção A — Remover comentários da string `select` e manter desambiguação atual (mínima)
- **Como:** retirar apenas linhas `-- ...` de dentro do template string; manter aliases e `!fk_name` como estão.
- **Prós:** mudança mínima, baixo risco, preserva shape (`event_links`, `eligible_cpf`) e comportamento atual.
- **Contras:** mantém dependência explícita de nomes de constraint (acoplamento ao schema).

### Opção B — Remover comentários e tentar reduzir desambiguação
- **Como:** retirar `!fk_name` em relações onde pareça desnecessário.
- **Prós:** consulta visualmente mais curta.
- **Contras:** em cenário com múltiplas FKs, pode reintroduzir erro de ambiguidade (PGRST201). Não é a opção mais segura sem validação por ambiente.

### Opção C — Extrair select para constante utilitária sem comentários inline
- **Como:** centralizar string limpa em constante compartilhada para listagem/edição.
- **Prós:** evita repetição e divergência futura.
- **Contras:** já é micro-refatoração; foge do ajuste mínimo pedido para correção imediata.

## 7. Recomendação principal
Recomendo a **Opção A** como ajuste mínimo, seguro e aderente ao padrão atual:
1. remover comentários `-- ...` de dentro do `.select(...)`;
2. manter aliases (`event_links`, `eligible_cpf`, `event`) e `!fk_name` exatamente como estão;
3. aplicar o mesmo saneamento em `BenefitProgramEditor` para evitar erro equivalente no fluxo de edição.

Isso corrige a causa raiz confirmada sem alterar contrato de dados da tela.

## 8. Impactos esperados
### Deve continuar funcionando sem mudança de contrato
- filtros e estatísticas da listagem;
- contagem de `eligible_cpf`;
- renderização de escopo por quantidade de `event_links`;
- exportações que dependem do mesmo shape carregado.

### Pontos que exigem reteste após ajuste
- carregamento inicial de `/admin/programas-beneficio`;
- abertura de `/admin/programas-beneficio/:id` (mesmo padrão de select na edição);
- ausência de regressão nos aliases usados no frontend.

### Multiempresa (`company_id`)
- A listagem já filtra `benefit_programs` por `.eq('company_id', activeCompanyId)`.
- O schema reforça isolamento por:
  - FKs compostas `(..., company_id)`;
  - trigger de consistência entre `benefit_program_event_links` e `events` por empresa;
  - políticas RLS por pertencimento à empresa.

Não há evidência de quebra de isolamento multiempresa causada por este erro de parse; o problema atual é sintático.

## 9. Checklist de validação pós-ajuste
Quando for aplicar a correção, validar:

- [ ] `/admin/programas-beneficio` carrega sem `failed to parse select parameter`.
- [ ] `/admin/programas-beneficio/:id` também carrega sem parse error.
- [ ] Resposta mantém campos esperados: `event_links`, `eligible_cpf`, `event.name`.
- [ ] Filtros/estatísticas da listagem continuam corretos.
- [ ] Exportação (Excel/PDF) mantém dados esperados.
- [ ] Escopo por `company_id` permanece respeitado (empresa ativa A não visualiza dados da empresa B).
- [ ] Não houve necessidade de alterar tipos/shape no frontend além da limpeza do `select`.
