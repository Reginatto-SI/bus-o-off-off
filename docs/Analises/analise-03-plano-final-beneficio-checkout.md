# Análise 03 — Plano Final de Implementação: Benefício no Checkout por Passageiro (CPF)

## 1. Resumo executivo

Este plano fecha a estratégia técnica para integrar benefício por CPF **no checkout público**, com decisão por passageiro, cálculo financeiro consistente e trilha auditável até o ticket/PDF.

Direção central desta fase:

1. **Validar oficialmente na transição Passsageiros → Pagamento** (determinístico).
2. **Aplicar 1 benefício por passageiro**, escolhendo o **mais vantajoso** quando houver múltiplos elegíveis.
3. **Calcular por passagem real** (preço efetivo do assento/categoria), depois compor taxas do checkout.
4. **Persistir snapshot por passageiro** no staging (`sale_passengers`) e no destino final (`tickets`) para não perder contexto após pagamento.
5. **Manter total de venda agregado em `sales`**, com complemento mínimo para auditoria/reporte financeiro.
6. **Reusar fluxo e componentes existentes** (sem refatoração ampla, sem arquitetura paralela).

Escopo explícito desta fase: **somente checkout público** (não inclui venda administrativa manual).

---

## 2. Fluxo final proposto (CPF digitado → cobrança → emissão)

## 2.1. Fluxo funcional em alto nível

1. Usuário seleciona assentos (step 1) e preenche passageiros (step 2).
2. Durante digitação de CPF pode existir feedback visual local (opcional), mas **sem decisão oficial**.
3. Ao clicar “Continuar” no step 2:
   - sistema executa validação oficial por passageiro;
   - resolve benefício vencedor (mais vantajoso) por CPF;
   - recalcula preço por passageiro e total da compra;
   - grava no estado um “snapshot de precificação validado”.
4. No step 3 (pagamento), resumo já mostra valores consolidados com benefício.
5. No submit final:
   - backend revalida cálculo/benefício com a mesma regra;
   - persiste venda + passageiros com snapshot;
   - gera cobrança com o **total persistido no backend**.
6. Após confirmação de pagamento:
   - passageiros viram tickets mantendo snapshot de benefício;
   - `sale_passengers` pode continuar sendo limpo, sem perda de trilha.

## 2.2. Regra de prioridade (mais vantajoso)

Critério operacional desta fase para escolher entre múltiplos programas elegíveis de um mesmo passageiro:

- calcular `final_price` para cada programa elegível sobre `original_price` daquele assento;
- escolher o menor `final_price` (maior vantagem ao passageiro);
- em empate, aplicar desempate determinístico estável (ordem fixa definida em regra).

### Avaliação pedida: aplicar regra direta agora vs prever prioridade explícita futura

**Recomendação para esta fase:** aplicar diretamente “mais vantajoso” (sem tabela nova de prioridade), porque:

- atende decisão de negócio já fechada,
- reduz escopo e risco de entrega,
- mantém simplicidade do checkout.

**Previsão futura (sem implementar agora):** deixar preparado um ponto de extensão de desempate (`priority_mode`/`priority_order`) para fases posteriores, sem bloquear a fase atual.

---

## 3. Modelagem mínima recomendada

## 3.1. `sale_passengers` (snapshot de decisão no checkout)

Adicionar os campos-base sugeridos (persistência mínima por passageiro):

- `benefit_program_id` (uuid, nullable)
- `benefit_program_name` (text, nullable)
- `benefit_type` (text, nullable)
- `benefit_value` (numeric, nullable)
- `original_price` (numeric, not null)
- `discount_amount` (numeric, not null default 0)
- `final_price` (numeric, not null)

Complementos mínimos recomendados para robustez auditável (sem excesso):

- `benefit_applied` (boolean, not null default false)
- `pricing_rule_version` (text, not null default `'beneficio_checkout_v1'`)

Justificativa:

- o snapshot fica no ponto em que a decisão oficial acontece;
- evita reinterpretação posterior de regra;
- facilita suporte e investigação por venda/passsageiro.

## 3.2. `tickets` (snapshot final pós-pagamento)

**Sim, tickets devem receber snapshot de benefício.**

Motivo objetivo: o fluxo atual apaga `sale_passengers` após gerar `tickets`; sem cópia, o contexto do benefício se perde.

Recomendação mínima:

- replicar os mesmos campos financeiros/de benefício de `sale_passengers` em `tickets`.

Benefício disso:

- mantém rastreabilidade no documento operacional final (passagem virtual/PDF);
- evita depender de staging já deletado.

## 3.3. `sales` (agregado financeiro)

`sales` continua sendo o agregado oficial da venda (`gross_amount` etc.), mas recomenda-se adicionar:

- `benefit_total_discount` (numeric, not null default 0)

Motivo:

- facilita leitura rápida e relatórios sem reabrir item a item;
- ajuda reconciliação entre total bruto por passageiro e total final cobrado.

Observação: não é necessário modelar benefício por passageiro em `sales`; isso fica no snapshot granular.

---

## 4. Pontos de alteração no sistema (arquivos/fluxos)

## 4.1. Checkout público (UI + estado + cálculo)

**Arquivo principal:** `src/pages/public/Checkout.tsx`

Alterações planejadas:

1. expandir estado de passageiro para incluir resultado de benefício e preços por passageiro;
2. validar benefício oficialmente no avanço step 2 → step 3;
3. recalcular resumo financeiro com base em preços finais por passageiro;
4. no submit, enviar snapshot por passageiro para persistência;
5. invalidar benefício do passageiro quando CPF for alterado.

## 4.2. Utilitários de elegibilidade e cálculo

**Arquivo existente para reuso:** `src/lib/benefitEligibility.ts`

Ajustes planejados (sem reescrever arquitetura):

- manter função de elegibilidade como base;
- adicionar/planejar função utilitária pura para “aplicar benefício no preço” e comparar vantagens de forma determinística;
- centralizar fórmula para reutilização frontend/backend (mesma regra de cálculo).

## 4.3. Persistência de venda/passageiros

**Fluxo atual em `Checkout.tsx`:**

- insert em `sales`
- insert em `sale_passengers`

Planejamento:

- incluir novos campos de snapshot no payload de `sale_passengers`;
- persistir `gross_amount` e `benefit_total_discount` já consolidados;
- garantir que o valor usado na cobrança venha do total consolidado persistido.

## 4.4. Backend de cobrança e consistência

**Arquivo:** `supabase/functions/create-asaas-payment/index.ts`

Planejamento:

- antes de criar cobrança, validar coerência entre total da venda e snapshot de passageiros;
- usar total oficial persistido (não recalcular por heurística frágil);
- em inconsistência, retornar erro claro e registrar log operacional/integrativo.

## 4.5. Conversão staging → ticket

**Arquivo:** `supabase/functions/_shared/payment-finalization.ts`

Planejamento:

- ao gerar `tickets` a partir de `sale_passengers`, copiar também os campos de benefício/preço;
- manter limpeza de `sale_passengers` apenas após snapshot estar no ticket.

## 4.6. Tipagens e contratos

Arquivos impactados:

- `src/integrations/supabase/types.ts`
- `src/types/database.ts`

Planejamento:

- refletir novos campos nas interfaces/tipos de `sale_passengers`, `tickets` e `sales`.

## 4.7. Passagem virtual e PDF

Arquivos principais:

- `src/components/public/TicketCard.tsx`
- `src/lib/ticketVisualRenderer.ts`
- `src/pages/public/Confirmation.tsx`
- `src/pages/admin/Sales.tsx` (usa mesmo card de passagem)

Planejamento:

- estender `TicketCardData` com dados de benefício (nome + desconto);
- exibir bloco discreto condicional no ticket;
- manter PDF fiel ao card (pipeline já reutiliza DOM/render compartilhado).

---

## 5. Estratégia de consistência financeira (evitar divergência UI × backend × cobrança)

## 5.1. Princípio

Frontend pode pré-visualizar, mas **valor oficial nasce no backend no momento de fechamento da compra**.

## 5.2. Estratégia operacional (fase atual)

1. **Mesma fórmula de cálculo** (ordem fixa):
   - preço bruto por passageiro;
   - benefício;
   - preço final por passageiro;
   - taxas sobre preço final.
2. **Snapshot por passageiro persistido** em `sale_passengers`.
3. **Agregado oficial persistido** em `sales.gross_amount` (+ `benefit_total_discount`).
4. **Cobrança usa o agregado oficial persistido**.
5. **Validação de integridade pré-cobrança** no backend:
   - somatório dos passageiros deve fechar com total da venda;
   - divergência => bloqueia cobrança + log explícito.
6. **Logs claros por `sale_id`** em falhas de cálculo/consistência.

Resultado esperado: impossibilitar cenário “frontend mostra um valor e cobrança sai com outro” sem erro explícito.

---

## 6. Estratégia de exibição do benefício

## 6.1. Checkout

### No card de passageiro (step 2)

Exibição condicional e discreta por passageiro:

- status: “Benefício aplicado” / “Sem benefício”
- nome do benefício (se aplicado)
- desconto em R$
- preço original → preço final

Regra de UX:

- sem texto técnico de administração;
- sem poluição visual;
- feedback claro do impacto individual.

### No resumo financeiro (step 3 e barra fixa)

Mostrar:

- subtotal original (soma `original_price`)
- desconto total de benefícios
- subtotal com benefício
- taxas
- total final

Objetivo: manter transparência do total sem abrir complexidade excessiva.

## 6.2. Passagem virtual

No `TicketCard`, mostrar seção compacta **apenas quando houver benefício**:

- “Benefício: {nome}”
- “Desconto: {valor}”

Sem mostrar regra completa, sem detalhamento administrativo.

## 6.3. PDF

Como o PDF já deriva do mesmo layout do ticket, replicar exatamente a exibição condicional acima:

- aparece somente quando benefício existir;
- mantém consistência visual com passagem virtual;
- sem transformar PDF em relatório técnico.

---

## 7. Compatibilidade com fluxo pós-pagamento

Para não perder contexto após pagamento:

1. `sale_passengers` recebe snapshot de benefício/preço no checkout.
2. `payment-finalization` copia snapshot para `tickets` ao emitir passagens.
3. limpeza de staging ocorre após cópia bem-sucedida.
4. telas de consulta de ticket (pública/admin) leem dados finais do próprio ticket.

Assim, a trilha fica preservada ponta a ponta sem depender de staging temporário.

---

## 8. Impacto em relatórios e leituras financeiras

Pontos que podem ficar inconsistentes sem ajustes:

1. consultas que usam `quantity * unit_price` como total da venda;
2. telas que exibem “valor unitário” único quando houver preço misto por passageiro;
3. métricas que ignoram desconto de benefício e usam apenas preço base.

Mitigação recomendada nesta fase:

- priorizar `gross_amount` como total oficial pago;
- expor `benefit_total_discount` em relatórios/KPIs onde fizer sentido;
- evitar inferir total financeiro a partir de `quantity * unit_price` quando houver benefício aplicado.

---

## 9. Riscos finais e mitigação

1. **Divergência de cálculo entre cliente e servidor**
   - Mitigação: mesma regra formal + validação backend pré-cobrança + erro bloqueante.

2. **Aplicação duplicada de desconto**
   - Mitigação: cálculo em pipeline único com campos explícitos (`original_price`, `discount_amount`, `final_price`).

3. **Empate/ambiguidade no “mais vantajoso”**
   - Mitigação: desempate determinístico documentado nesta fase.

4. **Perda de trilha após gerar ticket**
   - Mitigação: snapshot também em `tickets` antes de limpar `sale_passengers`.

5. **Impacto silencioso em relatórios existentes**
   - Mitigação: revisar pontos que ainda usam `quantity * unit_price`; migrar leitura para `gross_amount` + campos de benefício.

6. **Mudança de CPF sem invalidar benefício**
   - Mitigação: invalidar snapshot do passageiro ao editar CPF e revalidar no ponto oficial.

7. **Poluição de UI no checkout/ticket**
   - Mitigação: exibição condicional enxuta (nome + desconto), sem textos administrativos.

---

## 10. Checklist de implementação futura (ordem segura)

## Fase A — Base de dados e contratos
- [ ] Criar migration com novos campos em `sale_passengers`, `tickets` e `sales.benefit_total_discount`.
- [ ] Atualizar tipos (`src/integrations/supabase/types.ts` e `src/types/database.ts`).

## Fase B — Motor de cálculo/elegibilidade
- [ ] Consolidar função determinística de cálculo por passageiro (aplicação de benefício + desempate “mais vantajoso”).
- [ ] Garantir ordem de cálculo oficial (bruto → benefício → final → taxas).

## Fase C — Checkout público
- [ ] Integrar validação oficial no avanço step 2 → step 3.
- [ ] Invalidar/recalcular benefício ao alterar CPF.
- [ ] Atualizar resumo financeiro com totais derivados do snapshot por passageiro.
- [ ] Persistir snapshot no insert de `sale_passengers` e agregado em `sales`.

## Fase D — Backend de cobrança
- [ ] Validar consistência financeira antes de criar cobrança em `create-asaas-payment`.
- [ ] Bloquear cobrança e logar erro quando houver mismatch de totais.

## Fase E — Pós-pagamento/tickets
- [ ] Copiar snapshot de benefício para `tickets` em `payment-finalization`.
- [ ] Manter limpeza de `sale_passengers` somente após cópia concluída.

## Fase F — Exibição
- [ ] Estender `TicketCardData` com benefício aplicado.
- [ ] Exibir benefício de forma discreta no `TicketCard` (virtual) e no PDF (mesmo template).
- [ ] Ajustar mapeamentos em `Confirmation.tsx` e `Sales.tsx` para popular os novos campos.

## Fase G — Validação final
- [ ] Testar cenários: sem benefício, com benefício, múltiplos programas elegíveis, assentos com categorias diferentes.
- [ ] Validar reconciliação: total mostrado no checkout = total salvo em `sales` = valor cobrado.
- [ ] Validar ticket/PDF com e sem benefício aplicado.

---

## 11. Escopo explicitamente fora desta fase

- Vendas manuais administrativas (`NewSaleModal`) com benefício.
- Limite de uso por CPF (período/evento/compra).
- Sistema avançado de prioridade configurável por programa.

Esses pontos podem ser faseados depois, sem bloquear a entrega do checkout público.
