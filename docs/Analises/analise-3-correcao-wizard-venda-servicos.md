# Análise 3 — Correção mínima do wizard de venda avulsa de serviços

## 1) Diagnóstico dos problemas corrigidos

### Sintoma A — Venda travava sem `trip`/`boarding`
- A implementação inicial consultava `trips` e `event_boarding_locations` obrigatoriamente antes de salvar a venda.
- Se o evento não tivesse esses vínculos, a tela bloqueava a venda com erro.

### Onde ocorria
- `src/pages/admin/ServiceSales.tsx`, função `handleConfirmSale` (versão anterior da tela).

### Evidência
- Existiam consultas obrigatórias com `throw` quando não havia retorno para viagem/local.
- O schema histórico de `sales` exigia `trip_id` e `boarding_location_id` como `NOT NULL`.

### Causa provável
- Reuso direto de contrato de passagens em um fluxo operacional de serviços.

---

### Sintoma B — Status não coerente com PRD
- PRD define:
  - dinheiro => `pendente_taxa`
  - pix/link => `pendente`
- A versão anterior mapeava para `reservado`/`pendente_pagamento` sem explicitar limitação.

### Evidência
- Código de status no wizard anterior não seguia os status do PRD.
- Enum `sale_status` não tinha `pendente` e `pendente_taxa`.

### Causa provável
- Compatibilização inicial focada em não quebrar enum legado.

---

### Sintoma C — Comprador hardcoded com CPF fake
- A venda usava comprador fixo e CPF fake (`00000000000`) por ausência de campo operacional simples.

### Evidência
- Inserção anterior em `sales` preenchia valores fixos.

### Causa provável
- Schema exigia CPF/telefone `NOT NULL` e a tela não tinha campo de responsável.

---

## 2) Arquivos alterados

1. `src/pages/admin/ServiceSales.tsx`
2. `src/types/database.ts`
3. `src/components/ui/StatusBadge.tsx`
4. `src/pages/admin/SalesDiagnostic.tsx`
5. `src/integrations/supabase/types.ts`
6. `supabase/migrations/20260426130000_service_sales_minimal_compat.sql`

---

## 3) Solução adotada para dependência de trip/embarque

### Solução mínima aplicada
- Migration específica para compatibilização do fluxo de serviços:
  - `sales.trip_id` -> `DROP NOT NULL`
  - `sales.boarding_location_id` -> `DROP NOT NULL`
- No wizard, a venda passa a gravar `trip_id = null` e `boarding_location_id = null` para venda avulsa de serviço.

### Justificativa
- Remove bloqueio operacional desnecessário sem criar nova arquitetura.
- Mantém o reuso da tabela `sales`, como exigido.

---

## 4) Status utilizados e compatibilidade com o schema atual

### PRD (alvo)
- dinheiro => `pendente_taxa`
- pix/link => `pendente`

### Compatibilização mínima aplicada
- Migration adiciona valores ao enum `sale_status`:
  - `pendente`
  - `pendente_taxa`
- Wizard já persiste exatamente estes status.

### Ajustes de superfície
- Atualizado `SaleStatus` no frontend e labels de status em componentes usados em diagnóstico/visualização.

---

## 5) Como ficou o comprador/responsável

- Adicionado campo opcional: **Comprador/Responsável** (etapa de quantidade).
- Regras:
  - CPF não é exigido.
  - Telefone não é exigido.
  - Se vazio, usa fallback seguro: `Venda avulsa de serviço`.
- Migration remove obrigatoriedade de `customer_cpf` e `customer_phone` para suportar o fluxo sem dado fake.

---

## 6) O que ficou fora de escopo

Não implementado (mantido fora de escopo da tarefa):
- QR Code
- validação de uso
- consumo parcial
- checkout com serviços
- relatórios
- split/repasse
- guias/fornecedores/horários/veículos específicos
- controle transacional avançado de concorrência (RPC/fila/lock)

---

## 7) Dívidas técnicas identificadas

1. **Concorrência de capacidade**
   - A validação é feita no frontend + update simples em `event_services`.
   - Em cenário de alta concorrência, pode exigir controle transacional no banco (futuro).

2. **Impacto analítico de novos status**
   - Como `sale_status` ganhou novos valores, relatórios/consultas antigas podem precisar revisão incremental para refletir os novos estados.

---

## 8) Checklist final de validação

- [x] `/vendas/servicos` continua funcional no `AdminLayout`.
- [x] Venda de serviço não depende mais de `trip`/`boarding` para ser registrada.
- [x] Status do PRD aplicados (`pendente` / `pendente_taxa`) com compatibilização real do schema.
- [x] Comprador/responsável opcional implementado.
- [x] Não há CPF fake obrigatório no fluxo.
- [x] `resetWizard()` centraliza limpeza de estado pós-venda.
- [x] Capacidade validada antes do salvamento sem alterar arquitetura.
- [x] Nenhum item fora de escopo foi implementado.
