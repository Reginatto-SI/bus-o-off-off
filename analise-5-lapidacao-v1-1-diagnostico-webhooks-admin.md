# 1. O que foi ajustado

Foi feita uma lapidação leve da v1 no modal técnico de `/admin/diagnostico-vendas`, focada apenas na aba **Resumo**:
- mantive os cards já existentes;
- adicionei KPIs compactos para leitura rápida de risco técnico;
- sem mudar arquitetura, sem backend novo e sem alterar comportamento base da v1.

A implementação continua:
- somente leitura;
- baseada no mesmo snapshot congelado (`company_id`, ambiente e timestamp da execução);
- sem reconciliação automática;
- sem escrita em vendas/logs.

---

# 2. Quais KPIs foram adicionados

Na aba **Resumo**, foram adicionados os seguintes cards:
- **Incidentes críticos**
- **Warnings**
- **Duplicidades de webhook**
- **Vendas com divergência**

---

# 3. Como cada KPI foi calculado

## Incidentes críticos
Soma de:
- logs já carregados com status de falha forte (`failed`, `partial_failure`, `rejected`, `unauthorized`) ou com `incident_code`;
- divergências já montadas com severidade `critical`.

## Warnings
Quantidade de logs já carregados com:
- `processing_status = warning`; ou
- `warning_code` preenchido.

## Duplicidades de webhook
Quantidade de entradas já carregadas de `asaas_webhook_event_dedup` com:
- `duplicate_count > 0`.

## Vendas com divergência
Quantidade de `sale_id` distintos presentes nas divergências já calculadas.

Observação: todos os KPIs acima **apenas resumem sinais já existentes da v1**, sem adicionar nova regra de negócio.

---

# 4. Arquivos alterados

- `src/pages/admin/SalesDiagnostic.tsx`
  - inclusão de `technicalDiagnosticKpis` via `useMemo`;
  - inclusão dos 4 novos cards na aba **Resumo**.

- `analise-5-lapidacao-v1-1-diagnostico-webhooks-admin.md`
  - relatório da lapidação v1.1.

---

# 5. Checklist de validação manual

- [ ] Modal técnico continua abrindo normalmente por **Executar diagnóstico técnico**.
- [ ] Aba **Resumo** mostra os novos KPIs sem quebrar layout desktop.
- [ ] KPIs mudam conforme o recorte real do snapshot carregado.
- [ ] Troca de empresa/ambiente após abrir modal não altera os números do modal já aberto.
- [ ] Abas **Ambiente atual**, **Divergências** e **Logs recentes** continuam funcionando.
- [ ] Não há escrita/alteração de estado de venda ao abrir diagnóstico.
- [ ] Não há chamada automática de reconciliação.
