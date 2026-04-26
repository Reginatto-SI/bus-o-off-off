# Análise 111 — Backend de QR e consumo unitário de serviços

## 1. Resumo executivo

Foi criada a camada backend mínima para suportar a futura validação operacional de serviços por QR próprio, sem alterar a validação de passagens.

Nesta etapa foram entregues:
- RPC para resolver QR de serviços no nível da venda (`resolve_service_qr`);
- RPC para consumo unitário com proteção de concorrência (`consume_service_item`);
- trilha de auditoria operacional dedicada (`service_item_validations`).

Com isso, a próxima etapa no `/validador` já pode consumir backend seguro para listar itens e efetuar baixa unitária.

---

## 2. Decisão técnica mínima

### RPCs criadas
1. `resolve_service_qr(p_service_qr_code_token text)`
2. `consume_service_item(p_sale_service_item_id uuid, p_service_qr_code_token text default null)`

### Como o QR de serviços é resolvido
- a RPC busca `sales.service_qr_code_token`;
- valida escopo da empresa do usuário autenticado;
- bloqueia QR inexistente, venda cancelada e venda não paga;
- bloqueia explicitamente `pendente_taxa` com reason code dedicado;
- retorna dados da venda + lista de itens (`sale_service_items`) com flag de consumibilidade.

### Como o consumo unitário é protegido
- valida empresa, venda, status da venda, status do item, tipo de controle e saldo;
- aplica `UPDATE` condicional com guarda (`status = ativo`, `control_type = validacao_obrigatoria`, `quantity_used < quantity_total`) no próprio SQL;
- quando `ROW_COUNT = 0`, retorna bloqueio de concorrência (`concurrent_update_blocked`).

### Onde a auditoria foi registrada
- nova tabela `service_item_validations`, registrando sucesso e bloqueio, com saldo antes/depois, usuário e motivo.

---

## 3. Arquivos alterados

1. `supabase/migrations/20260426152000_create_service_qr_resolution_and_consumption_rpcs.sql`
   - cria `service_item_validations`;
   - cria `resolve_service_qr`;
   - cria `consume_service_item`;
   - define índices, RLS policies e grants.

2. `src/integrations/supabase/types.ts`
   - adiciona tipos da tabela `service_item_validations`;
   - adiciona assinaturas das RPCs `resolve_service_qr` e `consume_service_item`.

3. `src/types/database.ts`
   - adiciona interface `ServiceItemValidation`.

4. `docs/Analises/analise-111-backend-qrcode-consumo-servicos.md`
   - documentação desta etapa.

---

## 4. Regras de elegibilidade

Regra aplicada nesta etapa:
- **pode validar**: `sales.status = pago`.
- **não pode validar**: `cancelado`, `pendente`, `pendente_taxa`, `pendente_pagamento`, `reservado`, `bloqueado`.

Regras de item:
- item precisa estar `status = ativo`;
- item precisa ter `control_type = validacao_obrigatoria`;
- item precisa ter saldo (`quantity_used < quantity_total`).

---

## 5. Retorno esperado das RPCs

### `resolve_service_qr`
Retorna uma linha com:
- `result`, `reason_code`, `message`;
- dados da venda (`sale_id`, `event_id`, `customer_name`, `payment_method`, `status`, `payment_confirmed_at`, `service_qr_code_token`);
- `items` (JSON array), cada item com:
  - identificação;
  - saldo;
  - preços;
  - `is_consumable`;
  - `consume_block_reason` quando bloqueado.

### `consume_service_item`
Retorna uma linha com:
- `result`, `reason_code`, `message`;
- `sale_id`, `sale_service_item_id`, `service_id`;
- saldo atualizado (`quantity_total`, `quantity_used`, `quantity_remaining`).

---

## 6. Testes/validações realizados

Validação executada por revisão de fluxo SQL (branches explícitos) + verificação estática de tipos.

Cenários cobertos na lógica das RPCs:
- QR inexistente → `service_qr_not_found`;
- venda cancelada → `sale_cancelled`;
- venda pendente/não paga → `sale_not_paid`;
- venda `pendente_taxa` → `sale_pending_fee`;
- item sem saldo → `no_balance`;
- item sem validação (`sem_validacao`) → `control_not_required`;
- item ativo com saldo → `service_item_consumed`;
- consumo concorrente/duplo → `concurrent_update_blocked`.

Também foi validado que `validate_ticket_scan` não foi alterada nesta etapa.

---

## 7. O que ainda não foi implementado

Ainda não foi implementado:
- interface final no `/validador`;
- leitura visual do QR de serviços na tela de scanner;
- comprovante final dedicado de serviços;
- carrinho multi-serviço na UI de venda.

---

## 8. Próximo passo recomendado

Próxima tarefa sugerida:
1. adaptar `/validador` para detectar tipo de QR;
2. para QR de serviço, chamar `resolve_service_qr` e renderizar lista de itens;
3. acionar `consume_service_item` para baixa unitária;
4. exibir feedback operacional por `reason_code` (sucesso/bloqueios).

---

## 9. Checklist final

- [x] PRDs foram consultados.
- [x] Análises 109 e 110 foram consultadas.
- [x] QR de passagem não foi alterado.
- [x] Validação de passagem não foi alterada.
- [x] RPC de resolução de QR de serviços foi criada.
- [x] RPC de consumo unitário foi criada.
- [x] Consumo é protegido contra concorrência.
- [x] Venda pendente não valida.
- [x] Venda `pendente_taxa` não valida.
- [x] Serviço `sem_validacao` não consome.
- [x] Item sem saldo não consome.
- [x] Auditoria de consumo foi criada ou reutilizada com justificativa.
- [x] Tipos foram atualizados.
- [x] Arquivo `docs/Analises/analise-111-backend-qrcode-consumo-servicos.md` foi criado.
