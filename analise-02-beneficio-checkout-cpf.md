# Análise 02 — Integração de Programa de Benefício no Checkout (por passageiro via CPF)

## 1. Resumo executivo

O checkout público já possui um fluxo estruturado em 3 etapas na tela (`assentos → passageiros → pagamento`), mas o fluxo completo da compra começa antes, na página de detalhe do evento, onde o usuário escolhe viagem, embarque e quantidade, e só depois entra no checkout.

Hoje, a venda é criada com preço agregado em `sales` (`quantity`, `unit_price`, `gross_amount`) e os passageiros são armazenados separadamente em `sale_passengers` com CPF individual por assento/ordem. Isso cria uma separação importante:

- **Dados de passageiro já são individuais** (incluindo CPF),
- **Dados financeiros continuam predominantemente agregados** na venda.

Também já existe base de Programas de Benefício + CPFs elegíveis + vínculos por evento e empresa, além de uma função compartilhada (`getEligibleBenefitsByPassenger`) que consulta elegibilidade por CPF/evento/empresa. Porém, essa função ainda não está integrada ao checkout e, por desenho atual, retorna **todos os matches elegíveis** sem definir desempate/prioridade.

Diagnóstico central: o sistema está próximo de suportar validação por passageiro no nível de elegibilidade, mas ainda não possui persistência explícita do benefício aplicado por passageiro nem trilha financeira per-passenger para consolidar preço final por passageiro de forma auditável ponta a ponta.

---

## 2. Fluxo atual do checkout (mapeado passo a passo)

## 2.1. Pré-checkout (página de evento)

1. Usuário seleciona ida (`trip`), local de embarque (`location`), quantidade e, se aplicável, volta (`return_trip`).
2. O sistema valida disponibilidade por política de transporte.
3. Navega para `/eventos/:id/checkout` com query params:
   - `trip`
   - `location`
   - `quantity`
   - `time` (quando existe)
   - `return_trip` (quando existe)
   - `ref` (vendedor, quando existe)

## 2.2. Checkout público — Etapa 1 (assentos)

- Carrega `event`, `trip`, `boarding_location`, `seats`, status de assentos ocupados/bloqueados e taxas.
- Usuário seleciona assentos.
- Antes de avançar para passageiros, o sistema revalida disponibilidade (`tickets` + `seat_locks`).

## 2.3. Checkout público — Etapa 2 (passageiros)

- Ao avançar da etapa 1, o array `passengers` é inicializado no estado local (`name`, `cpf`, `phone`) com 1 item por assento selecionado.
- CPF é digitado por passageiro, com máscara e validação local.
- Regras atuais de validação:
  - nome mínimo,
  - CPF com 11 dígitos e válido,
  - CPF não duplicado na mesma compra,
  - pagador (`payerIndex`) deve ter CPF válido.

## 2.4. Checkout público — Etapa 3 (pagamento)

No submit final:

1. Revalida assentos e capacidade.
2. Calcula total financeiro da venda (incluindo taxas) com base no preço atual do evento/assentos.
3. Cria `seat_locks` temporários.
4. Insere `sales` com `status = pendente_pagamento`, `quantity`, `unit_price`, `gross_amount` e dados do pagador.
5. Insere `sale_passengers` com um registro por passageiro (CPF individual).
6. Chama Edge Function `create-asaas-payment`.
7. Em confirmação de pagamento (webhook/verificação), `sale_passengers` é convertido em `tickets` e depois limpo.

## 2.5. Momento atual em que o CPF “vira dado persistido”

- O CPF nasce no estado local da etapa de passageiros.
- Só é persistido ao enviar compra:
  - CPF do pagador vai para `sales.customer_cpf`.
  - CPF de cada passageiro vai para `sale_passengers.passenger_cpf`.

Observação: durante digitação, não há persistência nem chamada de elegibilidade por CPF no checkout atual.

---

## 3. Estrutura atual de dados

## 3.1. Onde os passageiros são persistidos

- **Checkout em andamento (pré-ticket):** `sale_passengers`
- **Pós-pagamento confirmado:** `tickets` (dados do passageiro por bilhete)
- **Resumo da venda:** `sales` (com dados do pagador e valores agregados)

## 3.2. Onde o CPF está armazenado

- `sales.customer_cpf`: CPF do responsável pelo pagamento (não necessariamente todos os passageiros).
- `sale_passengers.passenger_cpf`: CPF por passageiro na fase de staging.
- `tickets.passenger_cpf`: CPF por passageiro após emissão efetiva do bilhete.

## 3.3. Como o preço está representado hoje

Em `sales`:

- `unit_price`: preço unitário base da venda (atualmente preenchido com `event.unit_price` no checkout público).
- `quantity`: quantidade de passagens.
- `gross_amount`: total cobrado (inclui composição de taxas do checkout).

Em `sale_passengers` e `tickets`:

- **não existe campo financeiro por passageiro** (preço original, desconto, preço final etc.).

## 3.4. Resposta à pergunta crítica: existe preço por passageiro hoje?

**Não há modelo explícito de preço por passageiro persistido.**

O que existe é:

- agregação financeira em `sales`,
- granularidade de identidade (passageiro/CPF) em `sale_passengers` e `tickets`.

Logo, hoje o conceito operacional é “venda com total agregado”, sem trilha financeira individual por passageiro.

---

## 4. Pontos de integração possíveis (sem implementar)

## 4.1. Ponto funcional mais aderente ao fluxo

O ponto natural para validação de benefício por CPF é a **etapa de passageiros (step 2)**, porque:

- CPF já é coletado individualmente por passageiro,
- ainda não houve criação de `sales`/`sale_passengers`,
- o usuário pode revisar impacto antes de avançar para pagamento.

## 4.2. Opções de gatilho no momento da validação

### A) Ao digitar
- Prós: feedback imediato.
- Riscos: chamadas excessivas, oscilação de UI com CPF incompleto, ruído operacional.

### B) Ao sair do campo (blur)
- Prós: reduz chamadas e mantém feedback cedo.
- Riscos: pode haver múltiplos pontos de inconsistência se o usuário editar novamente.

### C) Ao avançar etapa (step 2 → step 3)
- Prós: regra determinística, menos chamadas, ponto único de decisão.
- Riscos: feedback mais tardio.

Pelo requisito de previsibilidade/auditabilidade e evitar comportamento “mágico”, o gatilho em **transição de etapa** é o mais coerente para decisão oficial. Feedback prévio pode existir, mas a decisão final precisa de validação em ponto único.

## 4.3. Onde a lógica deve rodar

- Existe função compartilhada no frontend (`getEligibleBenefitsByPassenger`) para consulta.
- Porém, somente frontend não garante consistência nem proteção contra manipulação.

Diagnóstico técnico:

- **Frontend**: adequado para feedback e contexto visual.
- **Backend** (ou camada persistente confiável): necessário para decisão final auditável no fechamento da venda.

Importante: hoje não há evidência de validação de benefício no backend de criação da venda/pagamento.

---

## 5. Impacto técnico

## 5.1. Impacto no cálculo financeiro

Hoje os cálculos no checkout e no pagamento usam:

- `quantity`,
- `unit_price`,
- `gross_amount`.

Com benefício por passageiro, haverá potencial de múltiplos preços dentro da mesma venda (passageiro A com benefício, B sem, C com regra distinta). Isso impacta:

1. cálculo do subtotal e total no frontend,
2. valor persistido em `gross_amount`,
3. consistência com cobrança gerada na Edge Function,
4. relatórios que hoje ainda usam fallback `quantity * unit_price` em vários pontos.

## 5.2. O sistema suporta múltiplos preços na mesma venda hoje?

**Parcialmente (indireto), mas não explicitamente modelado por passageiro.**

- Consegue armazenar total agregado final (`gross_amount`) que poderia refletir composição mista.
- Não consegue auditar de forma explícita “quanto cada passageiro pagou/quanto foi descontado” porque `sale_passengers` e `tickets` não carregam campos financeiros.

## 5.3. Impactos prováveis na estrutura (sem propor desenho final)

No mínimo haverá impacto em:

- persistência da evidência do benefício aplicado por passageiro,
- cálculo de totais antes de criar `sales`,
- pontos de leitura financeira (admin, relatórios, confirmação),
- trilha de auditoria para evitar descontos duplicados ou divergentes.

---

## 6. Estrutura mínima necessária (apenas diagnóstico)

Sem propor arquitetura nova, a integração por CPF por passageiro tende a exigir, no mínimo:

1. **Função de validação de elegibilidade por passageiro** no fluxo de checkout (já existe base reutilizável em `benefitEligibility`).
2. **Ponto único de recálculo financeiro** após validar todos os passageiros e antes da criação de `sales`.
3. **Persistência da decisão aplicada** (não só elegibilidade), para auditoria futura.
4. **Conciliação com `sales`** para garantir que o valor cobrado (`gross_amount`) represente exatamente a soma final dos passageiros + taxas.
5. **Compatibilidade com pós-pagamento** (geração de tickets sem perda do contexto do benefício aplicado).

---

## 7. Regras de negócio que precisam ser garantidas (estado atual vs. lacunas)

## 7.1. 1 benefício por passageiro

- Não há implementação dessa regra no checkout atual.
- A função de elegibilidade atual pode retornar múltiplos programas para o mesmo CPF/evento (sem desempate).
- Portanto, essa garantia **ainda não está fechada** no fluxo de compra.

## 7.2. Múltiplos passageiros com benefícios diferentes

- A coleta de CPF é individual e já suporta N passageiros.
- Porém, como não há persistência financeira por passageiro, o suporte é apenas estrutural no cadastro, não na trilha financeira detalhada.

## 7.3. CPF sem benefício não quebrar fluxo

- Hoje checkout não consulta benefício, então naturalmente não quebra por esse motivo.
- Quando integrar, será necessário preservar esse comportamento explicitamente.

## 7.4. Respeito a vigência, status, evento e empresa

A base de benefício já contempla:

- status ativo/inativo,
- vigência no programa e no CPF elegível,
- vínculo por evento (ou todos os eventos),
- `company_id` com coerência multiempresa e RLS.

Ou seja, **a base de regras existe**; o que falta é acoplamento consistente dessas regras ao fechamento financeiro do checkout.

---

## 8. UX no checkout (diagnóstico)

Para evitar confusão, a UX precisará explicitar benefício no próprio contexto do passageiro (etapa 2 e resumo financeiro), sem esconder impacto no total.

Pontos de atenção observados no estado atual:

- O resumo atual mostra total agregado, sem decomposição por passageiro.
- Não existe no checkout indicação de “valor original vs valor final” por passageiro.
- Se houver aplicação silenciosa só no total final, a percepção será de comportamento “mágico”.

Logo, na integração futura, será necessário manter clareza em dois níveis:

1. **por passageiro** (status do benefício + efeito),
2. **no total da compra** (somatório coerente e rastreável).

---

## 9. Riscos e pontos críticos

1. **Divergência frontend x backend**
   - benefício calculado no cliente, mas valor final aceito diferente no servidor.
2. **Desconto duplicado**
   - aplicar no passageiro e reaplicar no total por engano.
3. **Ambiguidade de múltiplos programas elegíveis**
   - sem regra de desempate, duas execuções podem escolher benefícios distintos.
4. **Quebra de relatórios financeiros**
   - telas/queries que usam `quantity * unit_price` podem não refletir realidade de preços mistos.
5. **Inconsistência no pós-pagamento**
   - perda do histórico do benefício após converter `sale_passengers` em `tickets`.
6. **Manipulação indevida de CPF**
   - troca de CPF no último momento para capturar benefício sem trilha clara de decisão.
7. **Conflitos com precificação por categoria de assento**
   - checkout já admite preço por categoria; benefício por passageiro adiciona uma segunda dimensão de variação.

---

## 10. Dúvidas abertas (obrigatórias antes de implementar)

1. **Regra de prioridade/desempate**
   - Se um CPF for elegível em mais de um programa no mesmo evento/data, qual programa vence?
2. **Escopo do benefício com preço por categoria de assento**
   - O benefício incide sobre preço base do evento ou sobre preço real do assento/categoria?
3. **Ordem de cálculo**
   - Benefício é aplicado antes ou depois das taxas (`event_fees` / taxa de plataforma)?
4. **Persistência obrigatória para auditoria**
   - Qual nível de detalhe deve ficar salvo por passageiro (programa, regra, valor original, desconto, valor final)?
5. **Regras para ida/volta**
   - Em eventos com volta opcional/obrigatória, o benefício vale para ambos os trechos automaticamente?
6. **Alteração de CPF após validação**
   - Revalida automaticamente sempre que mudar CPF? Em qual ponto a decisão fica “congelada” para cobrança?
7. **Uso permitido em vendas administrativas**
   - A mesma regra deve valer no `NewSaleModal` (venda manual) ou apenas no checkout público?
8. **Limite de uso por CPF**
   - Existe limite por período/evento/quantidade de compras por CPF elegível?

---

## 11. Conclusão objetiva

- O projeto já tem **fundação de elegibilidade** (programas + CPFs + vínculos + validação utilitária).
- O checkout já tem **granularidade por passageiro para dados pessoais**, incluindo CPF.
- O gap principal está em **amarrar elegibilidade por passageiro ao cálculo financeiro e à auditoria persistida**.

Sem fechar as dúvidas de prioridade, ordem de cálculo e persistência mínima por passageiro, qualquer implementação corre risco de inconsistência financeira e comportamento pouco auditável.
