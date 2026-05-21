# Correção definitiva — RPC `get_trip_seat_occupancy` está quebrada no banco

## Causa raiz (com evidência reproduzida agora)

A RPC oficial de ocupação **está falhando para qualquer chamada** desde a migration `20260520120000_fix_seat_occupancy_by_trip_segment.sql`. Reproduzido via `psql`:

```text
ERROR: invalid escape string
HINT:  Escape string must be empty or one character.
CONTEXT: SQL function "get_trip_seat_occupancy" during startup
```

Olhei a definição instalada com `pg_get_functiondef` e o problema está nas quatro cláusulas:

```sql
and not seat_by_label.label like '\_legacy\_%' escape '\\'
and not seat_by_label.label like '\_tmp\_%'    escape '\\'
```

Com `standard_conforming_strings = on` (padrão atual), `'\\'` é a string de **2 caracteres** `\\`. O operador `ESCAPE` exige **exatamente 1 caractere** → a função aborta no startup, antes de retornar qualquer linha.

### Consequência operacional (bate 1:1 com o que o usuário descreve)

- Checkout público abre o mapa → RPC falha → array vazio → todas as poltronas pintadas como disponíveis.
- Admin "Nova venda" abre o mapa → mesma RPC → mesmo array vazio → "22 passagens, tudo livre".
- Empresa piloto / sem taxa: mesmo bug (não tem nada a ver com Asaas/taxa).
- Risco real de **dupla venda** porque o front pinta livre, e o usuário consegue selecionar. A segunda barreira (triggers `assert_physical_seat_available_for_*`) continua funcionando, então no momento do INSERT do ticket o banco bloqueia — mas isso só aparece como erro genérico, não previne a tentativa.

Ou seja: a regra do PRD (`per trip_id`, seções 8 e 5) está **correta** no SQL atual. O que está errado é uma cláusula `ESCAPE` mal escrita que derruba a função inteira.

## Correção mínima

Uma única migration recriando `public.get_trip_seat_occupancy` com a mesma lógica de hoje (per-trip, com fallback por `seat_label`, ticket + sale_passenger + seat_lock), trocando apenas o caractere de escape para algo seguro:

```sql
and seat_by_label.label not like '#_legacy#_%' escape '#'
and seat_by_label.label not like '#_tmp#_%'    escape '#'
```

Por que `#`:
- não conflita com nenhum label de assento real (rótulos são numéricos/“VOLTA-N”);
- é 1 caractere, satisfaz a regra do `ESCAPE`;
- mantém a intenção original (excluir labels técnicos `_legacy_*` e `_tmp_*`).

Mantenho intacto:
- escopo per-trip (PRD seção 8);
- união tickets + sale_passengers + seat_locks ativos (PRD seções 4 e 6);
- filtro `sales.status <> 'cancelado'` (PRD seção 11);
- `SECURITY DEFINER`, `search_path = public`, `GRANT EXECUTE TO anon, authenticated` (PRD seção 12);
- triggers `assert_physical_seat_available_for_ticket` / `_for_lock` que já protegem contra dupla venda — não mexo neles, continuam ativos.

## O que NÃO vou alterar

- Asaas, webhook, verify, split, comissão, taxa da plataforma.
- Frontend (`Checkout.tsx`, `NewSaleModal.tsx`, `SeatMap.tsx`, `SeatButton.tsx`, `tripSeatOccupancyRpc.ts`).
- Fluxo de venda manual, criação de tickets, ou regra de ida/volta.
- Não crio fluxo paralelo, não toco em arquitetura.

## Plano de validação (vou executar via `psql` após aplicar)

1. `select count(*) from get_trip_seat_occupancy('<trip_ida_7FEST>')` deve retornar valor coerente com tickets reais da IDA (esperado >0 nos eventos do 7 FEST, que tem 808 vendas pagas).
2. Mesmo teste no BUSÃO OFF OFF (570 vendas pagas).
3. Idem para um trip de **VOLTA** com tickets — deve refletir vendas da volta corretamente (per-trip).
4. Conferir que um trip vazio retorna 0 linhas sem erro.
5. Checkout anônimo no preview → mapa carrega sem erro de rede em `rpc/get_trip_seat_occupancy` e poltronas vendidas aparecem ocupadas.
6. `/admin/vendas` → "Nova venda" no mesmo evento → mesmas poltronas aparecem ocupadas.
7. Conferir que tentativa de inserir ticket em assento já vendido continua bloqueada pelo trigger (proteção transacional contra dupla venda — PRD seção 10).

## Riscos

- Risco principal é regressão de leitura. Mitigado porque o conteúdo SQL é idêntico ao que já foi revisado em `20260520120000`, alterando apenas 2 caracteres de escape inválidos. A função volta a executar.
- Sem impacto em escrita, em fluxo de pagamento, em RLS, em outras funções.

## Pós-correção

- Atualizar `docs/Analises/analise-3-ocupacao-poltronas-evento.md` com o achado real (cláusula `ESCAPE` inválida) para não regredir.
- Marcar os critérios de aceite executados do PRD `prd-ocupacao-poltronas-reserva-bloqueio.md` seção 13.
