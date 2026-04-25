# Step 3 — Diagnóstico operacional de vendas

## 1. Objetivo
Evoluir a tela `/admin/diagnostico-vendas` para um raio-X operacional do fluxo de vendas, destacando rapidamente o que está saudável, o que exige atenção e o que representa problema.

## 2. Problema anterior
A tela mostrava dados da venda e integração, mas sem uma classificação operacional consolidada (tempo de expiração, lock e divergência de gateway), exigindo interpretação manual extensa do suporte.

## 3. O que foi implementado
1. Classificação operacional por venda com categorias:
   - saudável;
   - atenção;
   - problema;
   - pago;
   - cancelado.
2. Cálculo de tempo por venda:
   - “Criado há X min”;
   - “Expira em X min” / “Expirado há X min” para pendentes.
3. Diagnóstico de lock por venda:
   - lock ativo;
   - lock ausente;
   - lock expirado.
4. Detecção de divergência gateway x sistema:
   - pendente com status pago no Asaas;
   - cancelado com status pago no Asaas.
5. Indicador visual explícito de ambiente:
   - 🧪 Sandbox;
   - 🌐 Produção.
6. Resumo no topo com KPIs operacionais da tela:
   - total;
   - pendentes saudáveis;
   - pendentes atenção;
   - pendentes problema;
   - pagas;
   - canceladas.
7. Ordenação automática priorizando problemas no topo para triagem de suporte.

## 4. Nova lógica de classificação
- **Saudável (🟢):** pendente/reservado, até 10 minutos e lock ativo.
- **Atenção (🟡):** pendente/reservado entre 10 e 15 minutos ou lock parcial.
- **Problema (🔴):** pendente/reservado > 15 minutos, lock ausente/expirado, ou divergência com gateway.
- **Pago (🔵):** venda com status `pago`.
- **Cancelado (⚫):** venda com status `cancelado`.

## 5. Como a tela deve ser interpretada
- Primeiro olhar: cards de resumo no topo para entender o estado geral.
- Segundo olhar: linhas em vermelho claro e badge “🔴 Problema” no topo da tabela para tratar incidentes.
- Terceiro olhar: colunas de **Tempo**, **Lock** e badge de **Divergência gateway** para diagnosticar causa operacional.

## 6. Evidências técnicas
- Arquivo alterado principal:
  - `src/pages/admin/SalesDiagnostic.tsx`
- Mudanças centrais:
  - função `computeOperationalView` com regras e prioridades;
  - enriquecimento da consulta com `seat_locks` por venda;
  - resumo de KPIs operacionais;
  - novas colunas de diagnóstico na tabela.

## 7. Como validar manualmente
1. Acesse `/admin/diagnostico-vendas`.
2. Gere cenários com vendas `pendente_pagamento`, `pago` e `cancelado`.
3. Valide:
   - pendente recente com lock ativo => “🟢 Saudável”;
   - pendente próximo de expirar => “🟡 Atenção”;
   - pendente sem lock ou expirado => “🔴 Problema”;
   - venda paga => “🔵 Pago”;
   - venda cancelada => “⚫ Cancelado”.
4. Confira colunas de tempo e lock para cada cenário.
5. Em casos com `asaas_payment_status = CONFIRMED/RECEIVED` e status interno não pago, validar badge “Divergência gateway”.

## 8. Limitações
- A classificação usa dados locais de `sales` e `seat_locks`; não dispara reconciliação ativa com gateway (somente diagnostica divergência).
- “Lock parcial” depende da relação entre `quantity` da venda e locks ativos vinculados a `sale_id`.

## 9. Conclusão
- **Step concluído?** Sim, no escopo solicitado.
- **Pronto para produção?** Sim, após deploy e validação rápida em ambiente real.
- **Próximos passos:** integrar ações operacionais guiadas por diagnóstico (ex.: botão de reconciliação) em step futuro, se necessário.
