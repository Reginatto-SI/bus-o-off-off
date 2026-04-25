# 1. Resumo do que foi implementado

Foi implementada a fase 1 de correção controlada do passageiro dentro do fluxo já existente em `/admin/vendas > Ver Detalhes > Passageiros`, sem criar nova tela ou arquitetura.

Entregas principais:
- inclusão de edição de **telefone** do passageiro no modal existente;
- manutenção de edição de **nome**;
- formalização da mudança de **CPF** como correção sensível com **motivo obrigatório** quando houver alteração;
- bloqueio de edição em venda cancelada e em passagem com status operacional diferente de `pendente`;
- reforço da trilha de auditoria em `sale_logs` com mensagens padronizadas e valores antes/depois.

# 2. Arquivos alterados

- `src/pages/admin/Sales.tsx`
- `analise-2-implementacao-fase1-edicao-passageiro.md`

# 3. Regras aplicadas

- Fluxo mantido 100% dentro de `/admin/vendas` (aba Passageiros do modal de detalhes).
- Campos tratados nesta fase:
  - Nome (edição simples)
  - Telefone (edição simples)
  - CPF (correção formal com motivo obrigatório quando alterado)
- Persistência focada em `tickets` (fonte operacional do passageiro), sem sincronização paralela em outras tabelas fora do escopo.

# 4. Como ficou a lógica de bloqueio

A edição agora é bloqueada quando:
- venda está `cancelado`;
- venda não está em `reservado` ou `pago`;
- ticket está com `boarding_status` diferente de `pendente`.

Comportamento de UX aplicado:
- botão de edição por linha fica desabilitado quando bloqueado;
- tooltip (`title`) informa o motivo;
- tentativa de abertura também retorna `toast` com motivo objetivo.

# 5. Como ficou a lógica de correção de CPF

- O modal continua no mesmo ponto da UI, mas com contexto textual de “correção oficial”.
- Quando o CPF é modificado em relação ao valor original do ticket:
  - abre seção destacada de correção formal;
  - exige motivo obrigatório;
  - sem motivo, o save é bloqueado com feedback claro.
- `sale_logs.action` diferencia operação de CPF (`cpf_corrigido`) da edição simples (`passageiro_editado`).

# 6. Como ficou a auditoria/log

Foi mantido o reaproveitamento de `sale_logs` (sem nova arquitetura), com maior padronização:
- descrição clara da ação;
- `old_value` e `new_value` com nome, telefone e CPF;
- para CPF corrigido, inclui motivo no registro;
- mantém `performed_by`, `sale_id`, `company_id` e timestamp padrão da tabela.

# 7. Riscos que permanecem fora do escopo

- Não houve criação de trilha estruturada por campo em tabela dedicada (mantido padrão textual de `sale_logs`).
- Não foi implementado remanejamento de embarque/viagem/assento.
- Não foi adicionada reconciliação automática com `sales.customer_*` (escopo segue focado no passageiro operacional em `tickets`).

# 8. Sugestão objetiva para fase 2

- Estruturar logs por campo em formato mais analítico (sem quebrar legado).
- Definir política de exceção para correções pós check-in com governança explícita de permissão.
- Avaliar política de reconciliação comprador (`sales`) x passageiro (`tickets`) para cenários específicos de suporte.
