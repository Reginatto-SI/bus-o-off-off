# 1. Resumo executivo

- **Hoje já existe edição parcial de passagem no sistema**: na tela `/admin/vendas`, dentro de **Detalhes da Venda > aba Passageiros**, há um modal **"Editar Passageiro"** que permite alterar **nome** e **CPF** do passageiro em `tickets` (não aparece como ação no menu `...` da listagem principal).  
- **Não existe fluxo completo de edição de passagem/venda** (embarque, viagem, assento, telefone, comprador, etc.). O que existe é um ajuste pontual de dados do passageiro no ticket final.  
- **Há risco real de divergência de dados** porque o fluxo atual edita apenas `tickets.passenger_name` e `tickets.passenger_cpf`, sem sincronizar `sales` (comprador) nem qualquer staging remanescente em `sale_passengers`.  
- **CPF é dado crítico** no sistema atual: é usado em consulta pública de passagens (`ticket-lookup`), em elegibilidade de benefícios e em trilhas operacionais/financeiras. Edição direta irrestrita tende a prejudicar rastreabilidade.  
- **Recomendação mínima (fase 1)**: manter escopo enxuto e previsível, expondo edição somente de campos de baixo risco primeiro (ex.: telefone do passageiro no ticket), e tratar CPF com **correção formal auditada**, não edição livre.  

# 2. O que existe hoje

## Frontend (`/admin/vendas`)

- Na listagem principal, o menu de ações por venda contém (conforme status/contexto):
  - Ver Detalhes
  - Copiar Link
  - Gerar Passagem / Ver Comprovante
  - Cancelar Venda
  - Reverter para Reservado / Marcar como Pago
  - Pagar Taxa (quando aplicável)
- **Não há ação explícita "Editar passagem" no dropdown principal**.
- Existe edição de passageiro apenas dentro do modal de detalhes:
  - Aba `Passageiros`
  - Botão ícone lápis por ticket
  - Modal "Editar Passageiro — Assento X"
  - Campos editáveis: **Nome Completo** e **CPF**
  - Persistência: update direto em `tickets`
  - Log: grava `sale_logs` com ação `passageiro_editado`

## Backend / dados

- Estruturas centrais ativas no ciclo:
  - `sales` (metadados da venda/comprador/status financeiro-operacional)
  - `tickets` (artefato final operacional do passageiro, assento, embarque/check-in)
  - `sale_passengers` (staging do checkout público até confirmação/pagamento)
  - `sale_logs` (histórico textual de operações de venda)
  - `ticket_validations` (trilha de check-in/checkout via QR)
  - `seat_locks` (bloqueio temporário do checkout público)

# 3. Fluxo atual mapeado

## 3.1 Fluxo admin manual (`NewSaleModal`)

1. Cria `sales` com status `reservado` (ou `bloqueado` para bloqueio operacional).  
2. Cria `tickets` imediatamente com dados de passageiro/assento.  
3. Registra `sale_logs` de criação.  
4. Na tela `/admin/vendas`, usuário pode:
   - alterar status (`reservado` ↔ `pago` com regras de taxa),
   - cancelar venda,
   - editar nome/CPF do passageiro no ticket.

## 3.2 Fluxo checkout público

1. Cria `seat_locks` temporários.  
2. Cria `sales` em `pendente_pagamento`.  
3. Cria `sale_passengers` (snapshot por passageiro/benefício).  
4. Após confirmação de pagamento (webhook/reconciliação), rotina de finalização:
   - cria `tickets` a partir de `sale_passengers`,
   - remove `sale_passengers` (staging),
   - mantém venda `pago` com trilha operacional.

## 3.3 Onde entra a edição existente

- Edição atual ocorre **após tickets existirem**, diretamente em `tickets`, sem rotina transacional para refletir em outros agregados/fontes legadas.

# 4. Tabelas e fontes de verdade envolvidas

## Fonte de verdade por dado (estado atual)

- **Nome/CPF/telefone do comprador**: `sales.customer_name`, `sales.customer_cpf`, `sales.customer_phone`.
- **Nome/CPF/telefone do passageiro** (passagem efetiva): `tickets.passenger_name`, `tickets.passenger_cpf`, `tickets.passenger_phone`.
- **Staging pré-ticket (checkout público)**: `sale_passengers.passenger_*`.
- **Embarque da venda**: `sales.boarding_location_id` + horários em `event_boarding_locations` por combinação evento/viagem/embarque.
- **Viagem da venda**: `sales.trip_id` (com tickets podendo carregar ida/volta por `tickets.trip_id`).
- **Assento operacional**: `tickets.seat_id` / `tickets.seat_label` (com unicidade por `trip_id, seat_id`).
- **Status da venda**: `sales.status`.
- **Status de embarque/check-in**: `tickets.boarding_status`.
- **Consulta pública por CPF**: baseada em `tickets.passenger_cpf` (edge function `ticket-lookup`).
- **Histórico de ações administrativas de venda**: `sale_logs` (texto + old/new + usuário + timestamp).
- **Auditoria de validação QR/check-in**: `ticket_validations`.

# 5. Campos passíveis de edição

## Baixo risco (com validação simples)

- **Telefone do passageiro em `tickets.passenger_phone`**
  - Não altera ocupação de assento/capacidade.
  - Não muda status financeiro.
  - Ainda assim precisa log de alteração.

- **Nome do passageiro em `tickets.passenger_name`**
  - Já existe no sistema.
  - Impacta exibição em ticket/lista, mas não regras de ocupação/pagamento.
  - Deve ter guarda adicional após check-in (ver seção de risco).

## Médio risco (com validação extra + histórico obrigatório)

- **CPF do passageiro em `tickets.passenger_cpf`**
  - Impacta consulta pública, rastreabilidade e possíveis vínculos de benefício.
  - Exige trilha formal (quem/quando/por quê/antes/depois) e regras por status.

- **Local de embarque (`sales.boarding_location_id`)**
  - Pode quebrar coerência com horários, lista de embarque e contexto operacional do ticket.
  - Só com validação de compatibilidade evento+trip+embarque e restrições por status.

# 6. Campos sensíveis / de alto risco

- `sales.trip_id` (trocar viagem).
- `tickets.seat_id` / `tickets.seat_label` (trocar assento sem rotina de conflito transacional).
- `sales.customer_cpf` e `sales.customer_name` em venda já paga, quando divergir de tickets/documentos já emitidos.
- Alterações após `tickets.boarding_status` sair de `pendente`.
- Alterações em venda `cancelado` (histórico encerrado).

Esses campos **não devem** ser liberados em edição livre no estado atual sem desenho transacional e auditoria reforçada.

# 7. Análise específica sobre CPF

## Onde CPF é usado hoje

- `tickets.passenger_cpf`: consulta pública de passagens (`ticket-lookup`), exibição de ticket, validação operacional.
- `sales.customer_cpf`: payload financeiro/comprador em integrações de pagamento (ex.: criação de cobrança Asaas).
- Benefícios: elegibilidade por CPF e snapshots por passageiro no checkout (`benefit_program_eligible_cpf`, `sale_passengers`, `tickets` com snapshot de benefício).

## Riscos de editar CPF diretamente

- Pode causar **quebra de rastreabilidade histórica** (quem comprou vs quem está embarcando).
- Pode criar **desalinhamento entre venda e ticket** (CPF comprador em `sales` diferente do CPF passageiro no ticket, sem trilha formal suficiente).
- Pode afetar **consulta pública** imediatamente (passagem deixa de aparecer no CPF antigo e passa no novo).
- Pode comprometer auditoria de benefício/fraude quando mudança não é formalizada por motivo e governança.

## Avaliação das opções solicitadas

### Opção A — editar CPF livremente
- **Não recomendada** com o desenho atual.
- Sistema já permite algo próximo (edição de `tickets.passenger_cpf`), porém sem governança robusta por regra de status e sem trilha estruturada por campo.

### Opção B — correção formal com trilha obrigatória
- **Mais consistente com a arquitetura atual e com objetivo de previsibilidade/auditoria.**
- Aproveita padrão existente de `sale_logs`, mas exigiria enriquecer o registro para "correção CPF" com motivo e bloqueios por status (ex.: após check-in).
- Mantém mudança mínima sem reinventar arquitetura, se implementada de forma incremental.

### Opção C — não alterar CPF principal, só observação operacional
- É a opção mais conservadora, mas pode falhar operacionalmente para consulta pública por CPF e conferências reais.
- Útil como contingência, não como solução principal para erro real de cadastro.

## Conclusão CPF

- **Recomendação**: **Opção B** (correção formal controlada) é o melhor equilíbrio entre operação real e auditoria.
- CPF deve ter **imutabilidade condicional por status** (ex.: bloquear após embarque/check-in, e exigir processo excepcional).

# 8. Análise específica sobre embarque

- Embarque da venda está ligado a `sales.boarding_location_id` e ao horário resolvido em `event_boarding_locations` por `event_id + trip_id + boarding_location_id`.
- Alterar embarque pode impactar:
  - etiqueta/horário mostrado em ticket,
  - listas operacionais de embarque,
  - coerência com trip e com capacidade prática no ponto.
- Não há hoje, no frontend de vendas, fluxo consolidado para remanejamento de embarque com validações transacionais.

**Resposta direta**: sim, alterar embarque impacta capacidade/assento/viagem/check-in indiretamente e exige regras explícitas.

# 9. Análise específica sobre nome e telefone

- **Nome do passageiro**: já editável em `tickets`, com risco baixo-médio e necessidade de política por status.
- **Telefone do passageiro**: hoje não está no modal de edição do `/admin/vendas`, apesar de existir em `tickets.passenger_phone`; é candidato natural para fase 1 de edição segura.
- **Nome/telefone do comprador em `sales`**: usado em relatórios e fluxos financeiros; edição isolada sem sincronização clara pode gerar inconsistência com tickets já emitidos.

# 10. Impactos em ticket, check-in, relatórios e consulta pública

- **Ticket virtual/PDF**: consome dados de `tickets` (passageiro/CPF/assento/boarding status), então mudanças no ticket refletem imediatamente na visualização.
- **Check-in**: validação QR opera sobre `tickets` + `sales`; alterações indevidas podem mudar contexto operacional.
- **Consulta pública (`/consultar-passagens`)**: edge function busca por `tickets.passenger_cpf`; alteração de CPF muda resultado da busca.
- **Relatórios**:
  - muitos relatórios financeiros usam `sales.customer_*`;
  - relatórios operacionais/lista de embarque usam combinação de `sales` com `tickets` (inclusive `coalesce`), abrindo possibilidade de divergência sem sincronização.

# 11. Riscos de inconsistência

1. **Divergência venda vs ticket** (comprador em `sales` ≠ passageiro em `tickets`) sem semântica clara para operador.  
2. **Edição após check-in** pode gerar conflitos de auditoria operacional.  
3. **Ausência de lock transacional de assento/viagem/embarque** para remanejamentos complexos.  
4. **Log insuficiente por campo**: `sale_logs` é textual e flexível, mas não impõe estrutura obrigatória de motivo/campo.  
5. **Risco multiempresa/RLS** baixo nas rotas atuais (há `company_id` + policies), porém qualquer novo fluxo precisa manter esse padrão estritamente.

# 12. Lacunas encontradas no sistema atual

- Não existe ação explícita de "Editar passagem" no menu de ações de `/admin/vendas`.
- Edição existente cobre só nome/CPF do passageiro e somente na aba de detalhes.
- Não há rotina padronizada para editar telefone do passageiro, embarque, viagem ou assento.
- Não há histórico estruturado por campo com "motivo obrigatório" (há `sale_logs`, porém sem schema forte para tipo de correção).
- Não há política explícita no frontend impedindo edição de passageiro após check-in (o modal bloqueia apenas venda cancelada).

# 13. Recomendação mínima para fase 1

1. **Formalizar e limitar escopo**: edição apenas de dados cadastrais do passageiro no ticket (nome e telefone), e CPF via fluxo de correção formal.  
2. **Regra por status**:
   - permitir antes de check-in;
   - bloquear automaticamente após check-in/checkout (ou exigir perfil superior + motivo reforçado).  
3. **Auditoria mínima obrigatória** para cada correção:
   - campo alterado,
   - valor antigo,
   - valor novo,
   - motivo,
   - usuário,
   - data/hora,
   - `company_id`.
4. **Sem alterar embarque/viagem/assento na fase 1** (alto risco).  
5. **UI mínima**: reaproveitar modal existente em `/admin/vendas`, sem criar fluxo paralelo.

# 14. Evolução recomendada para fase 2

- Introduzir fluxo controlado de remanejamento (embarque/assento/viagem) com validações transacionais:
  - disponibilidade de assento,
  - compatibilidade evento/trip/boarding,
  - bloqueios por status operacional,
  - trilha auditável robusta.
- Estruturar melhor auditoria (ex.: log tipado por campo alterado e motivo obrigatório por domínio).
- Definir política formal de reconciliação entre dados de comprador (`sales`) e passageiro (`tickets`).

# 15. Perguntas que ainda precisam ser respondidas

1. Qual regra oficial de negócio para **CPF do comprador vs CPF do passageiro** (podem divergir legitimamente em quais cenários)?  
2. Após `checked_in`, existe algum cenário operacional autorizado para corrigir CPF/nome?  
3. Em correção de CPF, deve-se refletir também em artefatos externos já emitidos (quando houver)?  
4. Qual nível de permissão mínimo para correção de CPF (somente gerente ou também operador)?  
5. Quais relatórios internos dependem de CPF do comprador (`sales`) versus CPF do passageiro (`tickets`) para evitar leituras erradas.

# 16. Checklist final de conclusão

- [x] Foi confirmado que há **edição parcial** de passageiro em `/admin/vendas` (nome + CPF em `tickets`).
- [x] Foi confirmado que **não existe fluxo completo** de edição de passagem.
- [x] Foram mapeadas fontes de verdade (`sales`, `tickets`, `sale_passengers`, `sale_logs`, `ticket_validations`).
- [x] Foram identificados campos de baixo risco, médio risco e alto risco.
- [x] CPF foi tratado como caso crítico com avaliação das opções A/B/C.
- [x] Foi definida recomendação mínima segura e auditável para fase 1.
- [x] Foram listadas lacunas e dúvidas que exigem validação antes de implementação.

---

## Respostas objetivas às 15 perguntas solicitadas

1. **Hoje existe fluxo de edição de passagem no sistema?**  
   Parcialmente: existe edição de nome/CPF de passageiro em `tickets` via detalhes da venda.

2. **Se existe, onde está e como funciona?**  
   Em `/admin/vendas` → Ver Detalhes → aba Passageiros → botão lápis; salva em `tickets` e registra `sale_logs`.

3. **Se não existe completo, há base técnica pronta ou seria criação nova?**  
   Há base parcial (UI + update + log textual). Edição completa exigirá extensão nova controlada.

4. **Quais campos podem ser editados com baixo risco?**  
   Nome e telefone do passageiro no ticket (com trava por status + log).

5. **Quais campos só com validação extra?**  
   CPF do passageiro e local de embarque.

6. **Quais campos não devem ser editados livremente?**  
   Viagem, assento, status crítico, e dados pós-check-in/pós-cancelamento.

7. **CPF pode ser editado com segurança?**  
   Não de forma livre; apenas com governança e trilha obrigatória.

8. **Se CPF não puder ser livre, qual abordagem mínima auditável?**  
   Correção formal (Opção B), com motivo obrigatório e bloqueio por status.

9. **Alterar embarque impacta capacidade, assento, viagem ou check-in?**  
   Sim, potencialmente todos esses pontos.

10. **Alterar nome/CPF/telefone precisa refletir onde?**  
    Pelo menos em `tickets`; dependendo da política, também reconciliar campos de `sales` para evitar ambiguidade comprador/passageiro.

11. **Existe risco de divergência entre venda e ticket?**  
    Sim, já existe risco no modelo atual.

12. **Existe risco de quebrar relatórios/consulta?**  
    Sim, principalmente quando relatórios usam `sales` e consulta pública usa `tickets.passenger_cpf`.

13. **Existe risco de furar RLS/multiempresa/consistência?**  
    No estado atual, RLS/multiempresa está bem ancorado; risco aparece se novo fluxo não respeitar `company_id` e policies existentes.

14. **Solução mínima fase 1?**  
    Expansão mínima do modal existente com foco em dados cadastrais do passageiro, CPF apenas via correção formal auditada e bloqueio pós-check-in.

15. **Evolução fase 2?**  
    Remanejamento operacional completo (embarque/assento/viagem) com transação, validação forte e auditoria estruturada.
