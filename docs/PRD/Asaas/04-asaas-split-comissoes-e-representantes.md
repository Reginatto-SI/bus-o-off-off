# 04 — PRD Asaas: Split, Comissões e Representantes

> **Atualização de governança (2026-04-25):** a regra oficial consolidada de motor de taxa e distribuição financeira está em `07-asaas-motor-taxa-e-distribuicao-financeira.md`. Em caso de conflito, o PRD 07 prevalece.

## 1. Objetivo
Documentar a distribuição financeira atual no Asaas (plataforma, sócio e representante), com foco em coerência entre split, snapshot da venda e ledger.

## 2. Contexto
O split é montado no backend por resolvedor central e depende de configuração por empresa/ambiente. Representante é opcional no split conforme elegibilidade.

## 3. Classificação
- **Criticidade:** Alta / Financeira
- **Público principal:** Financeiro, Produto, Desenvolvimento, Suporte
- **Telas impactadas:** `/admin/empresa`, `/admin/vendas/diagnostico`, `/representante/painel`
- **Risco se quebrar:** repasse incorreto, divergência contábil, bloqueio indevido de checkout
- **Origem da regra:** `split-recipients-resolver`, `create-asaas-payment`, `verify-payment-status`, migrations de representantes/comissões

## 4. Regra de ouro
**O split enviado ao Asaas deve ser coerente com o snapshot financeiro salvo na venda e com o ledger de comissões.**

## 5. Telas envolvidas
- Empresa/pagamentos (taxas e validação de split)
- Painel representante (ledger e wallet)
- Diagnóstico admin de vendas

## 6. Fluxo atual
1. `create-asaas-payment` resolve split com base em taxa da plataforma, taxa de sócio e elegibilidade do representante.
2. Split é enviado no payload da cobrança Asaas.
3. Verify/Webhook atualizam snapshot financeiro da venda.
4. RPC de comissão do representante grava ledger por venda paga (idempotente por `sale_id`).

## 7. Regras confirmadas pelo código
- Plataforma entra no split quando habilitada e com wallet válida.
- Sócio exige status ativo e wallet por ambiente quando `socio_split_percent > 0`.
- Representante pode ser ignorado sem bloquear checkout se inelegível.
- Percentual operacional do representante no resolvedor usa 1/3 da taxa da plataforma.
- Soma de split acima de 100% é bloqueada.
- Ledger de comissão de representante pode ficar `bloqueada` quando wallet ausente.

## 8. O que este PRD NÃO cobre
- Não define política de pagamento efetivo da comissão ao representante.
- Não define conciliação bancária externa ao sistema.
- Não altera fórmulas financeiras já implementadas.
- Não substitui regras fiscais/contábeis da operação.

## 9. Cenários de falha e ação esperada
| Cenário | Impacto na venda | Impacto financeiro | Bloqueia checkout? | Ação esperada | Onde investigar |
|---|---|---|---|---|---|
| Wallet da plataforma ausente | Cobrança não cria | Não há split da plataforma | Sim | Corrigir secret/wallet da plataforma | env secrets + logs create |
| Wallet do sócio ausente (com split > 0) | Cobrança falha | Split do sócio inviável | Sim | Corrigir cadastro do sócio ativo | `socios_split` + validação split |
| Representante sem wallet | Venda segue | Comissão fica bloqueada/sem repasse no split | Não | Regularizar wallet e monitorar ledger | `representatives`, `representative_commissions` |
| Representante inelegível | Venda segue | Sem repasse para representante | Não | Validar status/vínculo do representante | `sales.representative_id`, `representatives.status` |
| Soma split > 100% | Cobrança bloqueada | Sem cobrança | Sim | Ajustar percentuais configurados | `platform_fee_percent`, `socio_split_percent` |
| Divergência split x ledger | Venda pode confirmar | Contabilidade divergente | Não identificado no código atual | Investigar cálculo e trilha de confirmação | logs + ledger + snapshot venda |
| Comissão bloqueada | Venda confirmada | Representante sem liquidação | Não | Tratar bloqueio por wallet/status | `representative_commissions.status` |
| Comissão pendente sem fluxo de pagamento identificado | Venda confirmada | Risco de passivo operacional | Não identificado no código atual | Escalar financeiro/dev para definição operacional | painel representante + DB |
| Documentação antiga com comissão fixa | Interpretação errada | Risco de auditoria | Não | Priorizar PRD atual e marcar legado como histórico | docs históricas + código atual |

## 10. Riscos identificados
- Tema altamente sensível para auditoria financeira.
- Diferença entre regra histórica documentada e regra operacional atual pode gerar ruído.

## 11. Dúvidas pendentes
### Produto
- Como comunicar ao representante status “pendente” vs “bloqueada” com SLA: **não identificado no código atual**.

### Financeira
- Processo de liquidação final da comissão (`disponivel`/`paga`): **não identificado no código atual**.

### Técnica
- Fonte única definitiva da fórmula entre todos os pontos de cálculo: **não identificado no código atual**.

### Operacional
- Rotina periódica para saneamento de comissões bloqueadas: **não identificado no código atual**.

## 12. Melhorias futuras (sem implementação nesta tarefa)
### Documentação
- Mapa de conciliação split ↔ snapshot ↔ ledger por cenário.

### Produto
- Exibir motivo operacional de comissão bloqueada com orientação de ação.

### Suporte
- Checklist de atendimento financeiro para divergências de split.

### Segurança
- Governança de alteração de percentuais e wallets com trilha de aprovação.

### Operação
- Indicadores de comissões bloqueadas por período/empresa.

### Código
- Unificação explícita de helpers de cálculo para reduzir risco de divergência futura.
