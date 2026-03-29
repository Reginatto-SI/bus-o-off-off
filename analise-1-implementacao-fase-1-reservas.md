# Implementação Fase 1 — Política de reservas por empresa (Smartbus BR)

## 1) O que foi implementado

### 1.1 Política de reservas por empresa (`/admin/empresa`)
- Adicionados dois parâmetros no cadastro da empresa:
  - `allow_manual_reservations` (sim/não);
  - `manual_reservation_ttl_minutes` (armazenamento técnico em minutos totais).
- Na UI da empresa, a configuração é feita em formato humano:
  - campo **Horas**;
  - campo **Minutos**;
  - validação para impedir duração zero.

### 1.2 Aplicação automática no fluxo de criação de reserva (`NewSaleModal`)
- A validade da reserva administrativa passou a usar a política da empresa (com fallback conservador de 72h).
- O fluxo exibe claramente:
  - duração aplicada;
  - data/hora prevista de expiração.
- A aba “Reserva” respeita `allow_manual_reservations` (desabilita criação quando a empresa não permite).

### 1.3 Visibilidade operacional em `/admin/vendas`
- Para vendas em `reservado`, a tabela agora exibe:
  - “Expira em Xh Ymin” ou “Vencida há Xh Ymin”;
  - tooltip com data/hora exata de vencimento.
- Mantida a sinalização operacional já existente para casos vencidos aguardando convergência do cleanup.

### 1.4 Base de dados (migration)
- Criada migration para adicionar os campos de política na tabela `companies`.
- Incluída constraint para garantir `manual_reservation_ttl_minutes > 0`.

---

## 2) Arquivos alterados

- `supabase/migrations/20261105090000_add_company_reservation_policy.sql`
- `src/types/database.ts`
- `src/integrations/supabase/types.ts`
- `src/pages/admin/Company.tsx`
- `src/components/admin/NewSaleModal.tsx`
- `src/pages/admin/Sales.tsx`

---

## 3) Decisões tomadas

1. **Armazenamento técnico em minutos totais**
   - Simplifica cálculos de expiração e preserva consistência com backend/cleanup.
   - UX permanece em horas + minutos (usuário não técnico não vê “minutos totais”).

2. **Fallback de 72h no modal de venda**
   - Evita regressão em empresas ainda não hidratadas com a nova política.

3. **Escopo restrito da fase 1**
   - Sem override manual livre de prazo no ato da reserva.
   - Sem mudanças estruturais em dashboard/relatórios/manifesto.

4. **Previsibilidade operacional**
   - Reforçada leitura de expiração em `/admin/vendas` com linguagem direta e tooltip de data/hora final.

---

## 4) Validações executadas

### Build/Type safety
- `npm run build` executado com sucesso após os ajustes.

### Regras de validação implementadas
- Horas: inteiro >= 0.
- Minutos: inteiro entre 0 e 59.
- Duração total obrigatoriamente > 0.
- Fluxo de reserva bloqueado na aba “Reserva” quando `allow_manual_reservations = false`.

### Cenários cobertos pela implementação
- 00h40, 01h30, 06h00, 24h00, 72h00;
- horas zeradas com minutos válidos;
- minutos zerados com horas válidas;
- duração zero bloqueada.

---

## 5) Riscos remanescentes

1. **Dados legados sem política explícita**
   - Mitigado por fallback de 72h no frontend.

2. **Reserva vencida antes da convergência automática**
   - Continua dependente da execução do cleanup (comportamento já existente e intencional).

3. **Regra “allow_manual_reservations” aplicada apenas à aba Reserva**
   - Venda Manual segue fluxo atual (nasce reservada por desenho do produto), mantendo compatibilidade operacional.

---

## 6) Resultado da fase 1

Com esta entrega, o sistema passa a permitir:
- política de reserva por empresa;
- configuração flexível em horas e minutos;
- aplicação automática da validade no fluxo administrativo;
- leitura operacional clara de expiração em `/admin/vendas`.

Sem quebrar as regras já consolidadas:
- `pago` permanece confirmação oficial;
- multiempresa preservado;
- cleanup existente mantido.
