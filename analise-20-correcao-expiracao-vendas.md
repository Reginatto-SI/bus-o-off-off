# 1. Objetivo da correção

Aplicar a menor correção segura no fluxo de expiração/cancelamento exibido em `/admin/vendas`, eliminando a heurística paralela por `created_at` para o checkout público e reforçando a rastreabilidade da rotina oficial `cleanup-expired-locks`.

---

# 2. Problema confirmado

O problema confirmado era duplo:

1. a listagem `/admin/vendas` marcava compras como “expirado operacionalmente” usando `created_at + 15 min`, embora a fonte real do checkout público seja `seat_locks.expires_at`;
2. a rotina `cleanup-expired-locks` tinha logs úteis, porém insuficientes para auditoria objetiva por execução e por venda afetada.

Isso criava leitura híbrida na UI e dificultava rastrear por que uma venda permanecia aberta após a janela operacional.

---

# 3. Causa raiz tratada

## UI `/admin/vendas`

A causa raiz tratada foi a divergência entre:

- **fonte visual anterior**: `sales.created_at`
- **fonte real do backend**: `seat_locks.expires_at` para checkout público e `reservation_expires_at` para reserva manual

## Cleanup oficial

A causa raiz tratada na auditoria foi a falta de uma trilha estruturada e consistente por:

- execução do cleanup;
- venda candidata;
- venda cancelada;
- venda ignorada;
- falha de limpeza por etapa.

---

# 4. Arquivos alterados

- `src/pages/admin/Sales.tsx`
- `supabase/functions/cleanup-expired-locks/index.ts`

---

# 5. O que foi alterado na `/admin/vendas`

## Alteração principal

A listagem deixou de inferir vencimento do checkout público por `created_at`.

Agora o sinal auxiliar usa:

- `seat_locks.expires_at` carregado para as vendas da página atual, quando `status = pendente_pagamento`;
- `reservation_expires_at`, quando a venda está em `reservado` e carrega validade explícita de reserva manual.

## Ajuste semântico

O aviso auxiliar deixou de usar a narrativa ambígua baseada em heurística fraca e passou a usar textos técnicos/operacionais alinhados com a fonte real, por exemplo:

- `Limpeza operacional pendente`
- `Validade operacional vencida`

Isso preserva o badge principal como status oficial persistido e deixa claro que o aviso auxiliar não é um novo status de venda.

## Ajuste de carregamento

A tela passou a buscar `seat_locks` da página atual para montar `latestLockExpiryMap`, mantendo o escopo multiempresa via `company_id`.

---

# 6. O que foi alterado no `cleanup-expired-locks`

## Logs estruturados por execução

Foi adicionado um logging estruturado com:

- `execution_id`
- `stage`
- `action`
- `flow`
- `sale_id`
- `company_id`
- `payment_environment`
- `reason`
- `detail`
- totais agregados ao final

## Logs por decisão

A rotina agora registra explicitamente quando uma venda foi:

- candidata;
- cancelada;
- ignorada por lock ativo remanescente;
- ignorada por guard de status;
- afetada por falha de limpeza de `sale_passengers`, `seat_locks` ou `tickets`.

## Sale logs mais ricos

Os registros inseridos em `sale_logs` passaram a carregar descrição mais objetiva, incluindo o tipo do fluxo e o `payment_environment` quando disponível.

## Sem mudança de arquitetura

A rotina continua sendo a mesma edge function, acionada pelo mesmo agendamento já existente. Não foi criado job novo, tabela nova ou edge function nova.

---

# 7. O que permaneceu sem alteração

- a regra oficial de cancelamento continua no `cleanup-expired-locks`;
- o checkout público continua usando `seat_locks` como fonte da verdade operacional;
- a reserva manual continua usando `reservation_expires_at`;
- o badge principal da venda continua vindo do status persistido em `sales.status`;
- o fluxo público de checkout não foi reescrito;
- não houve criação de novo status de venda;
- não houve ramificação entre sandbox e produção.

---

# 8. Riscos evitados

- falso positivo visual por heurística baseada em `created_at`;
- leitura contraditória entre `/admin/vendas` e a lógica real do backend;
- suporte sem contexto suficiente para entender por que uma venda foi cancelada, ignorada ou falhou no cleanup;
- piora da ambiguidade entre status oficial e sinal técnico auxiliar.

---

# 9. Como validar manualmente

## Cenário 1 — checkout público dentro do prazo

1. criar uma venda pública nova;
2. abrir `/admin/vendas`;
3. confirmar que a venda aparece com status oficial `Aguardando Pagamento`;
4. confirmar que **não** aparece alerta de limpeza pendente enquanto o lock ainda estiver válido.

## Cenário 2 — checkout público com lock vencido e cleanup ainda não concluído

1. criar uma venda pública nova;
2. aguardar o vencimento real do `seat_locks.expires_at`;
3. abrir `/admin/vendas` antes do cancelamento persistido;
4. validar que o aviso auxiliar, se aparecer, usa a fonte do lock e a semântica técnica nova (`Limpeza operacional pendente`), sem depender de `created_at`.

## Cenário 3 — reserva manual vencida

1. criar ou ajustar uma venda manual `reservado` com `reservation_expires_at` vencido;
2. abrir `/admin/vendas`;
3. validar que o aviso auxiliar é baseado na validade da reserva manual, não em tempo de criação.

## Cenário 4 — auditoria do cleanup

1. executar o fluxo que dispare `cleanup-expired-locks`;
2. verificar os logs da edge function;
3. confirmar presença de `execution_id`, `stage`, `sale_id`, `company_id`, `payment_environment`, `flow`, `action` e `reason`;
4. confirmar log final consolidado com totais da execução.

---

# 10. Conclusão

A correção aplicada foi deliberadamente pequena e conservadora:

- alinhou `/admin/vendas` à mesma fonte de verdade operacional já usada pelo backend;
- removeu a heurística paralela por `created_at` para declarar expiração do checkout público;
- deixou o texto auxiliar menos ambíguo e mais técnico;
- fortaleceu a rastreabilidade do cleanup oficial sem alterar a arquitetura existente.

Com isso, a UI administrativa fica mais fiel ao estado real do fluxo, e a rotina oficial passa a deixar uma trilha mais auditável para suporte e diagnóstico.
