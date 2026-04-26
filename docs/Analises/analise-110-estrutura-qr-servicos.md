# Análise 110 — Estrutura de venda de serviços com QR próprio agrupado

## 1) Diagnóstico do estado anterior

Antes desta etapa, o módulo já possuía:
- cadastro de serviços em `/admin/servicos`;
- vínculo com evento via `event_services`;
- venda avulsa parcial em `/vendas/servicos`.

Mas faltavam pontos críticos para a integração segura com `/validador`:
- ausência de estrutura principal para itens de serviço vendidos (dependência de `sale_logs`);
- ausência de token/QR próprio de serviços por venda;
- ausência de saldo por item (`comprada/usada/restante`) como contrato persistente.

## 2) Decisões tomadas

1. Manter `sales` como entidade principal da venda (sem arquitetura paralela).
2. Adicionar `sales.service_qr_code_token` para QR de serviços no nível da venda/comprovante.
3. Criar `sale_service_items` para persistência principal dos itens vendidos.
4. Manter `sale_logs` apenas como trilha auxiliar de auditoria operacional.
5. Preservar o fluxo atual de `/vendas/servicos` (1 serviço por confirmação) sem redesenho de tela.

## 3) Estrutura criada/alterada

### Banco
- Coluna nova: `sales.service_qr_code_token`.
- Nova tabela: `sale_service_items` com:
  - vínculo com venda/empresa/evento/serviço/event_service;
  - snapshot de nome do serviço, `unit_type`, `control_type`;
  - `quantity_total`, `quantity_used`, `quantity_remaining` (coluna gerada);
  - `unit_price`, `total_price`, `status`, timestamps;
  - constraints de saldo e não-negatividade;
  - RLS multi-tenant e índices para consulta operacional.

### Fluxo de venda
- `/vendas/servicos` passou a:
  - gerar `service_qr_code_token`;
  - salvar venda em `sales` com token próprio;
  - salvar item principal em `sale_service_items`;
  - manter `sale_logs` como trilha complementar.

## 4) Como o QR de serviços foi representado

- O QR de serviços foi representado por `sales.service_qr_code_token`.
- Ele é **separado** de `tickets.qr_code_token`.
- É um token no nível da venda de serviços (agrupador), não por item.
- Isso permite resolver uma venda e recuperar todos os itens vinculados em `sale_service_items`.

## 5) Como os itens de serviço são gravados

Ao confirmar venda em `/vendas/servicos`:
1. cria `sales` com `service_qr_code_token`;
2. cria registro em `sale_service_items` com `quantity_used = 0`;
3. mantém atualização de capacidade em `event_services.sold_quantity`;
4. mantém `sale_logs` apenas como trilha.

Observações de segurança:
- se falha a criação do item estruturado, a venda recém-criada é revertida;
- a modelagem suporta múltiplos itens por venda (mesmo que a UI atual registre um por confirmação).

## 6) Riscos que permanecem

- A UI do `/validador` ainda não consome o QR de serviços nesta etapa.
- O fluxo visual de scanner ainda está orientado ao QR de passagem.
- A venda avulsa atual segue com uma seleção por confirmação (sem carrinho multi-serviço completo).
- A etapa de consumo operacional precisa ser tratada por contrato backend atômico antes de liberar uso em campo.

## 7) Próximo passo recomendado para integrar com `/validador`

Próxima etapa recomendada:
1. camada backend para resolver `service_qr_code_token` e listar itens da venda;
2. consumo unitário atômico por item com proteção de concorrência;
3. adaptação mínima do `/validador` para identificar QR de serviços e usar o contrato novo.

## 8) Checklist de validação

- [x] PRDs oficiais foram consultados.
- [x] Análise 109 foi consultada.
- [x] Venda avulsa de serviços continua funcionando.
- [x] Venda de serviço possui token próprio de QR.
- [x] QR de serviços é agrupado por venda.
- [x] Itens vendidos ficaram em estrutura própria (`sale_service_items`).
- [x] `sale_logs` não é mais fonte principal do item vendido.
- [x] Estrutura suporta múltiplos itens por venda (futuro).
- [x] Fluxo de passagem e QR de passagem não foram alterados.
- [x] Arquivo criado em `docs/Analises/analise-110-estrutura-qr-servicos.md`.
