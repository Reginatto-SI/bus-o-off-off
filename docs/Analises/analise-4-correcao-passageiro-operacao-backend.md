# 1. Resumo da mudança

A correção de passageiro em `/admin/vendas` foi migrada de uma lógica composta no frontend (update + log + rollback) para uma operação única no backend via RPC `public.correct_sale_passenger`.

A UX do operador foi mantida no mesmo modal e no mesmo fluxo.

# 2. Problema do modelo anterior

No modelo anterior, o cliente coordenava:
- update em `tickets`;
- insert em `sale_logs`;
- rollback compensatório se o log falhasse.

Isso funcionava, mas mantinha complexidade e risco residual no cliente para uma operação sensível.

# 3. Estratégia escolhida

Foi escolhida uma **RPC SQL com validação + persistência + auditoria** em uma única função PL/pgSQL:
- abordagem simples para a stack atual;
- execução única no backend;
- commit único da transação da função (falha em qualquer etapa aborta tudo).

# 4. Arquivos alterados

- `supabase/migrations/20260328153000_create_correct_sale_passenger_rpc.sql`
- `src/pages/admin/Sales.tsx`
- `analise-4-correcao-passageiro-operacao-backend.md`

# 5. O que foi movido para o backend

Dentro da RPC `correct_sale_passenger`:
- validação de autenticação e pertencimento à empresa (`user_belongs_to_company`);
- validação de ticket/venda/empresa;
- validação de status da venda (`reservado`/`pago`) e `boarding_status = pendente`;
- validação de nome, CPF, telefone e motivo obrigatório quando CPF muda;
- update de `tickets`;
- insert obrigatório em `sale_logs` com `action` adequada (`cpf_corrigido` ou `passageiro_editado`).

# 6. O que foi simplificado no frontend

`Sales.tsx` deixou de coordenar manualmente:
- update direto em `tickets`;
- gravação de `sale_logs`;
- rollback compensatório.

Agora o frontend:
1. valida UX mínima;
2. chama RPC;
3. trata sucesso/erro;
4. atualiza o detalhe da venda.

# 7. Como ficou a garantia de atomicidade/consistência

- A operação sensível passou a ocorrer no backend em uma única função SQL.
- Se qualquer validação/persistência falhar (incluindo log), a função lança erro e a transação é abortada.
- Resultado prático: não há sucesso parcial de update sem auditoria dentro dessa operação.

# 8. Limitações remanescentes

- A consistência depende da execução pela RPC; alterações diretas fora da função continuam possíveis para outros fluxos administrativos se não houver restrições adicionais.
- O frontend ainda mantém validações de UX por usabilidade, mas a regra de segurança passa a ser confiada ao backend.

# 9. Conclusão objetiva

O escopo permaneceu cirúrgico:
- mesmo fluxo de tela;
- sem mexer em embarque/assento/viagem;
- sem tocar checkout/pagamentos/webhooks.

A robustez aumentou ao centralizar update + auditoria em operação única backend, reduzindo complexidade e risco no cliente.
