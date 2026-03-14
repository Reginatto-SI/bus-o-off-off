

# Plano: Separar Bloqueio de Venda/Reserva

## Diagnóstico

Hoje, bloqueios são gravados como `sales` com `status = 'reservado'` e `customer_name = 'BLOQUEIO'`. A diferenciação é apenas cosmética (badge "Bloqueio" na coluna cliente). Isso permite ações indevidas como "Marcar como Pago" e contamina KPIs.

## Estratégia: Status próprio + campo estruturado

Abordagem de menor risco: adicionar `bloqueado` ao enum `sale_status` e um campo `block_reason` na tabela `sales`. Sem criar nova tabela — o registro continua na mesma estrutura, mas com status e comportamento claramente distintos.

## Alterações

### 1. Migração SQL
- Adicionar valor `bloqueado` ao enum `sale_status`
- Adicionar coluna `block_reason text` na tabela `sales` (nullable)
- Atualizar registros existentes: `UPDATE sales SET status = 'bloqueado', block_reason = 'staff' WHERE customer_name = 'BLOQUEIO' AND status = 'reservado'`
- Ajustar trigger `enforce_platform_fee_before_paid` para ignorar `bloqueado`

### 2. Tipos TypeScript (`src/types/database.ts`)
- Adicionar `'bloqueado'` ao tipo `SaleStatus`

### 3. StatusBadge (`src/components/ui/StatusBadge.tsx`)
- Adicionar entrada `bloqueado` com label "Bloqueado" e estilo visual distinto (cinza/slate)

### 4. NewSaleModal (`src/components/admin/NewSaleModal.tsx`)
- Gravar bloqueio com `status: 'bloqueado'` (não mais `'reservado'`)
- Gravar `block_reason` no campo da sale
- Remover "Cortesia" da lista de motivos
- Adicionar texto auxiliar na etapa de confirmação: "Bloqueio apenas impede a venda do assento. Não gera passagem nem cobrança."
- Setar `unit_price: 0` e `gross_amount: 0` para bloqueios

### 5. Sales.tsx — Listagem (`src/pages/admin/Sales.tsx`)
- **Coluna Cliente**: para `status === 'bloqueado'`, exibir "Bloqueio Operacional" com motivo abaixo (via `block_reason`)
- **Coluna Valor**: exibir `—` para bloqueados
- **Coluna Status**: StatusBadge `bloqueado`
- **Ações**: bloqueados terão apenas "Ver Detalhes" e "Liberar Bloqueio" (cancelamento com label ajustado)
- **Stats/KPIs**: excluir bloqueados dos cálculos de receita e contagens comerciais
- **Filtro de status**: adicionar opção "Bloqueado"

### 6. Sales.tsx — Modal de Detalhes
- Título: "Detalhes do Bloqueio" quando `status === 'bloqueado'`
- Substituir "Cliente" por "Tipo: Bloqueio Operacional"
- Exibir motivo do bloqueio
- Ocultar campos financeiros (valor, taxa)
- Indicador: "Este registro é um bloqueio operacional, não uma venda."

### 7. Mapa de Assentos
- Já funciona corretamente — `SeatButton` tem estado `blocked` com estilo âmbar e ícone `Ban`
- A lógica de identificação de bloqueios no `NewSaleModal` (linhas 395-418) deve ser atualizada para usar `status = 'bloqueado'` em vez de `customer_name = 'BLOQUEIO'`

### 8. Relatórios (KPIs e funções SQL)
- As funções `get_sales_report_kpis` e `get_sales_report_summary_paginated` filtram por `status = 'pago'` para receita — bloqueados com status `bloqueado` já ficam fora naturalmente
- Nenhuma alteração necessária nas funções SQL de relatório

### 9. Checkout público / SeatMap
- Atualizar a query de assentos ocupados no checkout público para considerar `status = 'bloqueado'` como assento indisponível (além de `reservado`/`pago`)

## Arquivos impactados
- 1 migração SQL (enum + coluna + dados + trigger)
- `src/types/database.ts` — tipo SaleStatus
- `src/components/ui/StatusBadge.tsx` — novo status
- `src/components/admin/NewSaleModal.tsx` — gravação e motivos
- `src/pages/admin/Sales.tsx` — listagem, ações, detalhes, filtros, stats

## O que NÃO muda
- Estrutura de tabelas (sem nova tabela)
- Fluxo público de checkout
- RLS policies (bloqueado reaproveita as mesmas policies de sales)
- Outras telas admin
- Relatórios SQL existentes

