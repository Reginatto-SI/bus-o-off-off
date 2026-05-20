# Validação de Dados Reais — Ocupação de Poltronas (SmartBus BR)

## 1. Objetivo desta validação

Este documento complementa a análise principal (`analise-ocupacao-poltronas-fluxo-atual-e-fluxo-correto.md`) com foco operacional:
- transformar hipóteses em evidências quantitativas;
- identificar inconsistências reais que expliquem “passagem vendida/paga aparecendo disponível”;
- recomendar a correção mínima com base em dados.

## 2. Escopo e limitação atual

### 2.1 Escopo
- validações em `sales`, `tickets`, `sale_passengers`, `seat_locks`, `trips`, `seats`;
- cruzamento com logs (`sale_logs`, `sale_integration_logs`, `asaas_webhook_event_dedup` quando aplicável);
- comparação com regra da RPC `get_trip_seat_occupancy`.

### 2.2 Limitação desta execução
Nesta sessão de repositório local não há acesso autenticado ao banco operacional (produção/sandbox) para executar SQL real.

Portanto:
- as consultas abaixo estão prontas para execução;
- os campos de resultado estão estruturados para preenchimento por suporte/dev após execução.

## 3. Como executar no ambiente real

1. Abrir Supabase SQL Editor no ambiente alvo (sandbox primeiro, depois produção).
2. Rodar consultas na ordem 4.1 → 4.10.
3. Salvar evidências por consulta:
   - timestamp;
   - quantidade total;
   - IDs exemplo;
   - empresa/evento/trip impactados.
4. Repetir amostra por cenário:
   - 5 trips com incidente reportado;
   - 5 trips sem incidente (grupo de controle).
5. Atualizar seções 5 e 6 com resultados e conclusão.

## 4. Consultas de validação obrigatórias

### 4.1 Existem vendas pagas sem ticket?

```sql
select s.id, s.company_id, s.event_id, s.trip_id, s.status, s.asaas_payment_status, s.payment_confirmed_at
from sales s
left join tickets t on t.sale_id = s.id
where s.status = 'pago'
group by s.id, s.company_id, s.event_id, s.trip_id, s.status, s.asaas_payment_status, s.payment_confirmed_at
having count(t.id) = 0
order by s.payment_confirmed_at desc nulls last;
```

Preencher resultado:
- Quantidade encontrada:
- Exemplos:
- Impacta mais: checkout público / manual com taxa / manual sem taxa / piloto

### 4.2 Existem tickets válidos que não aparecem na RPC?

```sql
-- Substituir :trip_id e repetir por amostra
with occ as (
  select * from get_trip_seat_occupancy(:trip_id)
)
select t.id, t.sale_id, t.trip_id, t.company_id, t.seat_id, t.seat_label
from tickets t
left join occ o on o.seat_id = t.seat_id
where t.trip_id = :trip_id
  and t.seat_id is not null
  and o.seat_id is null
order by t.id;
```

Preencher resultado:
- Quantidade encontrada por trip:
- Principais padrões: ticket / RPC / trip_id / seat_id / seat_label / company_id / layout

### 4.3 Existem tickets com `seat_id = null`?

```sql
select t.id, t.sale_id, t.trip_id, t.company_id, t.seat_id, t.seat_label,
       e.transport_policy,
       case when tr.direction = 'ida' then 'ida'
            when tr.direction = 'volta' then 'volta'
            else 'nao_classificado' end as trip_direction,
       v.type as vehicle_type,
       s.sale_origin
from tickets t
join sales s on s.id = t.sale_id
join trips tr on tr.id = t.trip_id
left join events e on e.id = s.event_id
left join vehicles v on v.id = tr.vehicle_id
where t.seat_id is null
order by t.id desc;
```

Preencher resultado:
- Quantidade total:
- Distribuição: ida / volta / volta opcional
- Distribuição: ônibus / van
- Distribuição: venda pública / venda manual
- Pode causar assento vendido disponível? sim/não + evidência

### 4.4 Divergência `seat_id` x `seat_label`

```sql
select t.id, t.sale_id, t.trip_id, t.company_id,
       t.seat_id, t.seat_label,
       se.label as current_seat_label,
       se.vehicle_id
from tickets t
left join seats se on se.id = t.seat_id
where t.seat_id is not null
  and (se.id is null or coalesce(t.seat_label, '') <> coalesce(se.label, ''))
order by t.id desc;
```

Preencher resultado:
- Quantidade encontrada:
- Assento inexistente no layout atual:
- Mismatch de label:
- Indício de quebra por layout alterado: sim/não

### 4.5 Divergência de `trip_id`

```sql
select t.id, t.sale_id, t.trip_id as ticket_trip, s.trip_id as sale_trip, s.company_id
from tickets t
join sales s on s.id = t.sale_id
where t.trip_id is null or s.trip_id is null or t.trip_id <> s.trip_id
order by t.id desc;

select sp.id, sp.sale_id, sp.trip_id as passenger_trip, s.trip_id as sale_trip, s.company_id
from sale_passengers sp
join sales s on s.id = sp.sale_id
where sp.trip_id is null or s.trip_id is null or sp.trip_id <> s.trip_id
order by sp.id desc;
```

Preencher resultado:
- Tickets com trip divergente:
- Sale_passengers com trip divergente:
- Indício de ida lida na volta (ou vice-versa): sim/não

### 4.6 Divergência de `company_id`

```sql
select t.id, t.sale_id,
       t.company_id as ticket_company,
       s.company_id as sale_company,
       tr.company_id as trip_company
from tickets t
join sales s on s.id = t.sale_id
join trips tr on tr.id = t.trip_id
where t.company_id <> s.company_id or t.company_id <> tr.company_id
order by t.id desc;

select sp.id, sp.sale_id,
       sp.company_id as passenger_company,
       s.company_id as sale_company,
       tr.company_id as trip_company
from sale_passengers sp
join sales s on s.id = sp.sale_id
join trips tr on tr.id = sp.trip_id
where sp.company_id <> s.company_id or sp.company_id <> tr.company_id
order by sp.id desc;
```

Preencher resultado:
- Divergências em tickets:
- Divergências em sale_passengers:
- RPC pode ignorar ocupação por isolamento multiempresa? sim/não + evidência

### 4.7 Locks expirados, órfãos ou conflitantes

```sql
-- locks expirados/orfãos
select sl.id, sl.sale_id, sl.trip_id, sl.seat_id, sl.company_id, sl.expires_at, s.id as sale_exists
from seat_locks sl
left join sales s on s.id = sl.sale_id
where sl.expires_at <= now() or s.id is null
order by sl.expires_at asc;

-- locks de venda cancelada
select sl.id, sl.sale_id, sl.trip_id, sl.seat_id, sl.company_id, s.status
from seat_locks sl
join sales s on s.id = sl.sale_id
where s.status = 'cancelado'
order by sl.id desc;

-- locks em assento já ticketado
select sl.id as lock_id, sl.sale_id as lock_sale_id, sl.trip_id, sl.seat_id,
       t.id as ticket_id, t.sale_id as ticket_sale_id
from seat_locks sl
join tickets t on t.trip_id = sl.trip_id and t.seat_id = sl.seat_id
where sl.expires_at > now()
order by sl.id desc;
```

Preencher resultado:
- Locks expirados/orfãos:
- Locks de cancelada:
- Locks conflitantes com ticket:
- Pode causar indisponibilidade indevida? sim/não
- Pode causar disponibilidade indevida? sim/não

### 4.8 Asaas confirmado sem finalização completa

```sql
-- Asaas confirmado e venda não paga
select s.id, s.company_id, s.status, s.asaas_payment_status, s.payment_confirmed_at
from sales s
where s.asaas_payment_status in ('CONFIRMED','RECEIVED')
  and s.status <> 'pago'
order by s.id desc;

-- venda paga sem log de confirmação
select s.id, s.company_id, s.status, s.asaas_payment_status
from sales s
left join sale_logs l on l.sale_id = s.id and l.action = 'payment_confirmed'
where s.status = 'pago'
  and l.id is null
order by s.id desc;

-- trilha de webhook/verify (ajustar nomes de coluna conforme schema real)
select sil.*
from sale_integration_logs sil
where sil.operation in ('incoming_webhook', 'manual_sync')
order by sil.created_at desc
limit 500;
```

Preencher resultado:
- Asaas confirmado sem venda paga:
- Venda paga sem log de confirmação:
- Evidência de webhook sem finalização:
- Evidência de verify sem ticket:

### 4.9 Venda manual com taxa: ticket antes da taxa?

```sql
-- Ajustar `sale_origin` conforme valores reais do ambiente
select s.id, s.company_id, s.status, s.platform_fee_status,
       min(t.created_at) as first_ticket_at,
       s.created_at as sale_created_at,
       s.platform_fee_paid_at
from sales s
left join tickets t on t.sale_id = s.id
where s.sale_origin in ('admin_manual')
group by s.id, s.company_id, s.status, s.platform_fee_status, s.created_at, s.platform_fee_paid_at
order by s.created_at desc;
```

Preencher resultado:
- Ticket criado antes da taxa? sim/não
- RPC reconhece antes da taxa? sim/não (validar por 4.2)
- Pagar taxa altera ocupação? sim/não

### 4.10 Venda manual sem taxa / empresa piloto

```sql
select s.id, s.company_id, s.status, s.platform_fee_status,
       t.id as ticket_id, t.trip_id, t.seat_id, t.seat_label, t.company_id as ticket_company
from sales s
left join tickets t on t.sale_id = s.id
where s.sale_origin in ('admin_manual')
  and coalesce(s.platform_fee_status, 'not_applicable') = 'not_applicable'
order by s.id desc;
```

Preencher resultado:
- Tickets criados corretamente? sim/não
- Chaves corretas (`trip_id`, `company_id`, `seat_id`, `seat_label`)? sim/não
- Incidência maior em empresas sem taxa? sim/não

## 5. Quadro de respostas objetivas

1. Existem vendas pagas sem ticket?
- Status: pendente de execução
- Resultado:

2. Existem tickets válidos que não aparecem na RPC?
- Status: pendente de execução
- Resultado:

3. Existem tickets com `seat_id = null`?
- Status: pendente de execução
- Resultado:

4. Esses tickets com `seat_id = null` estão ligados a volta/volta opcional?
- Status: pendente de execução
- Resultado:

5. Existem tickets com `trip_id` nulo/errado?
- Status: pendente de execução
- Resultado:

6. Existem divergências de `company_id`?
- Status: pendente de execução
- Resultado:

7. Existem locks expirados, órfãos ou conflitantes?
- Status: pendente de execução
- Resultado:

8. Existem vendas Asaas confirmadas sem finalização?
- Status: pendente de execução
- Resultado:

9. Existem vendas manuais com ticket criado não reconhecido pela RPC?
- Status: pendente de execução
- Resultado:

10. Existe evidência real de risco de dupla venda?
- Status: pendente de execução
- Resultado:

## 6. Conclusão operacional (preencher após execução)

### 6.1 Causa mais provável com evidência
- Resultado:

### 6.2 A documentação principal já pode ser considerada oficial?
- Resultado: sim para arquitetura/fluxo; validação quantitativa depende da execução SQL.

### 6.3 Bug mais provável em
- dados / RPC / finalização / layout / venda manual
- Resultado:

### 6.4 Correção mínima recomendada
- Resultado:

### 6.5 Necessidade de migration de saneamento histórico
- Resultado:

### 6.6 Precisa ajustar RPC?
- Resultado:

### 6.7 Precisa ajustar `finalizeConfirmedPayment`?
- Resultado:

### 6.8 Precisa ajustar venda manual?
- Resultado:

### 6.9 Precisa ajustar layout/SeatMap?
- Resultado:

## 7. Recomendação de execução imediata

1. Executar consultas 4.1 → 4.10 no sandbox com dados representativos.
2. Repetir em produção com janela controlada e coleta de evidências.
3. Classificar achados por severidade:
   - Crítico: pago sem ticket, ticket fora da RPC, duplicidade no mesmo assento/trecho;
   - Alto: `seat_id = null` em trecho que deveria ter assento físico;
   - Médio: mismatch de label/layout antigo;
   - Baixo: lock residual sem impacto de compra.
4. Somente após esse fechamento quantitativo, abrir task de correção mínima.
