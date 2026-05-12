## Diagnóstico

Investiguei o fluxo de disponibilidade de assentos em `src/pages/public/Checkout.tsx`, `src/components/admin/NewSaleModal.tsx` e a finalização de pagamento em `supabase/functions/_shared/payment-finalization.ts`.

A regra de fundo está correta:
- Pagamento confirmado (webhook/verify) cria `tickets` para a venda.
- Checkout público considera `tickets` + `seat_locks` ativos por `trip_id`.
- Bloqueios operacionais (`sales.status = 'bloqueado'`) são separados visualmente.

Porém existem três lacunas reais que reproduzem a queixa do usuário ("comprei e a poltrona não aparece marcada / outra pessoa pode comprar"):

1. **Sem refresh automático no mapa público.** `fetchOccupiedSeats` só roda no mount e na revalidação do submit. Não há realtime nem polling. Quem fica na aba aberta nunca vê outras compras chegando, e quem volta pela vitrine pode bater em cache de navegação. Isso cria a sensação de "minha poltrona não está marcada".

2. **Venda manual em `/admin/vendas` ignora `seat_locks`.** Em `NewSaleModal.tsx` (linhas 549-563) só lê `tickets`. Um admin consegue selecionar um assento que está reservado por um checkout público em andamento (lock válido, ainda sem ticket). Quando o cliente público confirma o pagamento, há colisão: dois caminhos tentam ocupar o mesmo assento.

3. **Não há proteção transacional contra dupla venda do mesmo assento.** A `tickets` provavelmente não tem índice único por `(trip_id, seat_id)` excluindo bloqueios/cancelados, então a corrida só é evitada pela concorrência otimista do `seat_locks` (que tem unique constraint). Se a colisão acontecer entre admin (sem lock) e checkout público (com lock), a tabela aceita os dois.

Diferença entre "reservado" e "vendido" hoje: reservado = `seat_lock` ativo (pré-pagamento). Vendido = `tickets` gerado após `pago`. A UI pública trata os dois como "ocupado" (cinza/usuário), sem diferenciação visual — está dentro do escopo aceitável, mas pode ser melhorado.

## Mudanças propostas (mínimas e seguras)

### 1. Realtime + refresh on focus no checkout público
Arquivo: `src/pages/public/Checkout.tsx`
- Adicionar canal Supabase Realtime em `tickets` e `seat_locks` filtrado por `trip_id`, chamando `fetchOccupiedSeats(tripId, () => true)` em qualquer INSERT/UPDATE/DELETE.
- Adicionar listener `visibilitychange` / `focus` para re-buscar quando a aba volta ao foco (cobre o caso "voltei pela vitrine após pagar").
- Habilitar realtime via migração: `ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets, public.seat_locks;` (verificar primeiro se já está incluído, para não duplicar).

### 2. Venda manual considera `seat_locks` ativos
Arquivo: `src/components/admin/NewSaleModal.tsx` (bloco 547-605)
- Adicionar busca paralela em `seat_locks` ativos por `trip_id` (`expires_at > now()`), filtrando por `company_id`, e marcar esses assentos como `blockedSeatIds` (visual âmbar "Reservado") para evitar venda manual sobre um lock público em andamento.
- Aplicar a mesma checagem na revalidação imediatamente antes de gravar tickets do admin (linhas ~915-1063), abortando com mensagem clara se algum assento ficou indisponível durante o preenchimento.

### 3. Proteção transacional contra dupla venda
Migração: criar índice único parcial em `tickets`:
```sql
create unique index if not exists tickets_trip_seat_unique
  on public.tickets (trip_id, seat_id)
  where seat_id is not null;
```
Isso garante: mesmo se admin e checkout público corrigirem para o mesmo assento ao mesmo tempo, o segundo INSERT falha. O frontend já faz rollback em erro, então a falha é tratada como "assento acabou de ser ocupado" com toast claro.

Se a base já tiver duplicidades históricas, a migração tenta criar `CONCURRENTLY` falha; nesse caso aplicar limpeza prévia (não esperado em base saudável).

### 4. Mensagens claras (já parcialmente existem)
- No 23505 do `seat_locks` ou do índice novo de tickets (no checkout público e no admin), mostrar: "Esta poltrona acabou de ser reservada ou vendida. Escolha outra poltrona disponível." e re-disparar `fetchOccupiedSeats`.
- Quando lock expira: mensagem "Sua reserva expirou. Selecione a poltrona novamente para continuar." (já há toast equivalente — apenas padronizar texto se diferente).

### 5. Pequena melhoria visual (opcional, sem refactor)
`src/components/public/SeatButton.tsx` já distingue `occupied` (ícone usuário) e `blocked` (ícone Ban âmbar). Ajustar `SeatMap.tsx` para mapear `seat_locks` (sem ticket) → estado `blocked` (âmbar = "Reservado"), e tickets pagos → `occupied` (cinza = "Ocupado"). Reaproveita componentes existentes; só muda como o array é montado em `fetchOccupiedSeats`. Atualizar `SeatLegend` se necessário.

## Verificações

- Testes unitários existentes em `feeCalculator.test.ts`, `checkoutFinancialIntegrity.test.ts` continuam passando (não tocados).
- Cenários manuais 1-5 listados pelo usuário (compra confirmada, duas abas, admin × público, lock expirado, cancelamento).
- Confirmar via `supabase--read_query` que a publicação realtime tem `tickets` e `seat_locks` antes de adicionar à migração (evita erro idempotente).

## Arquivos impactados

- `src/pages/public/Checkout.tsx` — realtime + focus refresh, mensagens.
- `src/components/admin/NewSaleModal.tsx` — incluir seat_locks na consulta + revalidação.
- `src/components/public/SeatMap.tsx` (opcional) — diferenciar reservado vs ocupado.
- `supabase/migrations/*.sql` — índice único parcial em tickets + ALTER PUBLICATION (se faltar).

## Riscos

- Realtime aumenta consumo de canais; mitigação: 1 canal por trip, com cleanup no unmount.
- Índice único pode rejeitar inserts em bases com duplicidades históricas — verificar antes via query.
- Admin sentindo "assento sumiu" porque entrou em lock público; mitigado pela mensagem clara e refresh.