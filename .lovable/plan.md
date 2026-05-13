## Causa raiz

A tabela `public.tickets` não possui policy RLS de SELECT para usuários anônimos. O checkout público (`src/pages/public/Checkout.tsx`) lê `tickets` diretamente para descobrir assentos ocupados — RLS bloqueia silenciosamente e devolve `[]`, fazendo todas as poltronas aparecerem disponíveis mesmo quando há vendas pagas.

Confirmado no evento de exemplo (Pedro Leopoldo Rodeio Show / BUSAO OFF OFF): existem tickets pagos na trip de ida apontando corretamente para `seat_id` válidos do veículo atual; o problema é puramente de leitura pública.

`seat_locks` e `sales(status='bloqueado')` já têm acesso público, então locks temporários e bloqueios admin já funcionam — só vendas pagas estavam invisíveis.

## Solução (mudança mínima)

Não vou abrir a tabela `tickets` inteira ao público (PII: nome, CPF, telefone). Em vez disso, criar uma RPC `SECURITY DEFINER` que retorna apenas o que o mapa de assentos precisa, e trocar a chamada do checkout para usá-la.

### 1. Migration SQL

Criar função:

```sql
create or replace function public.get_trip_seat_occupancy(_trip_id uuid)
returns table (seat_id uuid, is_blocked boolean)
language sql
stable
security definer
set search_path = public
as $$
  select t.seat_id,
         coalesce(s.status = 'bloqueado', false) as is_blocked
  from public.tickets t
  left join public.sales s on s.id = t.sale_id
  where t.trip_id = _trip_id
    and t.seat_id is not null
    and exists (
      select 1 from public.trips tr
      join public.events e on e.id = tr.event_id
      where tr.id = _trip_id and e.status = 'a_venda'
    );
$$;

grant execute on function public.get_trip_seat_occupancy(uuid) to anon, authenticated;
```

A função só expõe `seat_id` + flag de bloqueio, e só para trips de eventos `a_venda`. Sem PII, sem `sale_id`, sem dados de passageiro.

### 2. Frontend

**`src/pages/public/Checkout.tsx`** — em `fetchOccupiedSeats` (linhas ~440-510) e na revalidação pré-compra (linhas ~739-746), substituir a query direta de `tickets` + a query de `sales` bloqueadas por uma única chamada:

```ts
const { data: occupancy } = await supabase.rpc('get_trip_seat_occupancy', { _trip_id: tripUuid });
// occupancy: [{ seat_id, is_blocked }]
```

Derivar `blockedSeatIds` (is_blocked = true) e `occupiedSeatIds` (is_blocked = false). Manter a query paralela de `seat_locks` (já funciona). Manter o realtime de `tickets` (a subscription já recebe eventos via REPLICA IDENTITY FULL, e ao receber faz refetch via RPC).

### 3. Admin não precisa mudar

`NewSaleModal.tsx` roda autenticado como admin → já tem acesso direto a `tickets` via policy `Admins can manage tickets`. Mantém a leitura atual.

## Por que não simplesmente abrir RLS de tickets

Tickets contêm `passenger_name`, `passenger_cpf`, `passenger_phone`, `qr_code_token`. Expor tudo para anon seria vazamento sério de PII e dos tokens de validação dos QR codes. RPC com colunas restritas é a forma mínima e segura.

## Validação

1. Reabrir o checkout do evento da BUSAO OFF OFF → assentos 13 e 14 da ida devem aparecer ocupados.
2. Tentar selecionar 13/14 → bloqueado.
3. Venda manual no admin do mesmo evento → continua enxergando os mesmos assentos ocupados (sem regressão).
4. Concorrência: lock temporário criado em uma aba aparece em outra (já funcionava, não regredir).
5. Multi-tenant: a RPC só filtra por `trip_id`, e trips pertencem a uma única empresa via `event_id` — sem vazamento entre empresas.

## Riscos

- Nenhum risco financeiro/Asaas/split tocado.
- Função `SECURITY DEFINER` com `search_path = public` setado, sem dynamic SQL → seguro.
- Realtime continua funcionando como hoje (já implementado na rodada anterior).

## Entregável

- 1 migration SQL (criação da RPC + grant)
- Edição em `src/pages/public/Checkout.tsx` (2 trechos: `fetchOccupiedSeats` e revalidação pré-submit)
- Sem mudança no admin, sem mudança em pagamentos, sem refatoração