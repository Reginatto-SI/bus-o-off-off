# Análise 10 — Ajuste semântico e visual da venda de serviço avulsa

## 1. Diagnóstico do problema

A tela `/admin/vendas` e o modal de detalhes reutilizavam rótulos operacionais de passagem mesmo quando a venda era de serviço avulso (sem logística de embarque). Na prática, isso gerava ambiguidades como:

- quantidade exibida como `passagem(ns)`;
- exibição de `Poltrona` na listagem e no detalhe;
- exibição de `Horário de Embarque` no detalhe;
- aba `Passageiros` visível mesmo sem passageiros vinculados;
- fallback de cliente com texto `Venda avulsa de serviço`, pouco claro para operação.

## 2. Como foi identificada venda de serviço

Foi aplicada exclusivamente a regra já existente no sistema, sem nova flag:

- `trip_id` é `null` **e**
- `boarding_location_id` é `null`.

Implementação centralizada no helper `isStandaloneServiceSale(sale)` já existente em `Sales.tsx`.

## 3. Arquivos alterados

- `src/pages/admin/Sales.tsx`
- `src/pages/admin/ServiceSales.tsx`
- `docs/Analises/analise-10-ajuste-visual-venda-servico.md`

## 4. Ajustes feitos

### 4.1 `/admin/vendas` (listagem)

Para vendas identificadas como serviço avulso:

- quantidade passa a usar `serviço/serviços` (em vez de `passagem/passagens`);
- linha de `Poltr.` deixa de ser exibida;
- texto de embarque `Sem embarque — serviço avulso` foi mantido.

Além disso, o nome do cliente agora usa fallback semântico:

- `Cliente não informado (venda de serviço)` quando vazio ou legado `Venda avulsa de serviço`.

### 4.2 Modal de detalhes

Na aba **Dados da Venda**:

- adicionado campo `Tipo: Venda de serviço avulsa`;
- `Horário de Embarque` ocultado para serviço avulso;
- `Poltrona(s)` ocultado para serviço avulso;
- quantidade passa a explicitar `serviço(s)` para esse caso;
- `Evento`, `Valor` e `Status` permanecem.

Na aba **Passageiros**:

- aba inteira fica oculta quando `detailTickets.length === 0`.

### 4.3 Nome do serviço no detalhe

Sem alterar banco, foi adicionada recuperação do nome via `sale_logs`:

- busca do log `action = service_item_registered`;
- leitura de `new_value.service_name` (JSON) com fallback por regex na `description`.

Quando encontrado, exibe `Serviço: <nome>` em **Dados da Venda**.

### 4.4 Texto do cliente no fluxo de venda de serviços

No fluxo `/vendas/servicos`, o fallback de comprador foi atualizado para:

- `Cliente não informado (venda de serviço)`

Isso já reduz novos registros com texto legado.

## 5. Limitações

- O nome do serviço no detalhe depende da existência de log `service_item_registered` em `sale_logs`.
- Registros antigos sem esse log continuam sem nome de serviço explícito na tela (mantendo comportamento seguro, sem inventar dado).

## 6. O que ficou fora de escopo

Conforme solicitado, **não** foi feito:

- criação de tabela nova (`sale_items`);
- alteração de schema/banco;
- mudança de arquitetura;
- alteração do checkout de passagens;
- mudanças em pagamento/QR/validação.

## 7. Checklist final

- [x] Venda de serviço não parece passagem na listagem (quantidade semântica ajustada).
- [x] Venda de serviço não exibe poltrona na listagem.
- [x] Venda de serviço não exibe poltrona no detalhe.
- [x] Venda de serviço não exibe horário de embarque no detalhe.
- [x] Aba passageiros ocultada quando não há passageiros.
- [x] Tipo da venda explicitado como `Venda de serviço avulsa`.
- [x] Fallback de cliente atualizado para `Cliente não informado (venda de serviço)`.
- [x] Nome do serviço recuperado via `sale_logs` quando disponível.
