# Análise 7 — Aplicação da migration crítica de ocupação por trecho

## 1) Resumo executivo
- O código da migration `20260520120000_fix_seat_occupancy_by_trip_segment.sql` existe no repositório local.
- Nesta sessão do Lovable/Codex, só há credencial `anon` no `.env` (`SUPABASE_PUBLISHABLE_KEY`), sem `SUPABASE_SERVICE_ROLE_KEY` e sem `supabase` CLI instalada.
- Com isso, **não foi possível aplicar DDL remotamente** (create/replace function + triggers) a partir deste ambiente.
- A validação de runtime da RPC no ambiente atual ainda retorna `24/24/0` para os três trips, padrão compatível com regra antiga agregada por veículo/evento.

## 2) Status da migration
- Arquivo presente localmente: `supabase/migrations/20260520120000_fix_seat_occupancy_by_trip_segment.sql`.
- **Status no banco remoto atual:** não comprovadamente aplicado.
- Evidência: sem permissão de DDL via chave anon e sem ferramenta de deploy conectada.

## 3) Definição atual da RPC (no ambiente validado)
- Não foi possível extrair `pg_get_functiondef` com papel anon.
- Evidência comportamental da RPC ativa:
  - ida `bee273ac-04cb-452b-b071-93453151630e` => 24
  - volta mesmo veículo `8d0b7934-656e-4117-bf72-07c211f05778` => 24
  - volta veículo diferente `295a4c2a-e1e9-4aa1-b7b4-6e1bc50dd08f` => 0
- Esse padrão indica que a função ativa ainda parece compartilhar ocupação entre ida/volta no mesmo veículo.

## 4) Resultado antes da migration
- Antes: padrão observado `24 / 24 / 0` (ida / volta mesmo veículo / volta veículo diferente).

## 5) Resultado depois da migration
- **Não disponível nesta sessão**, porque não foi possível aplicar migration no banco remoto a partir deste ambiente.

## 6) Comparação ida x volta
- Resultado atual (runtime): ida e volta com mesmo veículo retornam mesma ocupação.
- Isso não comprova separação estrita por `trip_id` no ambiente real.

## 7) Validação da proteção final por `trip_id + seat_id`
- No código SQL local, a regra por `trip_id + seat_id` está implementada (RPC e triggers).
- No ambiente remoto atual, a ativação dessa versão não pôde ser comprovada sem credencial de alteração de schema.

## 8) Riscos restantes
- Risco de bloqueio cruzado entre ida/volta em viagens com mesmo veículo permanece enquanto a versão nova não for confirmada ativa no banco.
- Risco de homologar falso-positivo: frontend correto consumindo RPC antiga.

## 9) Conclusão objetiva
- **Não é possível declarar correção ativa no ambiente real nesta sessão.**
- Próximo passo obrigatório: aplicar a migration no ambiente alvo com credencial administrativa (service role/DB owner) e repetir validação dos 3 trips.

## Respostas obrigatórias (objetivas)
1. Migration aplicada no ambiente atual? **Não comprovado; provável que não.**
2. RPC ativa é versão nova? **Não comprovado; comportamento sugere versão antiga.**
3. RPC ainda usa agregação por evento+veículo+empresa? **Comportamento indica que sim.**
4. RPC agora respeita `trip_id`? **Não comprovado em runtime atual.**
5. Assentos da ida após tentativa de validação: **24**.
6. Assentos da volta mesmo veículo após tentativa de validação: **24**.
7. Assentos da volta veículo diferente após tentativa de validação: **0**.
8. Existe bloqueio indevido entre ida e volta? **Risco permanece.**
9. Validação final anti-duplicidade usa `trip_id + seat_id`? **Implementada no SQL local; ativação remota não comprovada.**
10. Checkout/admin continuam usando a mesma RPC? **Sim, no código frontend atual.**
11. Bug pode ser considerado corrigido após esta validação? **Ainda não no ambiente atual.**
