# Análise de Viabilidade e Especificação Funcional
## Relatório “Comissão de Vendedores”

- **Sistema:** Smartbus BR
- **Tela base analisada:** `/admin/relatorios/vendas`
- **Nova feature alvo (futura):** `/admin/relatorios/comissao-vendedores` (atualmente “Em breve” no menu)
- **Premissa mandatória:** comissão de vendedor é **100% gerencial** e **independente de Stripe**.

---

## 1) Resumo executivo

A base técnica atual já permite uma **v1 sólida** do relatório de comissão de vendedores sem alterar modelo de dados:

- Existe vínculo direto de venda com vendedor via `sales.seller_id`.
- Existe regra de comissão base por vendedor via `sellers.commission_percent`.
- O sistema já usa cálculo de comissão gerencial em relatórios por meio de `(base_da_venda * commission_percent)`.
- O status de venda já permite elegibilidade clara (`pago`, `cancelado`, `reservado`).

### Proposta funcional (v1)
Criar um relatório com **duas visões complementares**:

1. **Visão A — Resumo por Vendedor** (para envio e visão gerencial rápida)
2. **Visão B — Detalhado por Venda** (para auditoria, conciliação e contestação)

A proposta reutiliza os padrões já existentes de filtros, paginação e exportações do Relatório de Vendas.

---

## 2) Inventário do que existe hoje em `/admin/relatorios/vendas`

## 2.1 Filtros existentes
A tela atual já possui filtros reutilizáveis 1:1:

- Busca por cliente (nome/CPF)
- Status da venda (`reservado`, `pago`, `cancelado`)
- Evento
- Vendedor
- Data inicial
- Data final
- Limpar filtros

Além disso:
- há botão de atualização manual;
- não há recorte temporal padrão automático (inicia sem período fixo);
- filtros alimentam tanto a visão de tabela quanto KPIs.

## 2.2 KPIs existentes
O relatório de vendas já calcula e exibe:

- Receita Bruta
- Total de Vendas
- Vendas Pagas
- Ticket Médio
- Cancelamentos
- Custo da Plataforma
- Comissão dos Vendedores

Observação: os cards financeiros seguem permissão (`canViewFinancials`).

## 2.3 Estrutura de visualizações (abas)
A tela atual possui duas abas:

- **Resumo por Evento** (agregado)
- **Detalhado por Venda** (linha a linha)

Esse padrão de “resumo + detalhado” é diretamente reaproveitável para comissão de vendedores.

## 2.4 Colunas atuais (tabela)

### Resumo por Evento
- Evento
- Nº de Vendas
- Pagas
- Canceladas
- Receita Bruta
- Custo da Plataforma
- Comissão dos Vendedores

### Detalhado por Venda
- Data da compra
- Evento
- Veículo
- Local de embarque
- Cliente (nome/CPF)
- Vendedor
- Quantidade
- Poltrona
- Valor total
- Status
- Ações

## 2.5 Paginação e ordenação atuais
- Paginação server-side com `rowsPerPage` (10/20/50/100), página atual, total de resultados e faixa exibida.
- No resumo, agregação paginada via RPC (`get_sales_report_summary_paginated`).
- No detalhado, paginação por `range` diretamente na tabela `sales`.

## 2.6 Exportações atuais (PDF e Excel)
Ambas existem e permitem escolher colunas:

- **Excel:** gera `.xlsx` com seleção de colunas, preferências salvas em `localStorage`.
- **PDF:** gera `.pdf` paisagem com cabeçalho institucional (empresa, sistema, título, data/hora), tabela e rodapé com paginação.

A exportação varia conforme aba ativa (resumo ou detalhado), mantendo consistência visual/dados.

---

## 3) Fonte de dados real (schema/tipos existentes)

## 3.1 `sales` (vendas)
Campos relevantes já existentes para comissão:

- `id`
- `company_id`
- `event_id`
- `seller_id`
- `quantity`
- `unit_price`
- `gross_amount` (quando preenchido; fallback para `quantity * unit_price`)
- `status` (`reservado`, `pago`, `cancelado`)
- `created_at`
- campos de cancelamento (`cancel_reason`, `cancelled_at`, `cancelled_by`)

## 3.2 `sellers` (vendedores)
Campos relevantes:

- `id`
- `name`
- `commission_percent`
- `short_code`
- `status`
- `company_id`
- contato (`phone`, `email`, `cpf`, `pix_key`)

## 3.3 Campos de comissão já existentes
**Existe hoje apenas comissão percentual por vendedor**:

- `sellers.commission_percent`

Não foram identificados campos para:
- comissão fixa por venda;
- override por evento;
- tabela de faixas/metas;
- histórico da regra aplicada por venda (snapshot de regra).

## 3.4 Como o sistema identifica “venda do vendedor”
A identificação oficial da venda de vendedor ocorre por:

- `sales.seller_id` (FK para `sellers.id`).

O `short_code` é utilizado no fluxo público de referência (`/v/{short_code}`) para resolver vendedor e preencher `seller_id` na venda quando válido.

---

## 4) Padrões já definidos no projeto (relevantes)

1. **Comissão do vendedor é gerencial e manual, fora do Stripe.**
   - Comentários no checkout e funções server-side reforçam que Stripe não define regra de comissão de vendedor.

2. **/admin/vendas não expõe comissão sensível por venda.**
   - A tela foca operação de venda; comissão aparece como agregado em contexto gerencial (relatórios/KPIs).

3. **Já existe KPI “Comissão dos Vendedores” no relatório gerencial.**
   - Isso valida semanticamente a existência do novo relatório dedicado.

4. **Padrão de exportação já maduro.**
   - Modal de seleção de colunas (PDF/Excel), cabeçalho institucional no PDF e tabela auditável no Excel.

---

## 5) Proposta funcional do novo relatório “Comissão de Vendedores”

## 5.1 Visão A — Resumo por Vendedor (ideal para envio)
Objetivo: visão consolidada para administração enviar ao vendedor.

### Agrupamento
- Chave principal: vendedor (`seller_id` / `seller_name`)
- Recorte por período e demais filtros

### Colunas recomendadas
- Vendedor
- Período (de/até)
- Nº de vendas elegíveis
- Quantidade de passagens (soma `quantity`)
- Receita Bruta elegível (soma base)
- Percentual de comissão aplicado
- Valor de comissão total
- Status de apuração (campo derivado de workflow futuro, opcional)

### Ordenação sugerida
- padrão: `valor_comissao_total DESC`
- alternativa: `receita_bruta DESC`

## 5.2 Visão B — Detalhado por Venda (auditável)
Objetivo: permitir reconciliação e contestação.

### Colunas recomendadas
- Data da compra (`created_at`)
- Evento
- Identificador da venda (`sale_id`)
- Vendedor
- Quantidade (`quantity`)
- Valor da venda (base)
- Status da venda
- Regra de comissão aplicada (texto curto, ex.: “10% vendedor”)
- Valor da comissão da venda

### Comportamento esperado
- Exportável para planilha sem perda de granularidade
- Permite fechar totais por vendedor (somatória das linhas = resumo)

---

## 6) Regras de cálculo recomendadas (v1, sem Stripe)

## 6.1 Elegibilidade mínima
- **Entram no cálculo:** apenas vendas com `status = 'pago'`.
- **Não entram:** `cancelado` e `reservado`.

## 6.2 Base de cálculo
- Base primária recomendada: `gross_amount` quando disponível.
- Fallback técnico: `quantity * unit_price`.

## 6.3 Fórmula v1
Para cada venda elegível:

`comissao_venda = base_venda * (seller.commission_percent / 100)`

Total por vendedor no período:

`comissao_total_vendedor = soma(comissao_venda)`

## 6.4 Arredondamento
- Arredondar para 2 casas decimais no valor por venda e no total final.

## 6.5 Cancelamento/estorno
- v1: canceladas não geram comissão.
- estorno pós-pagamento: tratar como **ajuste futuro** (fora de escopo desta especificação inicial).

---

## 7) Recomendação de exportação

## 7.1 PDF (apresentável para envio)
Proposta de estrutura:

1. **Cabeçalho institucional**
   - Empresa
   - Sistema: Smartbus BR
   - Título do relatório
   - Data/hora de geração
   - Período
   - Vendedor (ou “Todos”)

2. **Bloco de resumo**
   - Nº de vendas elegíveis
   - Passagens
   - Receita bruta elegível
   - Percentual médio/aplicado
   - Comissão total

3. **Tabela principal (compacta)**
   - Preferência: Resumo por Evento ou Top vendas (quando necessário)
   - Evitar tabelas longas no PDF de envio

4. **Rodapé padrão**
   - “Documento gerado pelo sistema Smartbus BR”
   - paginação (página X de Y)

## 7.2 Excel/CSV (auditável e conciliável)
Proposta de abas:

### Aba 1 — `Resumo por Vendedor`
Colunas sugeridas:
- vendedor_id
- vendedor_nome
- periodo_de
- periodo_ate
- vendas_elegiveis
- passagens
- receita_bruta_elegivel
- comissao_percent
- comissao_total

### Aba 2 — `Detalhado por Venda`
Colunas sugeridas:
- sale_id
- data_compra
- evento_id
- evento_nome
- vendedor_id
- vendedor_nome
- quantity
- unit_price
- gross_amount_base
- sale_status
- regra_comissao
- comissao_percent_aplicada
- comissao_valor

### Aba 3 (opcional) — `Resumo por Evento`
- evento_id
- evento_nome
- vendas_elegiveis
- receita_elegivel
- comissao_total_evento

Obs.: CSV pode usar a mesma estrutura da aba detalhada para integração externa.

---

## 8) Compatibilidade com futuro “Vendedor mobile”

Para reaproveitar o mesmo dataset:

- Endpoint/dataset único de comissão, com escopo por empresa no admin e por `seller_id` no vendedor.
- No app vendedor, filtros mínimos:
  - período (obrigatório)
  - evento (opcional)
- Exportação “Minhas comissões” deve reutilizar:
  - mesmas fórmulas
  - mesmos nomes de colunas
  - mesmo layout-base de PDF/Excel (versão simplificada da marca)

Resultado: consistência entre o que o gerente enxerga e o que o vendedor recebe.

---

## 9) Perguntas objetivas para fechar decisões

1. A base oficial v1 será **sempre `gross_amount`** com fallback em `quantity * unit_price`, correto?
2. O percentual considerado deve ser o **percentual atual do vendedor** (`sellers.commission_percent`) ou precisa de **snapshot histórico por venda**?
3. Vendas sem vendedor (`seller_id` nulo) entram no relatório em agrupamento “Sem vendedor” ou ficam fora?
4. O PDF para envio deve ser **apenas resumo** ou pode conter detalhamento parcial por venda?
5. Será necessário campo de controle de pagamento da comissão ao vendedor (ex.: “apurada”, “paga”, “data pagamento”) em versão futura?
6. Haverá regra especial por evento/campanha (override de percentual) em roadmap próximo?

---

## 10) Checklist de aceitação (para implementação futura)

- [ ] Existe rota `/admin/relatorios/comissao-vendedores` dentro de `AdminLayout`.
- [ ] Filtros mínimos implementados (período, evento, vendedor, status elegível).
- [ ] Duas visões disponíveis: **Resumo por Vendedor** e **Detalhado por Venda**.
- [ ] Regra de elegibilidade aplicada: somente `status = pago` por padrão.
- [ ] Cálculo de comissão sem dependência de Stripe (apenas dados internos de venda/vendedor).
- [ ] Paginação e ordenação consistentes com padrão dos relatórios existentes.
- [ ] Exportação PDF com layout apresentável para envio.
- [ ] Exportação Excel/CSV com granularidade auditável.
- [ ] Totais da visão Resumo conferem com soma da visão Detalhada.
- [ ] Respeito a multi-tenant (`company_id`) e permissões financeiras.

---

## 11) Respostas obrigatórias (objetivas)

### 11.1 Quais campos já existem no banco para comissão do vendedor (percentual/fixo)?
- Existe **percentual**: `sellers.commission_percent`.
- **Não existe** campo de comissão fixa nativo no schema atual.

### 11.2 Qual deve ser a regra mínima de elegibilidade (pago/cancelado)?
- Recomendação v1: **somente `status = pago`**.

### 11.3 Quais colunas do relatório de vendas podem ser reaproveitadas 1:1?
Reaproveitáveis diretamente:
- Data da compra
- Evento
- Vendedor
- Quantidade
- Status
- Valor total/base da venda
- IDs técnicos para auditoria (`sale_id`)

### 11.4 Quais campos faltam para tornar o relatório profissional?
Para maturidade financeira/contábil futura, faltam principalmente:
- snapshot da regra aplicada por venda (percentual no momento da venda)
- marcação de ciclo de apuração/pagamento da comissão
- motivo/categoria de ajustes manuais (estornos, correções)

### 11.5 Qual é a estrutura ideal do PDF para envio ao vendedor?
- Cabeçalho institucional + período/vendedor
- Bloco de totais
- Tabela curta (resumo)
- Rodapé institucional com paginação

### 11.6 Qual é a estrutura ideal do Excel para auditoria/conciliação?
- Aba 1: Resumo por Vendedor
- Aba 2: Detalhado por Venda
- Aba 3 opcional: Resumo por Evento
- Colunas estáveis com IDs e valores-base para reconciliação

