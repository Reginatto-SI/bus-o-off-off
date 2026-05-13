## Causa raiz (não é cache)

A correção anterior consertou só **um lado** do problema. Existem **duas funções** que calculam ocupação de assentos no checkout público — corrigi a primeira, mas a segunda continua quebrada para usuários anônimos.

### O que está acontecendo

A função `public.get_trip_available_capacity(trip_uuid)` é a que alimenta:

- O número de "vagas disponíveis" mostrado na listagem de viagens (`PublicEventDetail.tsx`, linha 131)
- A validação de capacidade total no checkout (`Checkout.tsx`, linhas 1116 e 1144)

Olhando o corpo dela no banco:

```sql
SELECT t.capacity - COUNT(tickets WHERE trip_id = ...)
FROM trips
```

Ela é `SECURITY INVOKER` (executa com a permissão de quem chama) e lê `public.tickets` direto. Como `tickets` **não tem policy de SELECT para `anon`**, o `COUNT(*)` retorna **0** para qualquer usuário não logado → a viagem aparece com **capacidade total livre**.

### Por que desktop "funciona" e mobile não

Não é mobile vs desktop — é **logado vs deslogado**:

- Quando você abre a vitrine no editor/Lovable, normalmente está logado como admin/developer → RLS deixa contar os `tickets` → vagas corretas.
- Quando você ou seus colegas abrem do celular (sem login), cai no caso anônimo → `COUNT = 0` → tudo livre.
- Aba anônima no desktop também reproduziria o bug, se testar com cuidado.

A correção da RPC `get_trip_seat_occupancy` (pintar poltronas) já está OK. O que falta é o **contador de vagas** e a **validação de capacidade**, que ainda dependem da função antiga.

## Plano de correção

### 1. Migration — tornar `get_trip_available_capacity` segura para anônimos

Recriar a função como `SECURITY DEFINER` com `search_path = public`, mantendo:

- Mesma assinatura (`trip_uuid uuid → integer`)
- Mesma lógica (`capacity - count(tickets)`)
- `GRANT EXECUTE ... TO anon, authenticated`
- Restringir leitura a viagens cujo evento esteja em `status = 'a_venda'` (mesma proteção que apliquei na RPC de ocupação), para não vazar contagens de eventos privados

Sem mudar nome, sem criar função paralela, sem tocar no frontend.

### 2. Validação no banco

Após a migration, rodar:

```sql
select public.get_trip_available_capacity('4adf0037-f595-4943-ac24-1099e054e521');
```

como `anon` e conferir que retorna `capacity - 2` (e não `capacity`).

### 3. Validação visual

- Abrir o evento BUSAO OFF OFF em **aba anônima no celular**.
- Confirmar que:
  - a viagem com vendas mostra menos vagas disponíveis no card de seleção
  - o seat map continua pintando 13 e 14 como ocupados
  - tentar selecionar quantidade maior que a disponível é bloqueado
- Repetir em outro evento qualquer com vendas pagas, para garantir.

### 4. Sem alteração no frontend

Nenhum componente, hook ou tipagem muda. A função continua sendo chamada do mesmo jeito em `PublicEventDetail.tsx` e `Checkout.tsx`.

## Riscos

- **Baixíssimo**: a função já existia e era usada nesses mesmos pontos. Só estamos garantindo que ela retorne o valor correto para anônimos.
- Não toca em RLS direta de `tickets`, não muda nenhum fluxo de venda, não impacta multi-tenant (a função é por `trip_id`, e `trip` já carrega `company_id` implícito via evento).
- Não cria fluxo paralelo — mesma função, mesma assinatura.

## Próximo passo após aprovar

Crio a migration única e peço a sua aprovação para rodar. Depois disso o problema do mobile deve sumir sem nenhum ajuste de cache.
