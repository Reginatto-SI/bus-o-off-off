# Análise de Ocupação de Poltronas — SmartBus BR

## 1. Resumo executivo

O problema reportado é crítico: passagens vendidas/pagas aparecem como disponíveis no mapa de assentos, com risco operacional de dupla venda.

Pelo código atual, a **fonte de leitura da ocupação** para público e admin é a RPC `get_trip_seat_occupancy`.

Os **caminhos de escrita** da ocupação são diferentes:
- checkout público: `seat_locks` + `sale_passengers` durante o pagamento, e `tickets` após confirmação;
- venda manual admin: `tickets` imediatos no momento da venda/reserva.

A **causa principal mais provável** é inconsistência de materialização e chave de ocupação (`trip_id`, `company_id`, `seat_id`, `seat_label`) entre fluxos, com fragilidade adicional em cenários de volta com `seat_id = null`.

O que ainda falta provar com dados reais:
- incidência de venda paga sem ticket;
- incidência de ticket válido fora da RPC;
- volume de divergências de `seat_id/seat_label`, `trip_id` e `company_id` no banco operacional.

## 2. Fonte de verdade da ocupação

- **RPC usada:** `public.get_trip_seat_occupancy(_trip_id)`
- **Base de implementação analisada:** `supabase/migrations/20260520120000_fix_seat_occupancy_by_trip_segment.sql`
- **Permissão:** `security definer`, com `grant execute` para `anon` e `authenticated`

Tabelas e campos relevantes na leitura:
- `tickets` (`trip_id`, `seat_id`, `seat_label`, `sale_id`, `company_id`)
- `seat_locks` (`trip_id`, `seat_id`, `sale_id`, `company_id`, `expires_at`)
- `sale_passengers` (`trip_id`, `seat_id`, `seat_label`, `sale_id`, `company_id`)
- `sales` (`status`, `company_id`, `id`)
- `seats` (`id`, `label`, `vehicle_id`, `company_id`, `status`)
- `trips` (`id`, `company_id`, `vehicle_id`)

Regras de filtro:
- `trip_id`: segmenta ocupação por trecho.
- `company_id`: join defensivo entre trip/ticket/passenger/lock/seat.

Como cada fonte entra na RPC:
- `tickets`: assento ocupado (exclui venda cancelada).
- `seat_locks` ativos: assento reservado temporariamente (`expires_at > now()`).
- `sale_passengers` sem ticket correspondente: ocupação pré-ticket para status elegíveis.
- assento bloqueado: sinalização por `sales.status='bloqueado'` na composição da RPC e por `seats.status='bloqueado'` no componente.

Diferença de estados no mapa:
- **disponível:** não está em `tickets`, `seat_locks` ativos ou `sale_passengers` elegível, e não está bloqueado.
- **reservado:** lock ativo e/ou passageiro pré-ticket elegível.
- **pago/ocupado:** ticket válido correspondente ao trecho.
- **bloqueado:** bloqueio operacional.

## 3. Fluxo público

1. Usuário seleciona evento e viagem (`trip_id`) no checkout.
2. Carrega mapa de assentos via `get_trip_seat_occupancy`.
3. Seleciona assento e segue com passageiros.
4. Checkout cria bloqueio temporário (`seat_locks`).
5. Checkout cria venda (`sales`) e staging de passageiros (`sale_passengers`).
6. Invoca `create-asaas-payment` para gerar cobrança.
7. Confirmação de pagamento ocorre prioritariamente por webhook (`asaas-webhook`).
8. Se webhook atrasar/falhar, `verify-payment-status` atua como fallback.
9. Ambos convergem para `finalizeConfirmedPayment`.
10. `finalizeConfirmedPayment` atualiza status da venda, cria `tickets` e limpa `seat_locks`.
11. A poltrona deve ficar definitivamente pintada quando o ticket elegível passa a ser retornado pela RPC.

Evidência de código:
- leitura/revalidação pública em `src/pages/public/Checkout.tsx`.
- RPC wrapper em `src/lib/tripSeatOccupancyRpc.ts`.
- finalização em `supabase/functions/_shared/payment-finalization.ts`.

## 4. Venda manual administrativa com taxa

Fluxo identificado em `src/components/admin/NewSaleModal.tsx`:
- cria `sales` com status inicial `reservado`;
- cria `tickets` imediatamente;
- registra `platform_fee_status` (ex.: `pending` quando taxa aplicável);
- cobrança da taxa ocorre depois via fluxo financeiro.

Conclusão funcional:
- pagamento da taxa **não deveria** ser pré-requisito para assento pintar, porque ticket já existe.
- poltrona deveria aparecer ocupada logo após persistência do ticket e leitura da RPC.

Riscos encontrados:
- ticket criado com chave inconsistente (`trip_id`, `company_id`, `seat_id`, `seat_label`) pode não entrar corretamente no mapa.

## 5. Venda manual administrativa sem taxa / empresa piloto

Caminho base também em `NewSaleModal`:
- venda criada no admin;
- ticket criado imediatamente;
- `platform_fee_status` tende a `not_applicable`.

Ausência de dependência Asaas para ocupação:
- nesse fluxo, ocupação deveria depender da existência/consistência do ticket, não de webhook.

Campos obrigatórios para pintar:
- `tickets.trip_id`
- `tickets.company_id`
- `tickets.seat_id` (quando assento físico existe)
- `tickets.seat_label` coerente com seat/layout

Riscos:
- empresas sem taxa podem sofrer o mesmo problema se dados do ticket/trecho estiverem inconsistentes.

## 6. Ida, volta e volta opcional

Separação técnica:
- ida e volta são segmentadas por `trip_id`.

Pontos de risco:
- há cenário em que ticket de volta é criado com `seat_id = null` e `seat_label` sintético (`VOLTA-X`).
- sem `seat_id` físico, bloqueio por assento pode ficar frágil.

Quando a volta pode não pintar:
- quando o ticket de volta não consegue mapear assento físico no trecho atual.

Risco de dupla venda:
- aumenta quando a modelagem da volta não amarra assento físico de forma robusta.

## 7. Ônibus, van e layout de assentos

- componente visual único: `src/components/public/SeatMap.tsx`.
- ônibus e van usam a mesma lógica de renderização; muda dataset de `seats`.
- RPC prioriza `seat_id` e usa fallback por `seat_label`.

Impacto de alteração de layout pós-venda:
- mudança de IDs/labels pode quebrar correspondência histórica do ticket.

Risco de mismatch:
- `seat_id` apontando para assento diferente do `seat_label` persistido.
- assentos antigos removidos ou remapeados após venda.

## 8. Asaas, webhook, verify e finalização

Quando Asaas afeta ocupação:
- checkout público, porque ticket definitivo depende de confirmação/finalização.

Quando não deveria afetar ocupação:
- venda manual com ticket imediato (com ou sem taxa), onde Asaas afeta o financeiro.

Regras observadas:
- webhook é confirmação prioritária;
- verify é fallback;
- ambos convergem para `finalizeConfirmedPayment`.

Papel do `finalizeConfirmedPayment`:
- atualizar venda;
- gerar tickets a partir de `sale_passengers`;
- limpar locks.

Split/sócio/representante/taxa:
- pelo código, falhas financeiras não deveriam impedir ocupação já materializada por ticket.

Diferença entre problema financeiro x ocupação:
- financeiro: status da cobrança/taxa/comissão;
- ocupação: presença consistente de registro elegível para a RPC (principalmente ticket e chave correta).

## 9. Multiempresa, permissões e RLS

Importância de `company_id`:
- joins internos da RPC usam escopo por empresa; divergência pode ocultar assento ocupado.

Público x admin:
- ambos leem a mesma RPC de ocupação.

Risco de RLS/permissão:
- mitigado por `security definer` na RPC para leitura de ocupação.

Risco de dados divergentes:
- `sales`, `tickets`, `sale_passengers`, `seat_locks`, `trips`, `seats` com company/trip inconsistentes podem causar “livre indevido”.

## 10. Risco de dupla venda

**Classificação:** alto.

O que já protege:
- locks temporários no checkout público;
- validações/revalidações no frontend;
- triggers com serialização/advisory lock para cenários com `seat_id`.

O que ainda pode falhar:
- tickets sem `seat_id` em volta;
- divergências de `trip_id`/`company_id`;
- atraso/falha de convergência para ticket no fluxo público.

Tipo de proteção existente:
- visual + transacional.

Risco residual:
- principalmente em cenários com modelagem incompleta do assento físico por trecho.

## 11. Causa mais provável

### 11.1 Causa principal provável

Inconsistência entre dados gravados de ocupação e critérios da RPC (`trip_id`, `company_id`, `seat_id`, `seat_label`) somada à materialização assíncrona no público.

### 11.2 Causas secundárias possíveis

- fluxo de volta com `seat_id = null`;
- venda paga sem ticket em casos de finalização incompleta;
- layout alterado após vendas históricas.

### 11.3 Pontos já descartados ou menos prováveis

- divergência de leitura entre público e admin por fonte diferente (ambos usam a mesma RPC);
- problema puramente visual sem dado inconsistente (menos provável frente ao desenho atual).

## 12. Validação com dados reais

Status atual desta etapa:
- consultas SQL foram preparadas;
- **não foram executadas nesta sessão** por ausência de acesso autenticado ao banco operacional.

Para fechar causa com prova quantitativa, as queries abaixo devem ser executadas em ambiente real (produção/sandbox espelho) e os resultados anexados.

### 12.1 Vendas pagas sem ticket

```sql
select s.id, s.company_id, s.trip_id, s.status, s.asaas_payment_status, s.payment_confirmed_at
from sales s
left join tickets t on t.sale_id = s.id
where s.status = 'pago'
group by s.id, s.company_id, s.trip_id, s.status, s.asaas_payment_status, s.payment_confirmed_at
having count(t.id) = 0;
```

### 12.2 Tickets que não aparecem na RPC

```sql
-- Substituir :trip_id e repetir para múltiplos trechos com e sem incidente
with occ as (
  select * from get_trip_seat_occupancy(:trip_id)
)
select t.id, t.sale_id, t.trip_id, t.company_id, t.seat_id, t.seat_label
from tickets t
left join occ o on o.seat_id = t.seat_id
where t.trip_id = :trip_id
  and t.seat_id is not null
  and o.seat_id is null;
```

### 12.3 Tickets com `seat_id = null`

```sql
select t.id, t.sale_id, t.trip_id, t.company_id, t.seat_id, t.seat_label,
       e.transport_policy, v.type as vehicle_type
from tickets t
join sales s on s.id = t.sale_id
join trips tr on tr.id = t.trip_id
left join events e on e.id = s.event_id
left join vehicles v on v.id = tr.vehicle_id
where t.seat_id is null;
```

### 12.4 Divergência `seat_id` x `seat_label`

```sql
select t.id, t.sale_id, t.trip_id, t.seat_id, t.seat_label, se.label as current_seat_label
from tickets t
left join seats se on se.id = t.seat_id
where t.seat_id is not null
  and (se.id is null or coalesce(t.seat_label, '') <> coalesce(se.label, ''));
```

### 12.5 Divergência de `trip_id`

```sql
select t.id, t.sale_id, t.trip_id as ticket_trip, s.trip_id as sale_trip
from tickets t
join sales s on s.id = t.sale_id
where t.trip_id is null
   or s.trip_id is null
   or t.trip_id <> s.trip_id;

select sp.id, sp.sale_id, sp.trip_id as passenger_trip, s.trip_id as sale_trip
from sale_passengers sp
join sales s on s.id = sp.sale_id
where sp.trip_id is null
   or s.trip_id is null
   or sp.trip_id <> s.trip_id;
```

### 12.6 Divergência de `company_id`

```sql
select t.id, t.sale_id,
       t.company_id as ticket_company,
       s.company_id as sale_company,
       tr.company_id as trip_company
from tickets t
join sales s on s.id = t.sale_id
join trips tr on tr.id = t.trip_id
where t.company_id <> s.company_id
   or t.company_id <> tr.company_id;

select sp.id, sp.sale_id,
       sp.company_id as passenger_company,
       s.company_id as sale_company,
       tr.company_id as trip_company
from sale_passengers sp
join sales s on s.id = sp.sale_id
join trips tr on tr.id = sp.trip_id
where sp.company_id <> s.company_id
   or sp.company_id <> tr.company_id;
```

### 12.7 Locks órfãos, expirados ou conflitantes

```sql
-- expirados/orfãos
select sl.*, s.id as sale_exists
from seat_locks sl
left join sales s on s.id = sl.sale_id
where sl.expires_at <= now() or s.id is null;

-- lock de venda cancelada
select sl.*, s.status
from seat_locks sl
join sales s on s.id = sl.sale_id
where s.status = 'cancelado';

-- lock em assento já ticketado
select sl.id as lock_id, sl.trip_id, sl.seat_id, sl.sale_id,
       t.id as ticket_id, t.sale_id as ticket_sale_id
from seat_locks sl
join tickets t on t.trip_id = sl.trip_id and t.seat_id = sl.seat_id
where sl.expires_at > now();
```

### 12.8 Webhook/verify/finalização incompleta

```sql
-- Asaas confirmado sem venda paga
select s.id, s.status, s.asaas_payment_status, s.payment_confirmed_at
from sales s
where s.asaas_payment_status in ('CONFIRMED','RECEIVED')
  and s.status <> 'pago';

-- venda paga sem log de confirmação
select s.id, s.status, s.asaas_payment_status
from sales s
left join sale_logs l
  on l.sale_id = s.id
 and l.action = 'payment_confirmed'
where s.status = 'pago'
  and l.id is null;

-- amostra de integrações sem finalização explícita (ajustar colunas conforme schema real)
select sil.*
from sale_integration_logs sil
where sil.operation in ('incoming_webhook', 'manual_sync')
order by sil.created_at desc
limit 200;
```

## 13. Matriz de cenários

| Cenário | Fonte que escreve ocupação | Fonte que lê ocupação | Depende Asaas | Depende webhook | Ticket imediato | Usa lock | Risco não pintar | Risco dupla venda | Causa provável | Validação necessária |
|---|---|---|---|---|---|---|---|---|---|---|
| Checkout público Pix | `seat_locks`, `sale_passengers`, depois `tickets` | RPC `get_trip_seat_occupancy` | Sim | Alto | Não | Sim | Alto | Médio/alto | finalização incompleta ou chave inconsistente | 12.1, 12.2, 12.8 |
| Checkout público cartão | `seat_locks`, `sale_passengers`, depois `tickets` | RPC | Sim | Alto | Não | Sim | Alto | Médio/alto | mesma causa do Pix | 12.1, 12.2, 12.8 |
| Venda manual com taxa | `tickets` imediato | RPC | Parcial (financeiro) | Baixo | Sim | Não principal | Médio | Médio | ticket com chave divergente | 12.2, 12.4, 12.5, 12.6 |
| Venda manual sem taxa | `tickets` imediato | RPC | Não (ocupação) | Não | Sim | Não principal | Médio | Médio | inconsistência de ticket/layout | 12.2, 12.4, 12.5, 12.6 |
| Empresa piloto | `tickets` imediato | RPC | Não (ocupação) | Não | Sim | Não principal | Médio | Médio | configuração + dados inconsistentes | 12.2, 12.5, 12.6 |
| Evento apenas ida | trecho único por `trip_id` | RPC | Variável | Variável | Variável | Variável | Médio | Médio | mismatch de chaves no trecho | 12.2, 12.5 |
| Evento ida e volta | `trip_id` separado por trecho | RPC | Variável | Variável | Variável | Variável | Alto na volta | Médio/alto | volta sem seat_id físico | 12.3, 12.5 |
| Volta opcional | semelhante ida/volta | RPC | Variável | Variável | Variável | Variável | Alto | Médio/alto | seat mapping incompleto | 12.3, 12.5 |
| Ônibus | igual por dataset de seats | RPC + SeatMap | Variável | Variável | Variável | Variável | Médio | Médio | dados/chaves | 12.2, 12.4 |
| Van | igual por dataset de seats | RPC + SeatMap | Variável | Variável | Variável | Variável | Médio | Médio | dados/chaves | 12.2, 12.4 |
| Layout antigo | tickets históricos + seats atuais | RPC + SeatMap | Não específico | Não específico | Variável | Variável | Alto | Médio | mudança de layout pós-venda | 12.4 |
| Assento bloqueado | `sales.status='bloqueado'` / `seats.status` | RPC + SeatMap | Não | Não | Não necessário | Pode existir | Baixo/médio | Baixo | conflito de estado | 12.7 |
| Venda cancelada | status cancelado + cleanup | RPC | Não direto | Não direto | n/a | Pode sobrar lock | Médio | Baixo/médio | lock residual ou ticket inconsistente | 12.7, 12.8 |

## 14. Fluxo correto recomendado

Princípios obrigatórios:
- público e admin devem continuar usando a mesma leitura de ocupação (RPC única);
- assento físico deve ser representado por chave robusta de trecho + assento (`trip_id + seat_id`), com coerência por empresa;
- confirmação financeira não deve quebrar ocupação já materializada quando ticket existe.

Fluxo recomendado por cenário:
- **venda pública:** lock imediato, staging consistente, confirmação (webhook/verify), finalização idempotente, ticket criado, lock limpo.
- **manual com taxa:** ticket imediato ocupa assento; taxa afeta financeiro, não ocupação.
- **manual sem taxa/piloto:** ticket imediato ocupa assento sem dependência de Asaas.
- **ida/volta:** cada trecho com `trip_id` próprio e assento físico mapeável.
- **ônibus/van:** mesma regra de ocupação; muda apenas o conjunto de assentos.

## 15. Correção mínima recomendada para próxima etapa

### 15.1 Se o problema for ticket sem `seat_id`

- exigir `seat_id` para assento físico em todos os fluxos aplicáveis;
- tratar explicitamente exceções operacionais sem assento físico.

### 15.2 Se o problema for venda paga sem ticket

- reforçar reconciliação automática e alerta operacional para `sales.status='pago'` sem `tickets`.

### 15.3 Se o problema for RPC ignorando ticket válido

- revisar critérios de join/fallback para casos reais confirmados;
- adicionar auditoria de “ticket fora da RPC”.

### 15.4 Se o problema for layout alterado

- estratégia de compatibilidade histórica (`seat_id`/label) para tickets legados.

### 15.5 Se o problema for `trip_id`/volta

- padronizar preenchimento de `trip_id` por trecho e evitar label sintético sem assento físico.

### 15.6 Se o problema for `company_id`

- reforçar validação transacional no insert/update para impedir divergência de company em registros críticos.

## 16. Possível necessidade de migration de saneamento

Pode ser necessária migration de saneamento histórico, condicionada ao resultado das queries da seção 12.

Possíveis saneamentos:
- preencher/normalizar `seat_id` quando assento físico existir;
- corrigir `trip_id` inconsistente entre venda/ticket/passageiro;
- corrigir `company_id` divergente;
- gerar ticket faltante em venda paga (com trilha de auditoria);
- cancelar/remover lock órfão ou expirado residual;
- reconciliar venda paga sem ocupação refletida.

## 17. Checklist de homologação futura

- [ ] venda pública Pix
- [ ] venda pública cartão
- [ ] venda manual com taxa
- [ ] venda manual sem taxa
- [ ] empresa piloto
- [ ] ida
- [ ] ida e volta
- [ ] volta opcional
- [ ] ônibus
- [ ] van
- [ ] layout antigo
- [ ] assento bloqueado
- [ ] venda cancelada
- [ ] pagamento confirmado por webhook
- [ ] pagamento confirmado por verify
- [ ] pagamento pendente
- [ ] lock expirado
- [ ] tentativa de comprar assento já vendido
- [ ] tentativa simultânea de compra do mesmo assento

## 18. Conclusão final

1. A documentação é suficiente para entender o fluxo atual? **Sim.**
2. A documentação é suficiente para corrigir o bug sem validar banco? **Não.**
3. Qual é a causa mais provável? **Inconsistência de dados de ocupação (trip/company/seat) e casos frágeis de volta com `seat_id = null`, além de possível finalização pública incompleta em parte dos casos.**
4. Qual é a validação mais importante antes da correção? **Medir incidência real de venda paga sem ticket e de ticket válido fora da RPC.**
5. Qual é a correção mínima mais provável? **Endurecer validação de chaves de ocupação (`trip_id`, `company_id`, `seat_id`) e monitorar inconsistências operacionais.**
6. Existe risco real de dupla venda? **Sim, risco residual classificado como alto.**
7. O Asaas é causa direta ou apenas parte do fluxo? **Parte do fluxo; tende a revelar falha de finalização interna quando ticket não materializa.**
8. Venda manual sem taxa depende do Asaas? **Não para ocupação de assento.**
9. O problema parece mais dados, RPC, finalização ou layout? **Principalmente dados + finalização em público, com contribuição de layout/seat mapping em cenários específicos.**
10. Próximo passo recomendado. **Executar validação SQL no ambiente real, consolidar evidências quantitativas e aplicar correção mínima orientada pelos achados.**
