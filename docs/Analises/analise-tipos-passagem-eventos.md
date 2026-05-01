# Análise de viabilidade — Tipos de passagem configuráveis por evento

## 1) Diagnóstico do estado atual

## 1.1 Guia **Passagens** em `/admin/eventos`
Hoje a guia **Passagens** (modal de criação/edição de evento) está estruturada em cards sequenciais e centrada em **preço base único** (`unit_price`) como fonte principal do valor da passagem.

Estrutura observada:
- Card **Configuração da Passagem**:
  - Preço Base da Passagem (`unit_price`)
  - Limite por compra (`max_tickets_per_purchase`)
  - Toggle de preços por categoria de assento (`use_category_pricing`) com edição por categoria (`event_category_prices`), fallback para `unit_price`.
- Card **Canais de Venda**:
  - `allow_online_sale`, `allow_seller_sale`, `enable_checkout_validation`
- Card **Taxa da Plataforma** com simulação baseada em `unit_price`
- Card **Aceite obrigatório** da taxa
- Bloco de **Taxas adicionais** (`event_fees`)
- **Resumo do evento**

Conclusão: já existe lógica de variação de preço por **categoria de assento**, mas não por **tipo de passageiro/tipo comercial de passagem**.

## 1.2 Onde o preço da passagem é salvo hoje
- Tabela `events`, campo `unit_price` (número).
- No save de evento, `unit_price` é persistido diretamente no `events`.
- No fluxo de venda (checkout/admin), o valor final por passageiro é mantido em snapshots (`sale_passengers.final_price` e depois `tickets.final_price`), porém a referência principal da venda ainda nasce de `event.unit_price`.

## 1.3 Como o preço é usado no checkout público
No checkout público:
- `event.unit_price` é usado como base padrão.
- Se `use_category_pricing = true`, o preço pode vir de `event_category_prices` por categoria de assento; quando não houver categoria aplicável, cai no fallback `unit_price`.
- A venda (`sales`) é criada com `unit_price: event.unit_price`.
- O cálculo de subtotal/total usa snapshots por passageiro (`final_price`) + taxas.
- O staging `sale_passengers` recebe snapshot completo por passageiro; após confirmação de pagamento, os tickets são gerados com cópia desse snapshot.

## 1.4 Como o preço é usado na venda manual/admin
No modal de venda administrativa:
- Preço padrão inicial vem de `selectedEvent.unit_price`.
- Em venda manual (`activeTab === manual`) o operador pode alterar preço unitário localmente.
- Existe suporte a benefício por CPF e fallback por categoria de assento.
- A venda grava `sales.unit_price` (base da venda) e cada ticket grava `original_price/final_price` por passageiro.

## 1.5 Impactos atuais em passageiros, assentos, ticket, QR, taxa, Asaas, relatórios e confirmação
- **Passageiros/assentos**: snapshot financeiro por passageiro já existe (`sale_passengers` e `tickets`), o que favorece futura inclusão de “tipo de passagem” sem quebrar histórico.
- **Ticket/QR Code**: QR está associado ao ticket; hoje o ticket não possui campo explícito de “tipo de passagem”, apenas preços/snapshot de benefício.
- **Taxa da plataforma / Asaas**:
  - `create-asaas-payment` valida `gross_amount` com base na soma de `sale_passengers.final_price` + taxas do evento.
  - Isso indica que, se o tipo de passagem alterar `final_price` por passageiro de forma consistente, o motor de cobrança permanece funcional.
- **Relatórios e confirmação**:
  - Telas e rotinas que exibem unitário geralmente partem de `sales.unit_price` ou cálculo por ticket.
  - Sem snapshot do tipo de passagem comprado, auditoria semântica (“foi Adulto/Criança/Promocional?”) fica limitada.

---

## 2) Mapa de impacto por tela/fluxo

## 2.1 Admin `/admin/eventos` (guia Passagens)
Impacto alto no formulário do evento para incluir cadastro/listagem de tipos de passagem por evento (nome, preço, status etc.) e manter `unit_price` como fallback retrocompatível.

## 2.2 Checkout público `/eventos/:id/checkout`
Impacto alto:
- incluir escolha do tipo de passagem por passageiro (ou por quantidade + distribuição),
- trocar origem do preço base por “tipo selecionado” antes do cálculo de taxas,
- persistir snapshot do tipo em `sale_passengers`.

## 2.3 Venda manual/admin (`NewSaleModal`)
Impacto alto:
- permitir selecionar tipo por passageiro na etapa de passageiros,
- refletir preço por tipo em resumo e persistência,
- manter modo atual disponível para retrocompatibilidade/migração gradual.

## 2.4 Confirmação pública e emissão de ticket
Impacto médio/alto:
- exibir tipo comprado no comprovante/lista de tickets,
- garantir preservação de snapshot para auditoria futura.

## 2.5 Operação (validador/embarque)
Impacto baixo/médio:
- regra de embarque via QR deve continuar igual,
- pode haver necessidade de exibir tipo no contexto operacional (não obrigatório na fase 1).

---

## 3) Mapa de impacto em dados/banco (viabilidade, sem implementação)

## Estado atual relevante
- `events.unit_price` (preço base único)
- `event_category_prices` (preço por categoria de assento)
- `sales.unit_price`, `sales.gross_amount`
- `sale_passengers.original_price/final_price`
- `tickets.original_price/final_price`
- multiempresa explícita via `company_id` em tabelas principais

## Menor mudança segura sugerida
**Conceito recomendado:** `ticket_types` (tipos de passagem por evento), com relacionamento por `event_id` + `company_id`, e snapshot em `sale_passengers`/`tickets`.

Estratégia mínima (proposta conceitual):
1. Nova entidade de configuração por evento (tipos ativos/inativos).
2. Sem remover `events.unit_price`.
3. Migrar comportamento atual para “tipo padrão” implícito (ex.: “Padrão/Adulto”) quando não houver tipos explícitos.
4. Persistir no snapshot da compra: `ticket_type_id` + `ticket_type_name` + `ticket_type_price` (ou equivalente), para auditoria histórica mesmo que o cadastro mude depois.

Observação: nome/estrutura final dos campos deve ser validado no PRD e no esquema real antes da implementação.

---

## 4) Mapa de impacto em checkout, venda manual e pagamento

## Checkout
- Recalcular preço base por passageiro a partir do tipo escolhido (antes de benefício e taxas).
- Continuar usando `final_price` como fonte para `gross_amount`/Asaas.
- Manter fallback em `event.unit_price` se evento legado sem tipos.

## Venda manual
- Seleção de tipo por passageiro no fluxo existente.
- Para não quebrar operação: manter edição manual de preço como override controlado (decisão de produto).

## Pagamento (Asaas / confirmação)
- `create-asaas-payment` e finalização já operam em cima de snapshots por passageiro, então são compatíveis com múltiplos tipos desde que snapshots sejam consistentes.
- Ponto crítico: não depender de cadastro mutável no momento da cobrança; usar snapshot gravado.

---

## 5) Riscos técnicos e operacionais

1. **Divergência de valores** entre `sales.unit_price` (legado) e mix real de tipos por passageiro.
2. **Relatórios legados** que assumem “um preço por venda”.
3. **UX confusa** se tipo for escolhido em etapa tardia sem resumo claro por passageiro.
4. **Compatibilidade multiempresa/RLS**: qualquer nova tabela/campo deve manter filtro por `company_id`.
5. **Auditoria**: sem snapshot textual do tipo no ticket, mudanças de cadastro podem invalidar rastreabilidade histórica.

---

## 6) Recomendações de produto

1. Nome conceitual recomendado: **Tipo de passagem** (genérico, escalável e alinhado ao pedido).
2. “Adulto/Criança” devem ser apenas **exemplos de seed/padrão**, nunca enum fixa.
3. Campos mínimos por tipo (viáveis e suficientes para fase 1):
   - nome,
   - preço,
   - descrição opcional,
   - ativo/inativo,
   - regra simples opcional (texto curto ou metadado simples, sem validação automática por idade).
4. Não aplicar bloqueio inteligente por idade nesta fase.

---

## 7) Sugestão de UX para a guia Passagens (desktop-first, sem novo padrão)

Diagnóstico visual: a aba atual é longa e com cards altos/empilhados.

Sugestão de melhoria incremental reutilizando padrão existente:
1. Manter cards atuais, mas reorganizar topo em **duas colunas** (desktop):
   - esquerda: configuração/Tipos de passagem,
   - direita: canais + taxa/simulação resumida.
2. Inserir bloco **compacto em formato tabela/lista** para Tipos de passagem (linhas curtas), com botão **“Adicionar tipo de passagem”**.
3. Exibir **resumo rápido** no topo do card (ex.: “4 tipos ativos • menor R$ X • maior R$ Y”).
4. Reduzir altura vertical de campos e espaçamentos usando o mesmo padrão de inputs compactos já usado em listas de taxas.
5. Preservar `unit_price` como fallback/legado com rótulo claro (ex.: “Preço base legado / fallback”).

---

## 8) Melhor abordagem recomendada

**Faseamento seguro (recomendado):**
1. Introduzir configuração de tipos por evento no admin (sem remover fluxo atual).
2. Adaptar checkout para selecionar tipo e gravar snapshot por passageiro.
3. Adaptar venda manual/admin com a mesma regra.
4. Atualizar ticket/confirmação/relatórios para exibir tipo comprado a partir do snapshot.
5. Só depois considerar regras automáticas avançadas (idade etc.).

Isso minimiza risco de quebra em vendas, taxas e pagamentos, pois reaproveita o mecanismo já consolidado de snapshot financeiro por passageiro.

---

## 9) Estruturas existentes reaproveitáveis

1. **`event_category_prices`**: já prova que o sistema suporta pricing adicional por evento (padrão de tabela ligada a evento + company_id).
2. **`event_services`**: padrão de item configurável por evento com `is_active`, `base_price`, etc., útil como referência de UX/listagem compacta.
3. **`sale_passengers` -> `tickets` snapshot**: mecanismo ideal para preservar “tipo comprado” para auditoria.
4. **`event_fees` UI compacta**: referência de componente/lista para não inventar novo padrão visual.

---

## 10) PRD relacionado (criar/atualizar)

Recomendação:
1. **Atualizar** PRD de checkout público (`docs/PRD/Telas/prd-public-checkout.md`) com nova etapa/regra de tipo de passagem por passageiro.
2. **Atualizar** PRD de telas admin (`docs/PRD/Telas/02-prd-telas-admin.md`) para detalhar a nova seção na guia Passagens.
3. **Criar** PRD específico “Tipos de passagem por evento” consolidando:
   - modelo de dados,
   - regras de retrocompatibilidade,
   - impacto em relatórios,
   - contrato de snapshot e auditoria.

---

## 11) Perguntas pendentes antes de implementar

1. Em venda manual, o operador poderá sobrescrever o preço do tipo selecionado?
2. Tipo inativo pode permanecer visível em vendas antigas/relatórios (esperado: sim, via snapshot)?
3. Qual comportamento no checkout quando tipo esgota (se houver controle futuro de estoque por tipo)?
4. Será obrigatório selecionar tipo por passageiro sempre, ou pode aplicar “em lote” e ajustar individualmente?
5. Em eventos com `use_category_pricing`, precedência de preço será:
   - tipo de passagem,
   - categoria de assento,
   - ou combinação (ex.: tipo define base e categoria ajusta)?
6. Como relatório financeiro deve quebrar receita por tipo sem afetar relatórios legados?

---

## 12) Resposta objetiva à decisão solicitada

- **É viável implementar tipos de passagem por evento?**
  - **Sim, é viável** e tecnicamente compatível com a arquitetura atual, especialmente porque o sistema já usa snapshot financeiro por passageiro.

- **O melhor nome conceitual é “Tipo de passagem”?**
  - **Sim.** É neutro, escalável e não limita o produto a faixas etárias.

- **Devemos usar “Adulto/Criança” apenas como exemplos padrão?**
  - **Sim.** Como presets opcionais, não como valores fixos obrigatórios.

- **Qual o menor caminho seguro para implementar depois?**
  - Criar configuração de tipos por evento (com `company_id`), manter `unit_price` legado, adaptar checkout/admin para seleção e snapshot por passageiro, e exibir no ticket/relatórios.

- **Quais partes exigem mais cuidado para não quebrar vendas, taxas, tickets e pagamentos?**
  1. Cálculo e persistência de `gross_amount` vs `sale_passengers.final_price`.
  2. Compatibilidade com `create-asaas-payment` e validações de consistência.
  3. Geração/atualização de tickets a partir de snapshots.
  4. Relatórios que ainda presumem preço unitário único por venda.
  5. Retrocompatibilidade total para eventos legados sem tipos configurados.
