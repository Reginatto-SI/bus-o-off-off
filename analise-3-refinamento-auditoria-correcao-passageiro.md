# 1. Resumo do refinamento aplicado

Foi aplicado um refinamento cirúrgico no fluxo já existente de correção de passageiro em `/admin/vendas`, com foco em eliminar o risco de atualizar `tickets` sem garantir auditoria mínima em `sale_logs`.

Principais ajustes:
- validação obrigatória de `user` e `activeCompanyId` antes de qualquer update;
- update de `tickets` com escopo explícito de `company_id`;
- inserção de log tratada como etapa obrigatória da conclusão;
- em falha de log, rollback compensatório do ticket para os valores originais;
- feedback de erro coerente quando a auditoria falha.

# 2. Problema de segurança/auditoria que existia

Antes do refinamento, o fluxo poderia executar `update` em `tickets` e depois falhar ao inserir `sale_logs`.

Resultado possível:
- dado do passageiro alterado;
- ausência de trilha de auditoria correspondente.

Isso gerava risco de correção operacional sem rastreabilidade.

# 3. Estratégia escolhida

Estratégia mínima adotada (sem nova arquitetura):
1. validar contexto obrigatório (`editingTicket`, `detailSale`, `user`, `activeCompanyId`) antes de atualizar;
2. manter update no frontend com Supabase (padrão já usado na tela);
3. tornar log obrigatório;
4. se o log falhar, executar rollback compensatório no `tickets`.

Motivo da escolha:
- não há, no fluxo atual de `/admin/vendas`, RPC transacional já pronta para essa operação composta;
- solução mantém escopo curto e previsível;
- reduz risco de “sucesso sem auditoria”.

# 4. Arquivos alterados

- `src/pages/admin/Sales.tsx`
- `analise-3-refinamento-auditoria-correcao-passageiro.md`

# 5. Como ficou a validação de contexto

Agora o save bloqueia antes do update quando faltar:
- `editingTicket`;
- `detailSale`;
- `user`;
- `activeCompanyId`.

Mensagem de erro objetiva é exibida ao operador quando o contexto de auditoria não está disponível.

# 6. Como ficou a garantia de auditoria

Novo comportamento:
1. tenta update do ticket;
2. tenta gravação do log obrigatório;
3. se log falhar, tenta rollback para valores originais;
4. operação só é considerada sucesso quando update + log concluem corretamente.

Também foi reforçado escopo multiempresa com `.eq('company_id', activeCompanyId)` no update e no rollback.

# 7. Limitações remanescentes

- Continua sendo proteção compensatória no cliente (não é transação SQL atômica no banco).
- Em falha simultânea de log e rollback, o sistema informa erro crítico, mas ainda depende de suporte operacional para reconciliação manual.

# 8. Conclusão objetiva

O fluxo permaneceu no mesmo ponto de UX e no mesmo escopo funcional, mas ficou mais robusto:
- não atualiza sem contexto de auditoria;
- não finaliza correção sem log;
- trata falha de log como falha real da operação;
- mantém aderência à diretriz de mudança mínima e multiempresa.
