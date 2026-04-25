# Análise Step 01 — Impacto da nova regra de comissão do representante (1/3 da taxa da plataforma)

Data da análise: 2026-04-11 (UTC)
Escopo: diagnóstico técnico sem implementação

---

## 1) Resumo executivo

A regra atual do sistema **não está modelada como “1/3 da taxa da plataforma”**. Hoje, a comissão do representante é tratada como **percentual próprio do representante** (`representatives.commission_percent`) com fallback para **2%** em pontos críticos do backend.

Principais achados:

- Existe acoplamento explícito com a regra antiga (2%) em:
  - schema/default de `representatives.commission_percent`;
  - função SQL que grava o ledger de comissão (`upsert_representative_commission_for_sale`);
  - resolvedor de split Asaas (`split-recipients-resolver.ts`).
- A comissão no painel do representante é **lida do ledger persistido** (`representative_commissions`), e **não recalculada no frontend**, o que é bom para auditabilidade.
- O split e o ledger de comissão usam **fontes diferentes para o percentual** (ambos leem `representatives.commission_percent`, mas em pontos distintos), o que reduz divergência hoje, porém não implementa a nova regra proporcional por venda/empresa automaticamente.
- O pipeline de confirmação (create/verify/webhook + finalização) já está centralizado em componentes compartilhados, o que favorece correção mínima sem fluxo paralelo.

Classificação da mudança: **sensível (financeiro + histórico + split + UX)**.

Riscos principais:

1. divergência entre percentual exibido e valor monetário quando houver taxa de plataforma variável e arredondamento;
2. quebra de histórico se houver tentativa de recalcular comissões antigas;
3. inconsistência entre split enviado ao gateway e valor persistido em `representative_commissions` se a fórmula for alterada só em um lado;
4. possível impacto multiempresa se a regra usar taxa de empresa errada (precisa respeitar `sales.company_id`).

---

## 2) Mapeamento da regra atual (onde a regra antiga aparece ou pode estar embutida)

## 2.1 Banco de dados / migrations

### Evidências explícitas de “2%”

1. `representatives.commission_percent` nasce com default `2.00`.
2. Comentário da coluna menciona “Fase 1: default 2%”.
3. Função `upsert_representative_commission_for_sale` usa fallback `COALESCE(v_representative.commission_percent, 2.00)`.
4. Comentário da função registra “2% padrão”.

Implicação: a regra atual é “percentual do representante”, não “taxa_da_plataforma/3”.

### Cálculo monetário atual do ledger

Na `upsert_representative_commission_for_sale`:

- base = `sales.gross_amount` (com fallback para `unit_price * quantity`);
- comissão = `ROUND(base * (commission_percent / 100), 2)`;
- status inicial depende da wallet do representante no ambiente (`pendente` ou `bloqueada` com `representative_wallet_missing`).

Consequência importante: a comissão persistida no ledger já é arredondada em 2 casas no banco.

### Snapshot histórico e rastreabilidade

- `sales.representative_id` é snapshot definido no insert por trigger (`set_sale_representative_snapshot`) com base em `representative_company_links`.
- `representative_commissions` guarda: `company_id`, `representative_id`, `sale_id`, `payment_environment`, `base_amount`, `commission_percent`, `commission_amount`, `status`, timestamps.
- Constraint de idempotência por venda: `UNIQUE(sale_id)`.

Isso é positivo para histórico e auditoria.

## 2.2 Backend / Edge functions / split

### Resolvedor central de split

`supabase/functions/_shared/split-recipients-resolver.ts`:

- busca representante por `id`;
- exige status `ativo` + wallet por ambiente para incluir no split;
- percentual do representante = `Number(representative.commission_percent ?? 2)`;
- se válido, adiciona recipient `kind: "representative"` com `percentualValue`.

Ou seja: o split também está orientado a percentual fixo por representante (com fallback 2).

### Envio do split ao Asaas

`create-asaas-payment` envia array `split` com `percentualValue` exatamente como resolvido.

Valida apenas se soma de percentuais <= 100. Não há fórmula “1/3 da taxa da plataforma” nesse ponto.

### Confirmação/finalização

`payment-finalization.ts` chama a RPC `upsert_representative_commission_for_sale` após confirmação.

Isto centraliza a gravação do ledger pós-pagamento e evita duplicidade (idempotência por `sale_id`).

### Atualização de snapshot financeiro da venda

`verify-payment-status` e `asaas-webhook` usam `computeSocioFinancialSnapshot` para preencher:

- `platform_fee_total`
- `socio_fee_amount`
- `platform_net_amount`

Esse snapshot **não inclui campo próprio para valor de comissão do representante** em `sales`, mantendo representante no ledger separado.

## 2.3 Frontend / painel do representante

`src/pages/representative/RepresentativeDashboard.tsx`:

- consulta `representative_commissions` e `representative_company_links` filtrando por `representative_id` autenticado;
- KPIs são soma direta do ledger;
- frontend não recalcula comissão (bom para determinismo);
- exibe por lançamento: base, percentual e valor da comissão.

Ponto de atenção UX:

- o painel mostra os números por lançamento, mas **não explica a regra de formação do percentual**;
- não há bloco explícito informando “sua comissão = 1/3 da taxa da plataforma da venda”.

## 2.4 Relatórios/admin e outros pontos financeiros

Funções de relatório financeiro (`get_sales_report_summary_paginated`, `get_sales_report_kpis`) consideram `gross_revenue`, `platform_fee` e `sellers_commission`, **sem incluir comissão de representante**.

Isso indica que a comissão de representante está isolada no módulo/ledger próprio e não consolidada nessas métricas.

---

## 3) Impactos identificados por área

## 3.1 Cálculo financeiro

Impacto direto em:

- SQL de criação da comissão (`upsert_representative_commission_for_sale`);
- resolvedor de split (`split-recipients-resolver`) que decide percentual do representante.

Mudança necessária: substituir fonte “commission_percent do representante (fallback 2)” por cálculo derivado da taxa da plataforma aplicável à venda/empresa.

## 3.2 Split

Hoje o split aceita percentual do representante como valor pronto (`percentualValue`).

Com a nova regra, esse percentual precisa ser calculado de forma determinística a partir de `platform_fee_percent` da venda/contexto, no mesmo ponto central do split, para evitar rota paralela.

Risco se alterar parcialmente:

- split pode mandar X% ao gateway,
- ledger pode persistir Y% na comissão.

## 3.3 Persistência

`representative_commissions` já persiste `commission_percent` e `commission_amount` por venda.

Isso favorece histórico imutável, mas implica decisão de corte temporal: vendas novas vs antigas.

## 3.4 Histórico

Como há `UNIQUE(sale_id)` no ledger e snapshot por venda, o desenho favorece **preservar histórico** e aplicar regra nova só em novas confirmações.

Risco crítico: qualquer rotina de recálculo retroativo pode adulterar comissão já paga/pendente.

## 3.5 Painel do representante

Painel já está pronto para refletir regra nova sem recálculo frontend, desde que o backend passe a gravar corretamente no ledger.

Mas faltam mensagens de transparência sobre:

- regra de comissão;
- variação por taxa da plataforma;
- exemplos por faixa;
- diferença entre percentual e valor por venda.

## 3.6 Relatórios/admin

Não foi encontrada evidência de consumo da comissão de representante nos relatórios financeiros gerais atuais.

Impacto provável: baixo em relatório geral, alto no módulo de representante e trilha de pagamento/split.

## 3.7 Pagamentos/finalização/auditoria

Como o fluxo de pagamento usa resolvedor central + finalização compartilhada, o impacto deve ser concentrado em pontos únicos (bom).

Também já existem logs de representante elegível/ignorado no create/verify/webhook, úteis para auditoria após mudança.

---

## 4) Riscos e pontos de atenção

## 4.1 Arredondamento (crítico)

Com percentuais fracionados (ex.: 1,6666...%), os riscos são:

- exibir 1,66% no painel,
- aplicar 1,67% no split,
- salvar valor monetário diferente no ledger.

Estado atual:

- ledger arredonda valor monetário para 2 casas em SQL (`ROUND(..., 2)`);
- split envia percentual numérico para Asaas sem regra explícita de normalização compartilhada;
- painel exibe percentual salvo, sem formatação padronizada de casas.

### Regra de arredondamento recomendada (para validação de negócio)

Proposta mínima e segura:

1. definir percentual técnico com precisão alta (ex.: 6 casas) a partir de `platform_fee_percent / 3`;
2. usar esse percentual técnico em split e persistência de `commission_percent` (padronizado no backend);
3. arredondar **valor monetário final** sempre para 2 casas (centavos) no momento da persistência;
4. no painel, exibir percentual formatado para 2 casas (apenas visual), mantendo valor monetário como fonte oficial.

Observação: esta proposta evita drift visual/financeiro, mas precisa aprovação explícita.

## 4.2 Divergência frontend x backend

Risco moderado se alguém tentar calcular no frontend “1/3 da taxa” para exibição. Hoje o painel corretamente evita isso.

Recomendação: manter frontend apenas como leitor de ledger.

## 4.3 Dados históricos

Risco alto de inconsistência jurídica/financeira se comissões já registradas forem recalculadas.

Recomendação: regra nova para novas vendas confirmadas após data de corte; histórico permanece como foi calculado originalmente.

## 4.4 Duplicação de lógica

Risco atual/futuro: mesma fórmula em SQL da comissão e no resolvedor de split sem helper comum.

Recomendação mínima: centralizar fórmula no backend compartilhado (ou garantir função SQL única reutilizada pelos dois caminhos) para evitar drift.

## 4.5 Multiempresa / isolamento

Toda resolução já usa `sale.company_id` nos fluxos principais e políticas de leitura com `company_id`/`representative_id`.

Ao alterar fórmula, garantir que taxa da plataforma usada seja da empresa da venda (snapshot/contexto correto), nunca global.

---

## 5) Perguntas que precisam de validação (não assumir)

1. **Corte temporal**: a nova regra vale apenas para vendas confirmadas após qual data/hora oficial?
2. **Histórico pendente**: comissões já `pendente`/`bloqueada` calculadas no modelo antigo devem permanecer ou ser migradas?
3. **Fonte da taxa da plataforma**: usar `companies.platform_fee_percent` atual no momento da confirmação ou snapshot da taxa no momento da venda?
4. **Precisão técnica do percentual**: armazenar `commission_percent` com 2 casas (como hoje `numeric(5,2)`) é suficiente ou precisa ampliar escala?
5. **Regra de arredondamento oficial**: priorizar arredondamento do percentual, do valor monetário, ou ambos com ordem fixa?
6. **UX do painel**: exibir regra em card fixo + exemplos por faixa (3%, 4%, 5%, 6%)?
7. **Smartbus fica com restante automático?** confirmar se percentual da Smartbus continua implícito como “taxa_plataforma - comissão_representante”.
8. **Relatórios administrativos**: haverá necessidade de consolidar comissão de representante em relatórios financeiros gerais no futuro imediato?

---

## 6) Proposta de correção mínima (sem implementar nesta etapa)

1. **Definir fonte única da fórmula**
   - regra: `representative_percent = platform_fee_percent / 3`.
   - ponto único de cálculo no backend compartilhado (evitar fórmula duplicada em dois lugares).

2. **Ajustar resolvedor de split**
   - substituir leitura de `representatives.commission_percent` como valor principal;
   - usar taxa da plataforma do contexto da venda para gerar percentual do representante.

3. **Ajustar RPC de ledger**
   - `upsert_representative_commission_for_sale` deve usar mesma fórmula oficial;
   - manter idempotência por `sale_id` e status por wallet.

4. **Preservar histórico**
   - não recalcular linhas existentes em `representative_commissions`;
   - aplicar nova regra apenas para novas confirmações de pagamento após corte.

5. **Padronizar arredondamento**
   - formalizar regra única para percentual técnico + valor monetário em centavos.

6. **Ajuste de UX mínimo no `/representante/painel`**
   - incluir bloco textual curto “Como sua comissão é calculada”;
   - mostrar que o percentual varia conforme taxa da plataforma da venda;
   - manter tabela atual (sem novo componente estrutural), apenas com labels/descrições adicionais.

---

## 7) Checklist de implementação futura

### Backend / banco
- [ ] Definir data de corte oficial da regra nova.
- [ ] Atualizar fórmula de comissão no ponto central escolhido.
- [ ] Atualizar `upsert_representative_commission_for_sale` para nova regra.
- [ ] Atualizar resolvedor de split para nova regra.
- [ ] Garantir consistência de arredondamento entre split e ledger.
- [ ] Revisar se `commission_percent numeric(5,2)` atende precisão necessária.
- [ ] Validar cenários com wallet ausente (`bloqueada`) sem quebrar checkout/pagamento.

### Fluxo de pagamento
- [ ] Validar create/verify/webhook com representante elegível e inelegível.
- [ ] Validar que `split_representative_eligible` loga o percentual novo correto.
- [ ] Validar que total de percentuais nunca excede 100%.

### Histórico e auditoria
- [ ] Confirmar política para comissões antigas (paga/pendente/bloqueada).
- [ ] Garantir não reprocessar retroativamente `sale_id` já comissionada.
- [ ] Documentar regra de transição em runbook técnico.

### Painel `/representante/painel`
- [ ] Incluir explicação da regra em linguagem simples.
- [ ] Exibir relação “taxa da plataforma -> percentual do representante” de forma compacta.
- [ ] Manter leitura exclusiva do ledger (sem recálculo frontend).
- [ ] Garantir clareza visual de percentual + valor por venda.

### Testes funcionais mínimos
- [ ] Cenário taxa 6% => rep 2%.
- [ ] Cenário taxa 5% => rep ~1,66% (com regra oficial de arredondamento).
- [ ] Cenário taxa 4% => rep ~1,33%.
- [ ] Cenário taxa 3% => rep 1%.
- [ ] Conferir igualdade entre: split enviado, ledger salvo, painel exibido.

---

## Seção específica de UX — `/representante/painel`

Diagnóstico atual:

- O painel comunica bem status e valores por lançamento.
- Ainda não comunica claramente a **regra de formação da comissão**.
- O usuário vê percentual/valor por linha, mas não entende rapidamente por que o percentual varia.

Ajuste mínimo recomendado (sem nova arquitetura):

1. card/alerta informativo no topo do bloco de ledger:
   - “Sua comissão por venda é 1/3 da taxa da plataforma aplicada na venda.”
2. mini-exemplos em texto curto:
   - “6% -> 2%, 5% -> 1,66%, 4% -> 1,33%, 3% -> 1%”.
3. manter na linha da venda:
   - percentual + valor (os dois formatos), porque um explica regra e outro explica ganho real.
4. não expor dados sensíveis internos além do necessário ao representante.

---

## Conclusão objetiva

A mudança **não é apenas trocar 2 por 1/3**: a regra antiga está embutida em schema, RPC de ledger e resolvedor de split. O sistema atual já oferece boa base de auditabilidade e centralização, então a implementação futura pode ser cirúrgica e segura se:

- fórmula nova for aplicada de forma única e determinística no backend;
- histórico for preservado com data de corte clara;
- arredondamento for formalizado para evitar divergência;
- o painel receber reforço textual mínimo para transparência da regra.
