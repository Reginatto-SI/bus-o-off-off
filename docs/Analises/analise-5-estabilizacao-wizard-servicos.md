# Análise 5 — Estabilização do wizard de venda de serviços

## 1) Diagnóstico dos ajustes realizados

Após a auditoria (análise 4), os principais riscos operacionais eram:
- status `pendente` e `pendente_taxa` invisíveis em filtros/labels de telas administrativas;
- ruído visual para vendas sem `trip_id`/`boarding_location_id`;
- acesso do wizard apenas por rota direta;
- risco de inconsistência de capacidade em concorrência simples.

A estabilização foi aplicada com mudanças pequenas e localizadas, sem refatoração de arquitetura.

---

## 2) Arquivos alterados

1. `src/pages/admin/Sales.tsx`
2. `src/pages/admin/SalesReport.tsx`
3. `src/pages/admin/SellersCommissionReport.tsx`
4. `src/pages/admin/SalesDiagnostic.tsx`
5. `src/pages/admin/Dashboard.tsx`
6. `src/components/layout/AdminSidebar.tsx`
7. `src/pages/admin/ServiceSales.tsx`

---

## 3) Como os novos status foram incorporados

Status `pendente` e `pendente_taxa` foram incluídos nos filtros e labels das telas auditadas:
- `/admin/vendas`
- `/admin/relatorios/vendas`
- `/admin/relatorios/comissao-vendedores`
- `/admin/diagnostico-vendas`
- Dashboard (mapa/distribuição de status)

Objetivo: evitar invisibilidade operacional de vendas avulsas de serviço.

---

## 4) Como ficou o fallback visual de venda avulsa

Para vendas sem `trip_id` e sem `boarding_location_id`, foi adotado fallback textual explícito:
- **“Venda de serviço avulsa”** (contexto de veículo/linha de venda)
- **“Sem embarque — serviço avulso”** (contexto de local de embarque)

Objetivo: remover ruído visual e deixar claro que não se trata de falha de cadastro de embarque/trajeto.

---

## 5) Como foi melhorada a salvaguarda de capacidade

No wizard `/vendas/servicos`, antes da gravação final:
1. Reconsulta do `event_services` atual no banco (`sold_quantity`, `total_capacity`);
2. Bloqueio se a disponibilidade real já não comportar a quantidade;
3. Update de `sold_quantity` com guarda otimista (`eq('sold_quantity', valor_lido)`), para reduzir corrida básica;
4. Se o update de capacidade não efetivar, a venda recém-criada é revertida (`delete`) e o usuário recebe erro operacional.

Importante: permanece sem transação/RPC dedicada nesta etapa (decisão intencional de escopo mínimo).

---

## 6) O que continua fora de escopo

Mantido fora de escopo nesta etapa:
- QR Code
- validação de uso
- consumo parcial
- checkout com serviços
- novos relatórios
- split/repasse
- guias/horários/veículos específicos/fornecedores
- criação de tabela `sale_items`

---

## 7) Dívidas técnicas mantidas

1. **Itens de serviço em `sale_logs` (provisório)**
   - Mantido como trilha operacional mínima nesta fase.
   - `sale_items` continua como avaliação futura para estrutura relacional e analytics.

2. **Capacidade sem transação de banco completa**
   - Houve melhora de guarda otimista, porém ainda sem garantia transacional forte.

3. **Convivência com fluxo legado de passagens**
   - Foi aplicado fallback visual para reduzir ruído, mas o domínio ainda mistura tipos de venda na mesma entidade `sales`.

---

## 8) Checklist final

- [x] Status `pendente` e `pendente_taxa` visíveis nas telas administrativas auditadas.
- [x] Fallback visual explícito para venda sem trip/embarque aplicado.
- [x] Wizard `/vendas/servicos` acessível pelo menu lateral (“Venda de Serviços”).
- [x] Revalidação de capacidade implementada antes da confirmação.
- [x] Atualização de capacidade com guarda otimista mínima implementada.
- [x] `sale_logs` documentado como solução provisória.
- [x] Nenhum item fora de escopo foi implementado.
