# Análise 1 — templates-layout: duplicidade e permissão

## Resumo executivo
- O erro reportado ao salvar edição de layout nasce no fluxo de persistência da tela `/admin/templates-layout`.
- A exceção de acesso do usuário `f1ba5ea7-2d3d-4171-b651-c1917655e5b1` está implementada em frontend e backend (RLS), portanto **não há evidência de bloqueio primário de acesso para esse usuário**.
- A causa raiz principal identificada para o falso cenário de “duplicidade” foi a ordem das operações de salvamento: o sistema fazia `upsert` antes de deletar itens removidos, podendo disparar violação de unicidade de `seat_number` durante movimentação de assento (mudança de coordenada).
- Também existia mensagem genérica para `23505`, o que mascarava a causa operacional exata.

## Diagnóstico

### 1) Fluxo de acesso e permissões
Confirmado no código:
- Rota `/admin/templates-layout` existe no app.
- O controle de acesso da tela usa `canAccessTemplatesLayout`.
- A exceção por `user_id` está centralizada no helper de acesso.
- No backend, policies de `template_layouts`, `template_layout_items` e `template_layout_versions` aceitam `developer` **ou** função `is_templates_layout_exception_user(auth.uid())`.

Conclusão:
- O usuário excepcional consegue atravessar as camadas de autorização previstas para essa tela, sem alteração de role.
- Não foi encontrado branch específico que negue salvar apenas para o usuário de exceção quando ele já acessa a tela.

### 2) Validação de duplicidade
Validação em duas camadas:
- **Frontend (`validateItems`)**: bloqueia duplicidade de posição, número no mesmo pavimento, número repetido entre pavimentos, assento sem categoria, assento sem número e coordenadas fora da grade.
- **Banco (constraints)**:
  - unicidade por posição `(template_layout_id, floor_number, row_number, column_number)`
  - unicidade de assento por template `(template_layout_id, seat_number)` quando `seat_number` não é nulo.

### 3) Ponto exato do erro
No fluxo anterior de `handleSave`:
1. carregava itens existentes;
2. fazia `upsert` dos itens atuais;
3. só depois removia os itens excluídos do editor.

Quando o usuário move um assento (mesmo número, nova coordenada), o item antigo ainda existe no banco no momento do `upsert`, e a unique de `seat_number` pode gerar `23505` antes do delete.

Resultado prático:
- a UI mostra “duplicidade” mesmo quando o estado final do editor está válido.
- isso se comporta como falso positivo operacional para edição com movimentação.

### 4) Erro mascarado
A mensagem anterior de `23505` era genérica (“dados duplicados...” sem detalhar qual constraint), reduzindo a capacidade de suporte.

## Fluxo atual encontrado (após ajuste mínimo)
1. Validação local (`validateItems`).
2. Persistência de template (`template_layouts`).
3. Leitura de itens existentes.
4. **Delete dos itens removidos**.
5. Upsert dos itens finais.
6. Probe de confirmação quando `upsert` retorna vazio.

## Causa raiz
- **Causa confirmada:** ordem de persistência inconsistente com as constraints de unicidade (`upsert` antes de `delete`) ao editar/mover assentos.
- **Causa secundária confirmada:** mensagem de erro `23505` genérica demais, sem contexto de operação/constraint.
- **Não confirmado como causa atual:** bloqueio exclusivo de permissão para usuário excepcional (há exceção implementada em auth + RLS).

## Ajuste mínimo aplicado
1. Reordenado o salvamento de itens para remover itens antigos antes do `upsert`, evitando conflito transitório de `seat_number` durante movimentação.
2. Melhoria de mensagens de erro:
   - diferencia duplicidade por número de assento (`idx_template_layout_items_unique_seat_number`)
   - diferencia duplicidade por posição (`template_layout_id_floor_number_row_number_column_number_key`)
   - adiciona contexto operacional de etapa (`Origem: ...`) para suporte.
3. Mantida validação existente; sem remoção de regra de negócio e sem alteração arquitetural.

## Arquivos alterados
- `src/pages/admin/TemplatesLayout.tsx`
- `analise-1-templates-layout-duplicidade-e-permissao.md`

## Regras de permissão envolvidas
- Frontend: `canAccessTemplatesLayout` (AuthContext + helper de exceção por `user_id`).
- Backend: RLS via função `public.is_templates_layout_exception_user(auth.uid())` aplicada nas policies do catálogo de templates layout.

## Exemplos da nova mensagem de erro
- “Não foi possível salvar porque existe número de assento duplicado no template. Revise os assentos repetidos. Origem: persistência de itens do layout.”
- “Não foi possível salvar porque existe posição duplicada no layout (mesmo pavimento, linha e coluna). Origem: persistência de itens do layout.”
- “Falha ao salvar layout. Origem: remoção de itens antigos (permissão parcial ou RLS).”

## Riscos e validações realizadas
### Riscos
- Baixo risco funcional: mudança localizada no `handleSave`.
- Risco residual conhecido: sem transação explícita envolvendo todas as etapas do save (comportamento já existente).

### Validações realizadas nesta entrega
- Inspeção estática do fluxo de acesso, save e RLS.
- Execução de lint para garantir consistência de build/qualidade local.

### Checklist solicitado
- **Usuário developer**: validado por análise estática do gate/policies.
- **Usuário excepcional** `f1ba5ea7-2d3d-4171-b651-c1917655e5b1`: validado por análise estática do gate/policies.
- **Salvar layout válido sem duplicidade**: coberto pela preservação de validações + ajuste de ordem de persistência.
- **Bloquear duplicidade real**: mantido por validação local + constraints do banco.
- **Mensagem específica para duplicidade real**: implementado.
- **Mensagem operacional para erro interno**: implementado com contexto de origem.
- **Sem quebra multiempresa/company_id**: sem alteração de políticas de company scope nesta entrega.

## Dúvidas remanescentes
- Não foi executado teste E2E com sessão real dos dois usuários no ambiente remoto nesta entrega. A confirmação final de homologação operacional deve ocorrer em ambiente com dados reais e autenticação real.
