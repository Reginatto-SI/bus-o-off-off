# Análise 110 — Base mínima de `sale_items` + QR próprio para venda de serviços

## 1. Resumo executivo

Foi implementada a base mínima para tirar a venda de serviços da dependência de `sale_logs` como fonte principal de item vendido.

Nesta etapa, foi criado:
- campo de QR próprio de serviços no nível da venda (`sales.service_qr_code_token`), separado do QR de passagem;
- tabela estruturada de itens de serviço vendidos (`sale_service_items`) com saldo por item (`quantity_total`, `quantity_used`, `quantity_remaining`);
- ajuste no fluxo de `/vendas/servicos` para gravar `sales` + `sale_service_items`, mantendo `sale_logs` apenas para trilha.

Objetivo atendido: preparar base segura para próxima etapa de leitura de QR de serviços no `/validador`, sem alterar validação de passagem.

---

## 2. Decisão de arquitetura mínima

### 2.1 Onde ficou o QR de serviços
- O token ficou em `sales.service_qr_code_token`.
- Motivo: o QR de serviços é por venda/comprovante (não por item), alinhado ao PRD.
- O campo é opcional e com índice único parcial (`WHERE service_qr_code_token IS NOT NULL`) para não impactar vendas de passagem.

### 2.2 Onde ficaram os itens vendidos
- Foi criada a tabela `sale_service_items` como estrutura mínima equivalente a `sale_items` para o contexto de serviços.
- Ela referencia `sales` e registra snapshot operacional do item (serviço, controle, quantidade e valores), com saldo remanescente calculado de forma segura.

---

## 3. Arquivos alterados

1. `supabase/migrations/20260426143000_create_sale_service_items_and_service_qr.sql`
   - nova coluna em `sales` para QR de serviços;
   - nova tabela `sale_service_items`;
   - índices, constraints, trigger de `updated_at` e RLS.

2. `src/pages/admin/ServiceSales.tsx`
   - venda de serviço passou a gerar `service_qr_code_token`;
   - fluxo passou a inserir item em `sale_service_items`;
   - `sale_logs` mantido como auditoria complementar.

3. `src/integrations/supabase/types.ts`
   - tipos atualizados para `sales.service_qr_code_token`;
   - inclusão da tabela `sale_service_items`.

4. `src/types/database.ts`
   - tipo `Sale` atualizado com `service_qr_code_token`;
   - inclusão da interface `SaleServiceItem`.

5. `docs/Analises/analise-110-base-sale-items-qrcode-servicos.md`
   - documentação desta etapa.

---

## 4. Banco de dados

### 4.1 Campo novo em `sales`
- `service_qr_code_token text null`
- índice único parcial para evitar duplicidade de token de serviço.

### 4.2 Nova tabela `sale_service_items`
Campos principais:
- `sale_id`, `company_id`, `event_id`, `service_id`, `event_service_id`;
- `service_name` (snapshot);
- `unit_type` e `control_type`;
- `quantity_total`, `quantity_used`;
- `quantity_remaining` (coluna gerada armazenada: `GREATEST(quantity_total - quantity_used, 0)`);
- `unit_price`, `total_price`;
- `status` (`ativo`/`cancelado`);
- `created_at`, `updated_at`.

### 4.3 Relacionamentos
- FK para `sales`, `companies`, `events`, `services`, `event_services`.
- `sale_id` com `ON DELETE CASCADE` para preservar consistência em rollback/exclusão da venda.

### 4.4 RLS
- `ENABLE ROW LEVEL SECURITY` na nova tabela.
- Policy de gestão para admin da própria empresa.
- Policy de leitura para membros da própria empresa.

### 4.5 Constraints relevantes
- `quantity_total > 0`
- `quantity_used >= 0`
- `quantity_used <= quantity_total`
- `unit_price >= 0`
- `total_price >= 0`
- checks de domínio para `unit_type`, `control_type`, `status`.

### 4.6 Cálculo de saldo restante
- Saldo por item é derivado de `quantity_total - quantity_used` com proteção para não ficar negativo via `GREATEST(...)`.

---

## 5. Fluxo atualizado de `/vendas/servicos`

Ao confirmar venda:
1. mantém criação da venda em `sales`;
2. gera e persiste `service_qr_code_token` na venda;
3. grava item estruturado em `sale_service_items` com `quantity_used = 0`;
4. atualiza `event_services.sold_quantity` (regra existente);
5. mantém `sale_logs` para trilha operacional.

Observação operacional:
- se falhar a criação do item estruturado, a venda recém-criada é removida para evitar venda sem item;
- se falhar atualização de capacidade por concorrência, a venda também é revertida (e os itens caem em cascade via FK).

---

## 6. O que ainda não foi implementado

Ainda não foi implementado nesta etapa:
- leitura de QR de serviços no `/validador`;
- consumo unitário;
- baixa atômica de consumo;
- comprovante final de serviços dedicado (separado);
- carrinho multi-serviço na UI de venda.

---

## 7. Próximo passo recomendado

Próxima tarefa sugerida:
1. endpoint backend para resolver QR de serviços (`service_qr_code_token`) e listar `sale_service_items` elegíveis;
2. endpoint atômico de consumo unitário (`quantity_used += 1` com guarda de saldo/status/pagamento);
3. adaptação do `/validador` para reconhecer QR de serviço e exibir lista de itens com saldo.

---

## 8. Checklist final

- [x] PRDs foram consultados.
- [x] Análise 109 foi consultada.
- [x] `sale_logs` deixou de ser fonte principal de item vendido.
- [x] Venda de serviço grava item estruturado.
- [x] Venda de serviço possui base para QR próprio.
- [x] QR de passagem não foi alterado.
- [x] Validação de passagem não foi alterada.
- [x] `/validador` não foi implementado para serviços nesta etapa.
- [x] Nenhum QR individual por item foi criado.
- [x] Estrutura suporta múltiplos itens por venda futuramente.
- [x] Arquivo `docs/Analises/analise-110-base-sale-items-qrcode-servicos.md` foi criado.
