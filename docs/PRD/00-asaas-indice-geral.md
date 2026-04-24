# 00 — Asaas no SmartBus BR: Índice Geral

## Objetivo deste índice
Ser a porta de entrada oficial da documentação Asaas do SmartBus BR, com ordem de leitura, criticidade e foco por público (Produto, Suporte, Dev, Financeiro e Auditoria).

## Ordem oficial de leitura
1. [01-asaas-visao-geral.md](./01-asaas-visao-geral.md) — **Crítica**
2. [02-asaas-fluxo-checkout-e-venda.md](./02-asaas-fluxo-checkout-e-venda.md) — **Crítica**
3. [03-asaas-webhook-e-confirmacao.md](./03-asaas-webhook-e-confirmacao.md) — **Crítica Máxima**
4. [04-asaas-split-comissoes-e-representantes.md](./04-asaas-split-comissoes-e-representantes.md) — **Alta / Financeira**
5. [05-asaas-configuracao-empresa-e-validacao.md](./05-asaas-configuracao-empresa-e-validacao.md) — **Alta / Configuração**
6. [06-asaas-operacao-erros-e-diagnostico.md](./06-asaas-operacao-erros-e-diagnostico.md) — **Suporte / Operação**

## Papel de cada PRD (resumo executivo)
- **01**: visão macro do contrato operacional Asaas no SmartBus BR (multiempresa, ambiente, confirmação, auditoria).
- **02**: nascimento da venda e da cobrança no checkout/admin.
- **03**: confirmação de pagamento (webhook prioritário + verify como fallback).
- **04**: distribuição financeira (split), sócio e representante.
- **05**: configuração por empresa e validação de integração.
- **06**: investigação operacional e roteiro rápido de suporte.

## Fluxo geral resumido (ponta a ponta)
1. Venda nasce com `payment_environment` e status inicial (`pendente_pagamento`/`reservado`, conforme fluxo).
2. Sistema cria cobrança no Asaas (`create-asaas-payment`) com `externalReference = sale.id`.
3. Pagamento é confirmado preferencialmente por webhook (`asaas-webhook`).
4. `verify-payment-status` atua como fallback de convergência e diagnóstico.
5. Finalização consolida venda, tickets e logs de auditoria.
6. Suporte/admin investiga divergências em `/admin/vendas/diagnostico`, `/admin/empresa` e logs técnicos.

## Criticidade consolidada por risco de quebra
- **Crítica Máxima (03)**: quebra aqui causa risco direto de venda paga sem confirmação/ticket.
- **Crítica (01, 02)**: quebra causa inconsistência de fluxo principal.
- **Alta Financeira (04)**: quebra causa divergência de repasse/comissão.
- **Alta Configuração (05)**: quebra impede venda online e gera erros recorrentes.
- **Operação (06)**: quebra aumenta tempo de diagnóstico e risco de resposta incorreta.

## Escopo e limites
- Este índice não define novas regras de negócio.
- Este índice não substitui os PRDs detalhados.
- Este índice não autoriza alteração de código sem nova tarefa.
