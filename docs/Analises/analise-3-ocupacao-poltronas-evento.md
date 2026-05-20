# Análise 3 — Ocupação de poltronas por evento/trecho

## 1) Resumo executivo
- O bug crítico é real e tem risco de overbooking quando o mapa visual usa critérios diferentes entre checkout público e venda manual.
- A base já possui RPC central (`get_trip_seat_occupancy`) com regra por **evento + veículo + empresa** e com união de `tickets`, `sale_passengers` e `seat_locks` ativos.
- Porém, checkout e admin ainda faziam leituras paralelas de `seat_locks` filtradas por `trip_id`, criando divergência de fonte e comportamento assimétrico.
- Correção aplicada: **checkout público e venda manual passaram a usar exclusivamente a mesma RPC** para ocupação/bloqueio visual e revalidação antes de concluir.
- Não foi necessária migration nesta entrega (a regra SQL já estava centralizada no banco).

## 2) Evento analisado
- Evento informado: `d8af7267-3560-495d-8b31-1590eeca36f3`.
- A análise de código foi feita para o fluxo desse evento e para generalização multiempresa/multievento.

## 3) Tabelas/entidades investigadas
- `events`, `trips`, `vehicles`, `seats`, `sales`, `tickets`, `sale_passengers`, `seat_locks`.
- Função SQL central: `public.get_trip_seat_occupancy(uuid)`.

## 4) Vendas encontradas para o evento
- **Pendência de ambiente**: neste repositório não há credencial ativa para consultar o banco de produção/staging diretamente durante esta execução.
- Portanto, a listagem nominal de vendas por `event_id` deve ser executada no ambiente conectado (SQL Editor/Supabase) com query por `sales.event_id`.

## 5) Passageiros/passagens encontradas
- Mesma limitação de acesso de ambiente para extração dos registros reais do evento nesta sessão.
- A regra no código considera:
  - passagens materializadas em `tickets`;
  - passagens em staging de checkout em `sale_passengers`.

## 6) Assentos de ida encontrados
- Regrados por `trip_id` dos trips irmãos do mesmo `event_id + vehicle_id + company_id`.

## 7) Assentos de volta encontrados
- Idem ida: a RPC não trata ida/volta de forma isolada por trip único quando o veículo físico é o mesmo.

## 8) Status considerados
- Na RPC:
  - `tickets`: ignora venda com `sales.status = 'cancelado'`.
  - `sale_passengers`: ocupa para `pendente_pagamento`, `reservado`, `pago`, `bloqueado`.
  - `seat_locks`: ocupa enquanto `expires_at > now()`.

## 9) Regra atual identificada no código
- Fonte única de ocupação: `get_trip_seat_occupancy`.
- A função agrega ocupação por poltrona física no mesmo evento/veículo/empresa e cobre fallback por `seat_label` quando `seat_id` é nulo.

## 10) Divergência encontrada
- Checkout público e admin ainda consultavam `seat_locks` separadamente por `trip_id` além da RPC.
- Isso criava duas fontes de verdade no frontend e risco de desencontro visual/lógico.

## 11) Causa raiz
- Divergência entre regra centralizada no banco e composição local no frontend (RPC + consulta extra).
- Em cenários de ida/volta ou lock em trip relacionado, a leitura adicional por `trip_id` podia não refletir exatamente a mesma ocupação agregada.

## 12) Arquivos alterados
- `src/pages/public/Checkout.tsx`
- `src/components/admin/NewSaleModal.tsx`

## 13) Correção aplicada
- Removida leitura paralela de `seat_locks` nas duas telas.
- Mantida somente a RPC compartilhada para:
  - pintar assentos ocupados/bloqueados;
  - revalidar assentos antes de avançar/finalizar venda.

## 14) Necessidade de migration
- **Não** nesta entrega.
- A migration de centralização já existe no projeto (`get_trip_seat_occupancy` com ocupação por evento+veículo+empresa).

## 15) Riscos restantes
- Necessário validar com dados reais do evento no ambiente conectado para responder a contagem/IDs exatos de vendas e passageiros.
- Se houver legado extremo de `seat_label` fora do padrão do layout atual, pode exigir normalização histórica pontual.

## 16) Checklist de testes manuais
- [ ] Abrir checkout público do evento informado e comparar ocupação com vendas reais.
- [ ] Tentar selecionar assento já vendido/reservado.
- [ ] Abrir venda manual admin para o mesmo evento/trip e comparar mapa.
- [ ] Tentar concluir venda manual em assento já ocupado.
- [ ] Confirmar comportamento após expiração de `seat_locks`.
- [ ] Confirmar que canceladas não bloqueiam indevidamente.

## 17) Checklist de testes técnicos
- [x] Revisão de chamadas de ocupação no checkout para usar apenas RPC.
- [x] Revisão de chamadas de ocupação no admin para usar apenas RPC.
- [x] Revalidação pré-submit alinhada entre checkout/admin.

## 18) Conclusão objetiva
- A correção de código aplicada elimina a divergência de regra entre checkout e venda manual, usando uma única fonte de ocupação.
- Para fechar 100% da auditoria do evento `d8af7267-3560-495d-8b31-1590eeca36f3` com lista de vendas/passagens/assentos reais, é necessária execução no ambiente Supabase conectado com dados do evento.
